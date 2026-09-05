import type { CheckoutAttempt } from "@prisma/client";
import { prisma } from "@/lib/db";
import { stripeConfig } from "@/lib/env";
import { transitionCheckoutAttempt } from "./transitions";
import { recordCheckoutAttemptEvent } from "./events";
import { parseFinalQuoteSnapshot } from "./finalQuoteSnapshot";
import { finalizeConfirmedCheckoutAttempt, type FinalizeResult } from "./finalize";
import { toStripeMinorUnits } from "@/lib/providers/payments/stripe/amount";
import { paymentIntentCaptureIdempotencyKey } from "@/lib/providers/payments/stripe/idempotency";
import { getAuthorization, captureAuthorization } from "@/lib/providers/payments/stripe/authorization";
import type { PaymentAuthorization } from "@/lib/providers/payments/stripe/types";

/**
 * Fase 3B.1 — TICKET_ONLY only, drives PAYMENT_AUTHORIZED all the way to
 * CONFIRMED: fulfilling (a no-op for TICKET_ONLY — there is no external
 * provider to call) -> payment_capturing (a real Stripe TEST capture) ->
 * finalizing (confirm the TicketHold, create the Booking) -> confirmed.
 *
 * TICKET_HOTEL and TICKET_HOTEL_FLIGHT are deliberately NEVER progressed
 * past PAYMENT_AUTHORIZED here (§17 of this phase's brief) — hotel/flight
 * fulfillment doesn't exist yet, so capturing money for them would leave
 * a paid-but-unfulfillable order. createPaymentAuthorization (payment.ts)
 * already refuses to create a NEW authorization for those modalities;
 * this file's own barrier check is the second, independent gate in case
 * an attempt somehow already reached PAYMENT_AUTHORIZED before that
 * restriction existed (e.g. earlier Fase 3A testing).
 *
 * No Nuitee BOOK, no Duffel Order — not in this phase, not for any
 * modality.
 */

const MAX_PROGRESS_STEPS = 6;

export type ProgressCaptureResult =
  | { outcome: "confirmed"; bookingId: string; reference: string; accessToken: string; alreadyFinalized: boolean }
  | { outcome: "blocked"; reason: string }
  | { outcome: "retry"; reason: string }
  | { outcome: "recovery_required"; reason: string }
  | { outcome: "failed"; reason: string }
  | { outcome: "not_applicable"; reason: string };

type CapturePaymentIntentResult =
  | { outcome: "captured"; authorization: PaymentAuthorization }
  | { outcome: "retry_capture" }
  | { outcome: "unknown"; reason: string }
  | { outcome: "failed"; reason: string };

/**
 * §3/§4 — check-first-then-capture-if-needed, never a blind capture()
 * call. The amount captured always comes from THIS CheckoutAttempt's own
 * FinalQuoteSnapshot (server-side, frozen at REVALIDATING) — never a
 * browser-supplied number, and never the PaymentIntent's full authorized
 * amount by assumption; it is explicitly verified against
 * amountCapturableMinorUnits before capturing and against
 * amountReceivedMinorUnits after.
 *
 * §4's timeout procedure lives entirely here: if the capture() call
 * itself throws (network error, timeout — we genuinely don't know if
 * Stripe applied it), the ONLY next step is a fresh GET, never a blind
 * retry of capture(). That GET's result is what decides "captured"
 * (succeeded + amount matches), "retry_capture" (still requires_capture —
 * confirmed safe to try again), or "unknown" (still ambiguous / Stripe
 * unreachable again) — matching this phase's explicit "NUNCA volver a
 * llamar capture a ciegas sin verificar" requirement.
 */
