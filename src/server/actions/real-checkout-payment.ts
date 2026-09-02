"use server";

import { prisma } from "@/lib/db";
import { createPaymentAuthorization, verifyAndApplyAuthorization } from "@/lib/checkout-saga/payment";
import { getAuthorization } from "@/lib/providers/payments/stripe/authorization";

/**
 * Fase 3A §18 — the ONLY entry points the browser has into the payment
 * saga, both gated by CheckoutAttempt.accessToken (the same opaque,
 * unguessable token resumeCheckoutAttempt.ts already uses for
 * READY_TO_PAY) — NEVER a raw CheckoutAttempt.id. A guessed/garbage
 * token, or another customer's real token, resolves to nothing and both
 * actions return a generic failure — never leaking whether a token
 * merely doesn't exist vs. belongs to someone else.
 */

export type StartPaymentAuthorizationResult =
  | { ok: true; status: "action_required"; clientSecret: string; publishableKey: string; refreshed: boolean }
  | { ok: true; status: "already_authorized" }
  | { ok: false; error: string };

export async function startPaymentAuthorization(accessToken: string, fetchImpl?: typeof fetch): Promise<StartPaymentAuthorizationResult> {
  if (!accessToken) {
    return { ok: false, error: "Intento de compra no encontrado." };
  }
  const attempt = await prisma.checkoutAttempt.findUnique({ where: { accessToken } });
  if (!attempt) {
    return { ok: false, error: "Intento de compra no encontrado." };
  }

  const result = await createPaymentAuthorization(attempt.id, fetchImpl);
  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  if (result.status === "already_authorized") {
    return { ok: true, status: "already_authorized" };
  }
  return { ok: true, status: "action_required", clientSecret: result.clientSecret, publishableKey: result.publishableKey, refreshed: result.refreshed };
}

export type PaymentAuthorizationStatusView = {
  /**
   * Fase 3A §19 — deliberately just enough for the UI to branch between
   * "not started yet, safe to begin" (ready), "still filling in card
   * details / 3DS in progress" (authorizing), "pago autorizado (dev-only
   * barrier copy)" (authorized), and terminal/error states — never
   * CheckoutAttempt internals beyond that. This single check is also the
   * ONE entry point the payment UI uses to decide what to render on
   * mount, whether that's right after CONTINUAR or a page refresh/3DS
   * return — never trusting client-side state either way (§17).
   */
  stage: "ready" | "authorizing" | "authorized" | "failed" | "voided" | "not_payable";
};

/**
 * Fase 3A §17 — the resume/refresh entry point: the frontend NEVER
 * decides on its own whether a payment succeeded after an ambiguous
 * return (a page reload after a 3DS redirect, a dropped connection,
 * etc.) — it asks the server, which reconstructs the state from
 * CheckoutAttempt, consulting Stripe fresh when the attempt is still
 * mid-authorization so a webhook that hasn't arrived yet doesn't leave
 * the customer stuck looking at a stale "authorizing" screen.
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
      return { stage: "authorized" };
    case "payment_authorizing":
      return attempt.paymentStatus === "failed" ? { stage: "failed" } : { stage: "authorizing" };
    case "failed":
      return attempt.paymentStatus === "voided" ? { stage: "voided" } : { stage: "failed" };
    default:
      return { stage: "not_payable" };
  }
}
