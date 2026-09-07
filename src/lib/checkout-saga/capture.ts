import type { CheckoutAttempt } from "@prisma/client";
import { prisma } from "@/lib/db";
import { stripeConfig } from "@/lib/env";
import { transitionCheckoutAttempt, CheckoutSagaTransitionError } from "./transitions";
import { recordCheckoutAttemptEvent } from "./events";
import { parseFinalQuoteSnapshot } from "./finalQuoteSnapshot";
import { finalizeConfirmedCheckoutAttempt, type FinalizeResult } from "./finalize";
import { progressHotelFulfillment, compensateConfirmedHotelBooking } from "./hotelFulfillment";
import { toStripeMinorUnits } from "@/lib/providers/payments/stripe/amount";
import { paymentIntentCaptureIdempotencyKey } from "@/lib/providers/payments/stripe/idempotency";
import { getAuthorization, captureAuthorization } from "@/lib/providers/payments/stripe/authorization";
import type { PaymentAuthorization } from "@/lib/providers/payments/stripe/types";

/**
 * Fase 3B.1, extended Fase 3B.2 — drives PAYMENT_AUTHORIZED all the way to
 * CONFIRMED for TICKET_ONLY (fulfilling is a no-op — there is no external
 * provider to call) and now TICKET_HOTEL too (fulfilling drives a real
 * Nuitee SANDBOX BOOK — see hotelFulfillment.ts — strictly BEFORE Stripe
 * capture, per this phase's own §1 "orden crítico") -> payment_capturing
 * (a real Stripe TEST capture) -> finalizing (confirm the TicketHold,
 * create the Booking) -> confirmed.
 *
 * TICKET_HOTEL_FLIGHT is deliberately NEVER progressed past
 * PAYMENT_AUTHORIZED here (§0/§24 of this phase's brief) — flight
 * fulfillment doesn't exist yet, so capturing money for it would leave a
 * paid-but-unfulfillable order. createPaymentAuthorization (payment.ts)
 * already refuses to create a NEW authorization for that modality; this
 * file's own barrier check is the second, independent gate in case an
 * attempt somehow already reached PAYMENT_AUTHORIZED before that
 * restriction existed (e.g. earlier Fase 3A/3B.1 testing).
 *
 * No Duffel Order — not in this phase, not for any modality.
 */

const MAX_PROGRESS_STEPS = 6;

/**
 * Fase 3B.2 finding (exposed by the new TICKET_HOTEL concurrency tests,
 * but a latent gap in the TICKET_ONLY path since Fase 3B.1 too — the
 * existing concurrency test there only ever started from `finalizing`,
 * whose own lock inside finalize.ts already covered it) — two genuinely
 * concurrent progressCapturedCheckoutAttempt calls can each read the SAME
 * current status before either commits its own advance, both then call
 * transitionCheckoutAttempt() for the SAME "next" status. Whichever
 * commits first succeeds; the second one's OWN transaction then re-reads
 * (still inside transitionCheckoutAttemptSteps) and sees the status the
 * FIRST call already wrote — i.e. attempting a same-to-same "transition"
 * transitions.ts correctly refuses (it isn't a real state change). That
 * is not a bug to surface: the second caller's whole *reason* for calling
 * transitionCheckoutAttempt was "make sure we're past X" — and by the
 * time it ran, some other caller already ensured exactly that. Swallowing
 * CheckoutSagaTransitionError here and simply re-reading on the next loop
 * iteration is what makes this function's own doc comment's promise
 * ("idempotent... safe to call repeatedly... at any point") actually hold
 * under real concurrency, not just sequential re-entry.
 */