async function capturePaymentIntent(attempt: Pick<CheckoutAttempt, "id" | "finalQuoteSnapshot" | "finalQuoteSnapshotVersion" | "stripePaymentIntentId">): Promise<CapturePaymentIntentResult> {
  const snapshot = parseFinalQuoteSnapshot(attempt.finalQuoteSnapshot);
  if (!snapshot) return { outcome: "unknown", reason: "no_snapshot" };
  if (!attempt.stripePaymentIntentId) return { outcome: "unknown", reason: "no_payment_intent" };

  let expectedAmount: number;
  try {
    expectedAmount = toStripeMinorUnits(snapshot.commercial.pvpTotal, snapshot.commercial.currency);
  } catch {
    return { outcome: "unknown", reason: "unsupported_currency" };
  }

  let fresh: PaymentAuthorization;
  try {
    fresh = await getAuthorization(attempt.stripePaymentIntentId);
  } catch {
    return { outcome: "unknown", reason: "stripe_unreachable" };
  }

  // Already captured — by our own earlier call (whose response was lost
  // to a timeout), by a webhook, or by a concurrent duplicate request.
  // Reconcile, never re-capture (§3/§5 idempotency, test E).
  if (fresh.status === "captured") {
    if (fresh.amountReceivedMinorUnits !== expectedAmount) return { outcome: "unknown", reason: "captured_amount_mismatch" };
    return { outcome: "captured", authorization: fresh };
  }

  if (fresh.rawStatus !== "requires_capture") {
    if (fresh.status === "voided") return { outcome: "failed", reason: "payment_intent_canceled" };
    if (fresh.status === "failed") return { outcome: "failed", reason: "payment_intent_failed" };
    return { outcome: "unknown", reason: `unexpected_status_before_capture:${fresh.rawStatus}` };
  }
  if (fresh.amountCapturableMinorUnits !== expectedAmount) return { outcome: "unknown", reason: "capturable_amount_mismatch" };

  const idempotencyKey = paymentIntentCaptureIdempotencyKey(attempt.id, attempt.finalQuoteSnapshotVersion);
  try {
    const captured = await captureAuthorization(attempt.stripePaymentIntentId, { amountMinorUnits: expectedAmount, idempotencyKey });
    if (captured.status !== "captured" || captured.amountReceivedMinorUnits !== expectedAmount) {
      return { outcome: "unknown", reason: "capture_response_not_confirmed_captured" };
    }
    return { outcome: "captured", authorization: captured };
  } catch {
    // §4 — the capture CALL failed/timed out: we do not know whether
    // Stripe applied it. The only safe next step is a fresh GET.
    let reconciled: PaymentAuthorization;
    try {
      reconciled = await getAuthorization(attempt.stripePaymentIntentId);
    } catch {
      return { outcome: "unknown", reason: "stripe_unreachable_during_reconciliation" };
    }
    if (reconciled.status === "captured" && reconciled.amountReceivedMinorUnits === expectedAmount) {
      return { outcome: "captured", authorization: reconciled };
    }
    if (reconciled.rawStatus === "requires_capture") {
      return { outcome: "retry_capture" };
    }
    return { outcome: "unknown", reason: `ambiguous_after_capture_error:${reconciled.rawStatus}` };
  }
}

/**
 * The single orchestration entry point for everything AFTER
 * PAYMENT_AUTHORIZED, for both the browser-triggered path
 * (confirmRealCheckout, real-checkout-payment.ts) and the Stripe webhook
 * (payment_intent.succeeded — route.ts). Idempotent and safe to call
 * repeatedly at any point (§11 refresh/retry, §12 double click): it
 * always starts from whatever CheckoutAttempt.status currently IS and
 * only ever advances it, never re-does a step that already happened
 * (captured amount already matches -> never re-captures; Booking already
 * exists -> finalizeConfirmedCheckoutAttempt's own idempotent
 * short-circuit returns it unchanged).
 *
 * Loops through the linear TICKET_ONLY chain
 * (fulfilling -> payment_capturing -> finalizing -> confirmed) in ONE
 * call when nothing blocks it, so a single "confirmar reserva" action
 * can go straight from PAYMENT_AUTHORIZED to CONFIRMED without the
 * browser needing to poll — bounded by MAX_PROGRESS_STEPS purely as a
 * safety net against an unforeseen loop, never expected to be hit in
 * practice (there are only 4 real steps).
 */
