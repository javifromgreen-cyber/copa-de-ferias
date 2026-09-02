import type Stripe from "stripe";
import { getStripeClient, mapStripeError } from "./client";
import type { CreateAuthorizationParams, PaymentAuthorization, PaymentAuthorizationStatus } from "./types";

/** The minimal slice of the Stripe SDK this adapter actually calls — narrow on purpose so unit tests can inject a small fake instead of the real SDK (same fetchImpl-injection spirit as duffel/nuitee's clients). */
export type StripePaymentIntentsClient = Pick<Stripe, "paymentIntents">;

/**
 * Fase 3A §15 — maps a raw Stripe PaymentIntent into this codebase's own
 * PaymentAuthorizationStatus vocabulary. Never inflates the domain enum —
 * every branch below produces a value PaymentComponentStatus (prisma
 * schema) already has room for.
 *
 * - requires_payment_method, no last_payment_error yet -> "authorizing"
 *   (fresh PaymentIntent, customer hasn't submitted the Payment Element
 *   form yet — NOT a failure).
 * - requires_payment_method WITH a last_payment_error -> "failed" (a
 *   known, retryable failure — e.g. the test card that always declines;
 *   §15 "requires_payment_method tras fallo conocido").
 * - requires_confirmation / requires_action / processing -> "authorizing"
 *   (still in progress — includes 3DS/SCA in flight; §10 "NO considerar
 *   FAILED porque Stripe requiera 3DS").
 * - requires_capture -> "authorized" (manual-capture's whole point: funds
 *   are authorized and capturable, nothing captured yet).
 * - canceled -> "voided".
 * - succeeded -> "authorized" too, defensively: this phase never calls
 *   capture() itself, so a PaymentIntent reaching `succeeded` here would
 *   mean it was captured by something OUTSIDE this codebase (never
 *   expected in normal operation) — treated the same as "funds are
 *   secured", never silently ignored or mis-mapped to "failed".
 * - anything else -> "unknown" (a future Stripe status this mapping
 *   hasn't been taught yet, rather than guessing).
 */
export function mapPaymentIntentStatus(pi: Pick<Stripe.PaymentIntent, "status" | "last_payment_error">): PaymentAuthorizationStatus {
  switch (pi.status) {
    case "requires_payment_method":
      return pi.last_payment_error ? "failed" : "authorizing";
    case "requires_confirmation":
    case "requires_action":
    case "processing":
      return "authorizing";
    case "requires_capture":
    case "succeeded":
      return "authorized";
    case "canceled":
      return "voided";
    default:
      return "unknown";
  }
}

function toDomain(pi: Stripe.PaymentIntent): PaymentAuthorization {
  const metadata: Record<string, string> = {};
  for (const [k, v] of Object.entries(pi.metadata ?? {})) metadata[k] = String(v);
  return {
    providerReference: pi.id,
    status: mapPaymentIntentStatus(pi),
    rawStatus: pi.status,
    amountMinorUnits: pi.amount,
    currency: pi.currency.toUpperCase(),
    amountCapturableMinorUnits: pi.amount_capturable,
    captureMethod: pi.capture_method,
    livemode: pi.livemode,
    hasKnownFailure: Boolean(pi.last_payment_error),
    lastPaymentErrorCode: pi.last_payment_error?.code ?? null,
    metadata,
    clientSecret: pi.client_secret ?? null,
  };
}

/**
 * Fase 3A §3/§4/§5/§6/§21 — creates a manual-capture PaymentIntent
 * restricted to `card` (§3's MVP-scope decision: only a payment method
 * whose authorize/capture semantics this codebase actually knows —
 * never `automatic_payment_methods`, which could silently surface a
 * method incompatible with manual capture). `params.idempotencyKey` is
 * always the caller's responsibility (see idempotency.ts) — this
 * function never invents one, so the SAME call twice (double PAGAR
 * click, a retried server action after a timeout) always resolves to
 * Stripe's own idempotent response, never two PaymentIntents.
 */
export async function createAuthorization(params: CreateAuthorizationParams, stripeClient: StripePaymentIntentsClient = getStripeClient()): Promise<PaymentAuthorization> {
  try {
    const pi = await stripeClient.paymentIntents.create(
      {
        amount: params.amountMinorUnits,
        currency: params.currency.toLowerCase(),
        capture_method: "manual",
        payment_method_types: ["card"],
        metadata: params.metadata,
      },
      { idempotencyKey: params.idempotencyKey },
    );
    return toDomain(pi);
  } catch (err) {
    throw mapStripeError(err);
  }
}

/** Fase 3A §13/§16/§17 — a fresh, authoritative read of a PaymentIntent's current state directly from Stripe. Never trusts a cached/local copy for a verification decision. */
export async function getAuthorization(paymentIntentId: string, stripeClient: StripePaymentIntentsClient = getStripeClient()): Promise<PaymentAuthorization> {
  try {
    const pi = await stripeClient.paymentIntents.retrieve(paymentIntentId);
    return toDomain(pi);
  } catch (err) {
    throw mapStripeError(err);
  }
}

/**
 * Fase 3A §21 — cancels a NOT-YET-CAPTURED PaymentIntent (this codebase
 * never captures in this phase, so every authorization it creates is, by
 * construction, always cancelable up until a hypothetical future capture
 * phase exists). This is compensation/cleanup scaffolding for Fase 3B,
 * used here only for: (a) invalidating a superseded PaymentIntent when
 * the quote version changes before the customer authorizes (§8), and
 * (b) test/manual TEST-mode cleanup (§21/§26). Never a refund — nothing
 * this codebase creates has ever captured funds to refund.
 */
export async function cancelAuthorization(paymentIntentId: string, stripeClient: StripePaymentIntentsClient = getStripeClient()): Promise<PaymentAuthorization> {
  try {
    const pi = await stripeClient.paymentIntents.cancel(paymentIntentId);
    return toDomain(pi);
  } catch (err) {
    throw mapStripeError(err);
  }
}
