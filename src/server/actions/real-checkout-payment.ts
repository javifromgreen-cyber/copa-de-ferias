"use server";

import { prisma } from "@/lib/db";
import { createPaymentAuthorization, verifyAndApplyAuthorization } from "@/lib/checkout-saga/payment";
import { progressCapturedCheckoutAttempt } from "@/lib/checkout-saga/capture";
import { getAuthorization } from "@/lib/providers/payments/stripe/authorization";

/**
 * Fase 3A §18, extended Fase 3B.1 — the ONLY entry points the browser has
 * into the payment saga, all gated by CheckoutAttempt.accessToken (the
 * same opaque, unguessable token resumeCheckoutAttempt.ts already uses
 * for READY_TO_PAY) — NEVER a raw CheckoutAttempt.id. A guessed/garbage
 * token, or another customer's real token, resolves to nothing and every
 * action returns a generic failure — never leaking whether a token
 * merely doesn't exist vs. belongs to someone else.
 */

export type StartPaymentAuthorizationResult =
  | { ok: true; status: "action_required"; clientSecret: string; publishableKey: string; refreshed: boolean }
  | { ok: true; status: "already_authorized" }
  | { ok: false; error: string };

/**
 * Diagnostic-only, never returned to the client: logs exactly the
 * sanitized fields needed to tell apart "Stripe never created a
 * PaymentIntent", "PaymentIntent created but no client_secret",
 * "publishable key missing/invalid", from a genuine CheckoutAttempt
 * state problem — without ever printing a secret/publishable key value,
 * a client_secret, or a webhook secret. Read via Vercel's function logs
 * (grep for `[PaymentAuthDiag]`).
 */
async function logPaymentAuthDiagnostics(checkoutAttemptId: string, result: StartPaymentAuthorizationResult): Promise<void> {
  const attempt = await prisma.checkoutAttempt.findUnique({ where: { id: checkoutAttemptId }, select: { status: true, paymentStatus: true, stripePaymentIntentId: true } });
  const hasPublishableKey = result.ok && result.status === "action_required" ? Boolean(result.publishableKey) : undefined;
  const publishableKeyHasValidPrefix = result.ok && result.status === "action_required" ? result.publishableKey.startsWith("pk_test_") : undefined;
  console.log(
    "[PaymentAuthDiag]",
    JSON.stringify({
      ok: result.ok,
      status: result.ok ? result.status : undefined,
      hasClientSecret: result.ok && result.status === "action_required" ? Boolean(result.clientSecret) : undefined,
      hasPublishableKey,
      publishableKeyHasValidPrefix,
      checkoutAttemptStatus: attempt?.status ?? null,
      paymentStatus: attempt?.paymentStatus ?? null,
      hasStripePaymentIntentId: Boolean(attempt?.stripePaymentIntentId),
      error: result.ok ? undefined : result.error,
    }),
  );
}

export async function startPaymentAuthorization(accessToken: string, fetchImpl?: typeof fetch): Promise<StartPaymentAuthorizationResult> {
  if (!accessToken) {
    return { ok: false, error: "Intento de compra no encontrado." };
  }
  const attempt = await prisma.checkoutAttempt.findUnique({ where: { accessToken } });
  if (!attempt) {
    return { ok: false, error: "Intento de compra no encontrado." };
  }

  const authResult = await createPaymentAuthorization(attempt.id, fetchImpl);
  const result: StartPaymentAuthorizationResult = !authResult.ok
    ? { ok: false, error: authResult.error }
    : authResult.status === "already_authorized"
      ? { ok: true, status: "already_authorized" }
      : { ok: true, status: "action_required", clientSecret: authResult.clientSecret, publishableKey: authResult.publishableKey, refreshed: authResult.refreshed };

  await logPaymentAuthDiagnostics(attempt.id, result);
  return result;
}

export type PaymentAuthorizationStatusView =
  | { stage: "ready" | "authorizing" | "authorized" | "failed" | "voided" | "not_payable" }
  | { stage: "blocked"; message: string }
  | { stage: "confirmed"; bookingAccessToken: string; reference: string };