export async function progressCapturedCheckoutAttempt(checkoutAttemptId: string): Promise<ProgressCaptureResult> {
  for (let step = 0; step < MAX_PROGRESS_STEPS; step++) {
    const attempt = await prisma.checkoutAttempt.findUniqueOrThrow({ where: { id: checkoutAttemptId } });

    if (attempt.status === "confirmed") {
      if (!attempt.bookingId) return { outcome: "recovery_required", reason: "confirmed_without_booking" };
      const booking = await prisma.booking.findUniqueOrThrow({ where: { id: attempt.bookingId } });
      return { outcome: "confirmed", bookingId: booking.id, reference: booking.reference, accessToken: booking.accessToken, alreadyFinalized: true };
    }

    if (attempt.status === "payment_authorized" || attempt.status === "fulfilling") {
      if (attempt.packageType !== "TICKET_ONLY") {
        await recordCheckoutAttemptEvent(checkoutAttemptId, "fulfillment_barrier_blocked", { sanitizedDetail: JSON.stringify({ packageType: attempt.packageType }) });
        return { outcome: "blocked", reason: "Fulfillment de esta modalidad aún no habilitado." };
      }
      await transitionCheckoutAttempt(checkoutAttemptId, attempt.status === "payment_authorized" ? "fulfilling" : "payment_capturing");
      continue;
    }

    if (attempt.status === "payment_capturing") {
      if (attempt.packageType !== "TICKET_ONLY") {
        // Defense in depth — should be unreachable (the barrier above
        // already fires before this status is ever entered), but §17
        // requires never capturing for these modalities under any path.
        return { outcome: "blocked", reason: "Fulfillment de esta modalidad aún no habilitado." };
      }
      // §16 — hard, explicit safety gate at the exact call site that
      // captures real money (even if only TEST money): refuse outright
      // if the configured secret key doesn't look like a TEST key.
      // getStripeClient() already enforces this structurally on every
      // Stripe call, but this makes the guarantee visible in this
      // phase's own code path rather than only inherited silently.
      if (!stripeConfig.looksLikeTestKey) {
        return { outcome: "recovery_required", reason: "stripe_secret_key_not_test_mode" };
      }

      const result = await capturePaymentIntent(attempt);
      if (result.outcome === "captured") {
        await prisma.checkoutAttempt.update({ where: { id: checkoutAttemptId }, data: { paymentStatus: "captured" } });
        await recordCheckoutAttemptEvent(checkoutAttemptId, "payment_captured", {
          providerReference: attempt.stripePaymentIntentId,
          sanitizedDetail: JSON.stringify({ amountReceivedMinorUnits: result.authorization.amountReceivedMinorUnits, currency: result.authorization.currency }),
        });
        await transitionCheckoutAttempt(checkoutAttemptId, "finalizing");
        continue;
      }
      if (result.outcome === "retry_capture") {
        await recordCheckoutAttemptEvent(checkoutAttemptId, "payment_capture_failed", { sanitizedDetail: JSON.stringify({ reason: "requires_capture_after_call" }) });
        return { outcome: "retry", reason: "capture_not_yet_applied" };
      }
      if (result.outcome === "unknown") {
        // §4/§13 — never release the TicketHold on an ambiguous result.
        // recovery_required is a dead end for automation (no auto-exit
        // in this phase) but a human-resolvable one.
        await prisma.checkoutAttempt.update({ where: { id: checkoutAttemptId }, data: { paymentStatus: "unknown" } });
        await transitionCheckoutAttempt(checkoutAttemptId, "recovery_required");
        await recordCheckoutAttemptEvent(checkoutAttemptId, "payment_capture_ambiguous", { sanitizedDetail: JSON.stringify({ reason: result.reason }) });
        return { outcome: "recovery_required", reason: result.reason };
      }
      // result.outcome === "failed" — Stripe has CONFIRMED there is no
      // captured/capturable payment (canceled or a genuine failure): safe
      // to release the TicketHold via the normal "failed" transition hook.
      await prisma.checkoutAttempt.update({ where: { id: checkoutAttemptId }, data: { paymentStatus: "failed" } });
      await transitionCheckoutAttempt(checkoutAttemptId, "failed");
      await recordCheckoutAttemptEvent(checkoutAttemptId, "payment_capture_failed", { sanitizedDetail: JSON.stringify({ reason: result.reason }) });
      return { outcome: "failed", reason: result.reason };
    }

    if (attempt.status === "finalizing") {
      const result: FinalizeResult = await finalizeConfirmedCheckoutAttempt(checkoutAttemptId);
      if (!result.ok) return { outcome: "retry", reason: result.error };
      return { outcome: "confirmed", bookingId: result.bookingId, reference: result.reference, accessToken: result.accessToken, alreadyFinalized: result.alreadyFinalized };
    }

    // draft / revalidating / ready_to_pay / payment_authorizing /
    // compensating / recovery_required / failed / cancelled — nothing
    // this function does applies; the caller asked too early, too late,
    // or the attempt is already in a terminal/human-resolvable state.
    return { outcome: "not_applicable", reason: `checkout_attempt_status:${attempt.status}` };
  }
  return { outcome: "retry", reason: "max_steps_reached" };
}
