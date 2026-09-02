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
 * Fase 3A §15 — our own normalized status, mapped from Stripe's
 * PaymentIntent.status (+ whether a `last_payment_error` is attached) by
 * mapPaymentIntentStatus() in authorization.ts. Deliberately reuses the
 * exact vocabulary already defined on prisma's PaymentComponentStatus
 * enum (not_started/authorizing/authorized/capturing/captured/unknown/
 * voiding/voided/failed) — no separate parallel enum invented for this.
 */
export type PaymentAuthorizationStatus = "authorizing" | "authorized" | "failed" | "voided" | "unknown";

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
