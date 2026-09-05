/**
 * Fase 3A §24 — domain-level payment-authorization types. Deliberately
 * NOT Stripe.PaymentIntent verbatim: this is the shape the rest of the
 * checkout saga (checkout-saga/payment.ts and its callers) is written
 * against, so a future non-Stripe provider (or a future capture phase)
 * only ever has to satisfy this contract — same "the domain doesn't bend
 * to the vendor's shape" rule already established for
 * flights/duffel/types.ts and hotels/nuitee/types.ts.
 */

/**
 * Fase 3A §15, extended Fase 3B.1 — our own normalized status, mapped
 * from Stripe's PaymentIntent.status (+ whether a `last_payment_error` is
 * attached) by mapPaymentIntentStatus() in authorization.ts. Deliberately
 * reuses the exact vocabulary already defined on prisma's
 * PaymentComponentStatus enum (not_started/authorizing/authorized/
 * capturing/captured/unknown/voiding/voided/failed) — no separate
 * parallel enum invented for this. "captured" is new in Fase 3B.1: before
 * this phase, this codebase never called capture() itself, so a
 * `succeeded` PaymentIntent was treated defensively as "authorized"; now
 * that captureAuthorization() exists, `succeeded` genuinely means
 * captured funds.
 */
export type PaymentAuthorizationStatus = "authorizing" | "authorized" | "captured" | "failed" | "voided" | "unknown";

export type PaymentAuthorization = {
  /** Stripe's own PaymentIntent id (`pi_...`). */
  providerReference: string;
  status: PaymentAuthorizationStatus;
  /** Stripe's own raw status string, kept alongside our normalized one for diagnostics/events — never trusted as a state-machine input directly. */
  rawStatus: string;
  amountMinorUnits: number;
  currency: string;
  /** Only present on Stripe's `requires_capture` — the amount actually available to capture, verified against amountMinorUnits before ever trusting `authorized`. */
  amountCapturableMinorUnits: number;
  /** Fase 3B.1 §3/§4 — Stripe's own `amount_received`: 0 until a capture actually applies, then the exact amount captured. The only value ever trusted to confirm a capture really happened with the expected amount — never inferred from `status` alone. */
  amountReceivedMinorUnits: number;
  captureMethod: string;
  livemode: boolean;
  /** True only when a real `last_payment_error` is attached (e.g. after a declined card) — distinguishes a FRESH `requires_payment_method` (nothing tried yet) from a FAILED retry (§15's "requires_payment_method tras fallo conocido"). */
  hasKnownFailure: boolean;
  lastPaymentErrorCode: string | null;
  metadata: Record<string, string>;
  /**
   * Only populated by createAuthorization/getAuthorization's own return —
   * NEVER persisted to CheckoutAttempt or logged (§27). Handed to the
   * browser exactly once, for the one Payment Element mount that needs
   * it to complete this specific PaymentIntent.
   */
  clientSecret: string | null;
};

export type CreateAuthorizationParams = {
  amountMinorUnits: number;
  currency: string;
  idempotencyKey: string;
  metadata: Record<string, string>;
};

/** Fase 3B.1 §3 — `amountMinorUnits` here is `amount_to_capture`, always derived server-side from the CheckoutAttempt's own FinalQuoteSnapshot, NEVER from browser input (see capture.ts's own doc comment). */
export type CaptureAuthorizationParams = {
  amountMinorUnits: number;
  idempotencyKey: string;
};
