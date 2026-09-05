import { NextResponse } from "next/server";
import Stripe from "stripe";
import { stripeConfig } from "@/lib/env";
import { constructStripeWebhookEvent } from "@/lib/providers/payments/stripe/client";
import { getAuthorization } from "@/lib/providers/payments/stripe/authorization";
import { verifyAndApplyAuthorization } from "@/lib/checkout-saga/payment";
import { progressCapturedCheckoutAttempt } from "@/lib/checkout-saga/capture";
import { claimWebhookEvent, completeWebhookClaim, failWebhookClaim } from "@/lib/webhooks/claim";
import { prisma } from "@/lib/db";

/**
 * Fase 3A §11/§12/§13, extended Fase 3B.1 §5/§6 — the real Stripe TEST
 * webhook. Verifies Stripe-Signature against STRIPE_WEBHOOK_SECRET before
 * trusting anything in the body (§11 — never JSON without both),
 * processes only the minimum event set this phase actually needs (never
 * indiscriminately — §11), and NEVER trusts the event's embedded
 * PaymentIntent object as the final word — it re-fetches fresh from
 * Stripe (§13).
 *
 * Fase 3B.1 §6 — idempotency is now a real atomic claim
 * (claimWebhookEvent, src/lib/webhooks/claim.ts) rather than Fase 3A's
 * original read-marker-then-process-then-write-marker: two genuinely
 * concurrent deliveries of the SAME event.id can no longer both pass a
 * "not yet processed" check before either writes anything — only the
 * request whose INSERT wins the race actually runs the event's logic.
 * The CheckoutAttemptEvent.providerEventId marker below still exists
 * too, for the audit trail (and as a second, redundant safety net) — but
 * the CLAIM is what decides whether processing runs at all.
 *
 * Fase 3B.1 §5 — payment_intent.succeeded is now handled: it means a
 * capture actually completed (ours or, in principle, a webhook arriving
 * before the browser's own confirmation call returns), so it drives the
 * SAME capture->finalize->confirmed progression
 * (progressCapturedCheckoutAttempt, capture.ts) the browser-triggered
 * path uses — never depending exclusively on the browser having stayed
 * open (§5 "no depender exclusivamente del browser").
 *
 * Still no capture is ever TRIGGERED from this route for the
 * authorization-only events below (amount_capturable_updated/
 * payment_failed/canceled) — those only ever verify/apply an
 * AUTHORIZATION via verifyAndApplyAuthorization, exactly as Fase 3A left
 * them. No Nuitee BOOK, no Duffel Order, ever, from this route.
 */
const HANDLED_EVENT_TYPES = new Set<string>([
  "payment_intent.amount_capturable_updated",
  "payment_intent.payment_failed",
  "payment_intent.canceled",
  "payment_intent.succeeded",
]);

export async function POST(req: Request) {
  if (!stripeConfig.webhookSecret) {
    return NextResponse.json({ error: "Stripe webhook not configured" }, { status: 501 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe-Signature header" }, { status: 400 });
  }

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = constructStripeWebhookEvent(rawBody, signature);
  } catch {
    // §11 — an invalid/unverifiable signature is never processed, no
    // matter what the payload claims.
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (!HANDLED_EVENT_TYPES.has(event.type)) {
    return NextResponse.json({ received: true, handled: false });
  }

  // §6 — the atomic claim: only the request that actually inserts this
  // event.id's row proceeds to process it. "in_progress" (another
  // concurrent delivery already owns it) and "already_completed" (a
  // prior delivery already ran this event to completion) both return 200
  // without reprocessing — Stripe should not retry either case.
  const claim = await claimWebhookEvent(event.id);
  if (claim !== "claimed") {
    return NextResponse.json({ received: true, deduplicated: true, claim });
  }

  try {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    const attempt = await prisma.checkoutAttempt.findFirst({ where: { stripePaymentIntentId: paymentIntent.id } });
    if (!attempt) {
      // Nothing in this database references this PaymentIntent — not an
      // error (could be a stale/foreign TEST event), just nothing to do.
      await completeWebhookClaim(event.id);
      return NextResponse.json({ received: true, handled: false });
    }

    let outcome: string;
    if (event.type === "payment_intent.succeeded") {
      // §5 — a capture actually completed: drive the same
      // capture->finalize->confirmed progression the browser path uses,
      // never a bare authorization check.
      const progressResult = await progressCapturedCheckoutAttempt(attempt.id);
      outcome = progressResult.outcome;
    } else {
      // §13 — never trust the event's embedded object as the final word:
      // a fresh, authoritative read from Stripe is what
      // verifyAndApplyAuthorization actually cross-checks against this
      // CheckoutAttempt.
      const fresh = await getAuthorization(paymentIntent.id);
      const verifyResult = await verifyAndApplyAuthorization(attempt.id, fresh);
      outcome = verifyResult.outcome;
    }

    // Audit-trail marker — best-effort; a unique-constraint collision
    // here just means a genuinely-concurrent duplicate delivery already
    // recorded the same marker (shouldn't happen now that the claim
    // above already serializes concurrent deliveries, but harmless
    // either way).
    try {
      await prisma.checkoutAttemptEvent.create({
        data: { checkoutAttemptId: attempt.id, type: "payment_webhook_processed", providerReference: paymentIntent.id, providerEventId: event.id, sanitizedDetail: JSON.stringify({ eventType: event.type, outcome }) },
      });
    } catch {
      // already marked — fine.
    }

    await completeWebhookClaim(event.id);
    return NextResponse.json({ received: true, outcome });
  } catch (err) {
    // §6 — a genuine processing failure leaves the claim in `failed`, so
    // Stripe's own retry of this same event.id can reclaim and try again
    // rather than being permanently stuck as "in progress" forever.
    await failWebhookClaim(event.id);
    throw err;
  }
}
