import { NextResponse } from "next/server";
import Stripe from "stripe";
import { stripeConfig } from "@/lib/env";
import { constructStripeWebhookEvent } from "@/lib/providers/payments/stripe/client";
import { getAuthorization } from "@/lib/providers/payments/stripe/authorization";
import { verifyAndApplyAuthorization } from "@/lib/checkout-saga/payment";
import { prisma } from "@/lib/db";

/**
 * Fase 3A §11/§12/§13 — the real Stripe TEST webhook. Verifies
 * Stripe-Signature against STRIPE_WEBHOOK_SECRET before trusting
 * anything in the body (§11 — never JSON without both), processes only
 * the minimum event set this phase actually needs (never indiscriminately —
 * §11), is idempotent per Stripe event.id (§12 — via
 * CheckoutAttemptEvent.providerEventId's unique constraint, no separate
 * dedup table), and NEVER trusts the event's embedded PaymentIntent
 * object as the final word — it re-fetches fresh from Stripe (§13) and
 * hands that to verifyAndApplyAuthorization, the ONE place that
 * cross-checks id/amount/currency/capture_method/metadata before ever
 * transitioning CheckoutAttempt to PAYMENT_AUTHORIZED.
 *
 * Deliberately still does not (and this phase must not): capture
 * anything, book a hotel, issue a flight Order, or create a Booking.
 */
const HANDLED_EVENT_TYPES = new Set<string>(["payment_intent.amount_capturable_updated", "payment_intent.payment_failed", "payment_intent.canceled"]);

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

  // §12 — idempotency check (read, not claim-then-act): if this exact
  // Stripe event.id already has a marker row, the FIRST delivery already
  // ran to completion (the marker is only ever written AFTER successful
  // processing below) — redeliver 200 without reprocessing. Ordering the
  // check as read-then-process-then-mark (rather than claim-before-
  // processing) matters: if processing throws, no marker is written, so
  // a genuine retry from Stripe after a transient failure is NOT
  // silently swallowed as "already handled".
  const alreadyProcessed = await prisma.checkoutAttemptEvent.findUnique({ where: { providerEventId: event.id } });
  if (alreadyProcessed) {
    return NextResponse.json({ received: true, deduplicated: true });
  }

  const paymentIntent = event.data.object as Stripe.PaymentIntent;
  const attempt = await prisma.checkoutAttempt.findFirst({ where: { stripePaymentIntentId: paymentIntent.id } });
  if (!attempt) {
    // Nothing in this database references this PaymentIntent — not an
    // error (could be a stale/foreign TEST event), just nothing to do.
    return NextResponse.json({ received: true, handled: false });
  }

  // §13 — never trust the event's embedded object as the final word: a
  // fresh, authoritative read from Stripe is what verifyAndApplyAuthorization
  // actually cross-checks against this CheckoutAttempt.
  const fresh = await getAuthorization(paymentIntent.id);
  const outcome = await verifyAndApplyAuthorization(attempt.id, fresh);

  // Mark this event.id processed only now that handling completed
  // without throwing — a deterministic "rejected" outcome (a mismatch)
  // still counts as completed processing (retrying wouldn't change it),
  // so it's marked too. Wrapped: verifyAndApplyAuthorization is itself
  // idempotent (see its own doc comment), so a unique-constraint
  // collision here just means a genuinely-concurrent duplicate delivery
  // already recorded the same marker a moment earlier — not an error.
  try {
    await prisma.checkoutAttemptEvent.create({
      data: { checkoutAttemptId: attempt.id, type: "payment_webhook_processed", providerReference: paymentIntent.id, providerEventId: event.id, sanitizedDetail: JSON.stringify({ eventType: event.type, outcome: outcome.outcome }) },
    });
  } catch {
    // already marked by a concurrent delivery — fine.
  }

  return NextResponse.json({ received: true, outcome: outcome.outcome });
}