async function advanceIfPossible(checkoutAttemptId: string, to: Parameters<typeof transitionCheckoutAttempt>[1]): Promise<void> {
  try {
    await transitionCheckoutAttempt(checkoutAttemptId, to);
  } catch (err) {
    if (err instanceof CheckoutSagaTransitionError) return;
    throw err;
  }
}

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

    if (attempt.status === "payment_authorized") {
      if (attempt.packageType === "TICKET_HOTEL_FLIGHT") {
        await recordCheckoutAttemptEvent(checkoutAttemptId, "fulfillment_barrier_blocked", { sanitizedDetail: JSON.stringify({ packageType: attempt.packageType }) });
        return { outcome: "blocked", reason: "Fulfillment de esta modalidad aún no habilitado." };
      }
      await advanceIfPossible(checkoutAttemptId, "fulfilling");
      continue;
    }

    if (attempt.status === "fulfilling") {
      if (attempt.packageType === "TICKET_HOTEL_FLIGHT") {
        await recordCheckoutAttemptEvent(checkoutAttemptId, "fulfillment_barrier_blocked", { sanitizedDetail: JSON.stringify({ packageType: attempt.packageType }) });
        return { outcome: "blocked", reason: "Fulfillment de esta modalidad aún no habilitado." };
      }
      if (attempt.packageType === "TICKET_ONLY") {
        // No external component to fulfill.
        await advanceIfPossible(checkoutAttemptId, "payment_capturing");
        continue;
      }

      // TICKET_HOTEL — §1 "orden crítico": Nuitee BOOK before Stripe capture.
      const hotelResult = await progressHotelFulfillment(checkoutAttemptId, undefined);
      switch (hotelResult.outcome) {
        case "confirmed":
          await advanceIfPossible(checkoutAttemptId, "payment_capturing");
          continue;
        case "in_progress":
        case "retry":
          return { outcome: "retry", reason: `hotel_${hotelResult.outcome}` };
        case "not_auto_bookable":
        case "window_expired":
        case "failed_confirmed_absent":
          await advanceIfPossible(checkoutAttemptId, "failed");
          return { outcome: "failed", reason: `hotel_${hotelResult.outcome}` };
        case "recovery_required":
          await advanceIfPossible(checkoutAttemptId, "recovery_required");
          return { outcome: "recovery_required", reason: hotelResult.reason };
        case "not_applicable":
          // Should be unreachable for TICKET_HOTEL (hotelStatus is never
          // null on this modality) — defensive fallback only.
          await advanceIfPossible(checkoutAttemptId, "payment_capturing");
          continue;
      }
    }

    if (attempt.status === "payment_capturing") {
      if (attempt.packageType === "TICKET_HOTEL_FLIGHT") {
        // Defense in depth — should be unreachable (the barrier above
        // already fires before this status is ever entered), but §24
        // requires never capturing for this modality under any path.
        return { outcome: "blocked", reason: "Fulfillment de esta modalidad aún no habilitado." };
      }
      // §12/AF — a second, independent gate right at the exact call site
      // that captures real money: for TICKET_HOTEL, the hotel component
      // MUST already be CONFIRMED. Should be unreachable (the fulfilling
      // step above never transitions forward otherwise), but this makes
      // the guarantee explicit rather than only inherited from control
      // flow.
      if (attempt.hotelStatus !== null && attempt.hotelStatus !== "confirmed") {
        await advanceIfPossible(checkoutAttemptId, "recovery_required");
        return { outcome: "recovery_required", reason: `capture_attempted_with_hotel_status:${attempt.hotelStatus}` };
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
        // §13 — capture succeeded: never cancel an already-confirmed hotel.
        await advanceIfPossible(checkoutAttemptId, "finalizing");
        continue;
      }
      if (result.outcome === "retry_capture") {
        await recordCheckoutAttemptEvent(checkoutAttemptId, "payment_capture_failed", { sanitizedDetail: JSON.stringify({ reason: "requires_capture_after_call" }) });
        return { outcome: "retry", reason: "capture_not_yet_applied" };
      }
      if (result.outcome === "unknown") {
        // §4/§13/§16 — never release the TicketHold, and never cancel a
        // CONFIRMED hotel, on an ambiguous capture result. recovery_required
        // is a dead end for automation (no auto-exit in this phase) but a
        // human-resolvable one.
        await prisma.checkoutAttempt.update({ where: { id: checkoutAttemptId }, data: { paymentStatus: "unknown" } });
        await transitionCheckoutAttempt(checkoutAttemptId, "recovery_required");
        await recordCheckoutAttemptEvent(checkoutAttemptId, "payment_capture_ambiguous", { sanitizedDetail: JSON.stringify({ reason: result.reason }) });
        return { outcome: "recovery_required", reason: result.reason };
      }
      // result.outcome === "failed" — Stripe has CONFIRMED there is no
      // captured/capturable payment (canceled or a genuine failure).
      await prisma.checkoutAttempt.update({ where: { id: checkoutAttemptId }, data: { paymentStatus: "failed" } });
      await recordCheckoutAttemptEvent(checkoutAttemptId, "payment_capture_failed", { sanitizedDetail: JSON.stringify({ reason: result.reason }) });

      if (attempt.hotelStatus === "confirmed" && attempt.hotelProviderReference) {
        // §14 — the hotel was already booked before this definitive
        // capture failure: compensate (cancel it) before this attempt can
        // safely reach a terminal state.
        await transitionCheckoutAttempt(checkoutAttemptId, "compensating");
        const compensation = await compensateConfirmedHotelBooking(checkoutAttemptId, attempt.hotelProviderReference);
        if (compensation.outcome === "compensated_clean") {
          await transitionCheckoutAttempt(checkoutAttemptId, "failed");
          return { outcome: "failed", reason: result.reason };
        }
        await transitionCheckoutAttempt(checkoutAttemptId, "recovery_required");
        return { outcome: "recovery_required", reason: `capture_failed_hotel_compensation:${compensation.reason}` };
      }

      // TICKET_ONLY, or a TICKET_HOTEL attempt that never reached a
      // booked hotel — nothing external to compensate.
      await transitionCheckoutAttempt(checkoutAttemptId, "failed");
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