/**
 * Fase 3A §17 — the resume/refresh entry point: the frontend NEVER
 * decides on its own whether a payment succeeded after an ambiguous
 * return (a page reload after a 3DS redirect, a dropped connection,
 * etc.) — it asks the server, which reconstructs the state from
 * CheckoutAttempt, consulting Stripe fresh when the attempt is still
 * mid-authorization so a webhook that hasn't arrived yet doesn't leave
 * the customer stuck looking at a stale "authorizing" screen.
 *
 * Fase 3B.1 — extended with two more terminal-ish views: "confirmed" (a
 * Booking already exists — §11 "si Booking ya existe, mostrar CONFIRMED /
 * Mi Viaje", read straight from the DB, no side effects) and "blocked"
 * (TICKET_HOTEL/TICKET_HOTEL_FLIGHT reached PAYMENT_AUTHORIZED but this
 * phase never fulfills/captures those — §17's explicit barrier). This
 * function still only VERIFIES/reads state (plus the pre-existing
 * payment_authorizing self-heal above) — it never itself drives
 * capture/finalization forward; that is confirmRealCheckout's job below.
 */
export async function getPaymentAuthorizationStatus(accessToken: string): Promise<PaymentAuthorizationStatusView> {
  if (!accessToken) return { stage: "not_payable" };
  let attempt = await prisma.checkoutAttempt.findUnique({ where: { accessToken } });
  if (!attempt) return { stage: "not_payable" };

  if (attempt.status === "payment_authorizing" && attempt.stripePaymentIntentId) {
    try {
      const fresh = await getAuthorization(attempt.stripePaymentIntentId);
      await verifyAndApplyAuthorization(attempt.id, fresh);
      attempt = await prisma.checkoutAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
    } catch {
      // Stripe unreachable right now — fall through and report the
      // last known persisted state rather than failing the whole call.
    }
  }

  switch (attempt.status) {
    case "ready_to_pay":
      return { stage: "ready" };
    case "payment_authorized":
    case "fulfilling":
    case "payment_capturing":
    case "finalizing":
      if (attempt.packageType === "TICKET_HOTEL_FLIGHT") {
        return { stage: "blocked", message: "Fulfillment de esta modalidad aún no habilitado." };
      }
      return { stage: "authorized" };
    case "payment_authorizing":
      return attempt.paymentStatus === "failed" ? { stage: "failed" } : { stage: "authorizing" };
    case "confirmed": {
      if (!attempt.bookingId) return { stage: "not_payable" };
      const booking = await prisma.booking.findUnique({ where: { id: attempt.bookingId } });
      if (!booking) return { stage: "not_payable" };
      return { stage: "confirmed", bookingAccessToken: booking.accessToken, reference: booking.reference };
    }
    case "failed":
      return attempt.paymentStatus === "voided" ? { stage: "voided" } : { stage: "failed" };
    default:
      return { stage: "not_payable" };
  }
}

export type ConfirmRealCheckoutResult =
  | { ok: true; stage: "confirmed"; bookingAccessToken: string; reference: string }
  | { ok: true; stage: "processing" }
  | { ok: false; error: string };

/**
 * Fase 3B.1 §1/§2/§11/§12 — the ONE action that drives an already-
 * PAYMENT_AUTHORIZED, TICKET_ONLY CheckoutAttempt through Stripe TEST
 * capture and local finalization to CONFIRMED. Thin accessToken-gated
 * wrapper around progressCapturedCheckoutAttempt (capture.ts) — all the
 * actual policy (check-before-capture, timeout reconciliation, the
 * TICKET_ONLY barrier, idempotent finalization) lives there. Safe to
 * call more than once for the same attempt (§11 refresh/retry, §12
 * double click): a repeat call after "confirmed" just re-reads the same
 * Booking; a repeat call after "processing" resumes from wherever the
 * previous call left off, never re-captures, never creates a second
 * Booking.
 */
export async function confirmRealCheckout(accessToken: string): Promise<ConfirmRealCheckoutResult> {
  if (!accessToken) return { ok: false, error: "Intento de compra no encontrado." };
  const attempt = await prisma.checkoutAttempt.findUnique({ where: { accessToken } });
  if (!attempt) return { ok: false, error: "Intento de compra no encontrado." };

  const result = await progressCapturedCheckoutAttempt(attempt.id);
  switch (result.outcome) {
    case "confirmed":
      return { ok: true, stage: "confirmed", bookingAccessToken: result.accessToken, reference: result.reference };
    case "blocked":
      return { ok: false, error: result.reason };
    case "retry":
      return { ok: true, stage: "processing" };
    case "recovery_required":
      return { ok: false, error: "No se pudo verificar el pago. Un humano revisará este intento — vuelve a intentarlo en unos minutos." };
    case "failed":
      return { ok: false, error: "El pago no se pudo completar." };
    case "not_applicable":
      return { ok: false, error: "Este intento de compra no está listo para confirmarse." };
  }
}
