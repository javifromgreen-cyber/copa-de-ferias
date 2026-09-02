// Server-only by convention (same as duffel/client.ts, nuitee/client.ts):
// this file must only ever be imported from server actions/route
// handlers/checkout-saga code, never from a client component — it holds
// STRIPE_SECRET_KEY in memory and constructs the authenticated SDK client.
import Stripe from "stripe";
import { stripeConfig } from "@/lib/env";
import { ProviderError, type ProviderErrorDetail } from "@/lib/providers/errors";

// Pinned to the `stripe` npm package version this project depends on
// (see package.json) — Stripe's own recommendation is to pin explicitly
// rather than float, so an SDK upgrade never silently changes request/
// response shapes underneath this adapter without a deliberate review.
const PINNED_API_VERSION = "2026-08-26.dahlia" as const;

let cachedClient: Stripe | null = null;

/**
 * Fase 3A §2 — the ONLY place in this codebase allowed to construct an
 * authenticated Stripe SDK client. Refuses to run against anything but a
 * Stripe TEST secret key: STRIPE_SECRET_KEY must both be present AND
 * start with `sk_test_` (stripeConfig.looksLikeTestKey) — never live,
 * never "trust the environment variable blindly". This is a real, hard
 * gate, not a soft warning: a live-looking key throws instead of being
 * used.
 */
export function getStripeClient(): Stripe {
  if (cachedClient) return cachedClient;
  if (!stripeConfig.secretKey) {
    throw new Error("Stripe is not configured — STRIPE_SECRET_KEY is missing. See .env.example.");
  }
  if (!stripeConfig.looksLikeTestKey) {
    throw new Error("Refusing to construct a Stripe client: STRIPE_SECRET_KEY does not look like a TEST key (sk_test_...). This build only ever authorizes in Stripe TEST mode.");
  }
  cachedClient = new Stripe(stripeConfig.secretKey, { apiVersion: PINNED_API_VERSION, typescript: true });
  return cachedClient;
}

/** Test-only escape hatch so a unit test that touches env mutation doesn't leak a cached client into the next test. Never called from production code. */
export function resetStripeClientCacheForTests(): void {
  cachedClient = null;
}

/**
 * Fase 3A §11/§13 — verifies a webhook payload's signature and decodes it
 * into a typed Stripe.Event. Throws (never returns a partially-trusted
 * event) when the signature doesn't match STRIPE_WEBHOOK_SECRET — the
 * route handler must respond 400 and do nothing else in that case (§11
 * "Nunca confiar en JSON sin Stripe-Signature + STRIPE_WEBHOOK_SECRET").
 */
export function constructStripeWebhookEvent(rawBody: string, signatureHeader: string, stripeClient: Pick<Stripe, "webhooks"> = getStripeClient()): Stripe.Event {
  if (!stripeConfig.webhookSecret) {
    throw new Error("Stripe webhook is not configured — STRIPE_WEBHOOK_SECRET is missing.");
  }
  return stripeClient.webhooks.constructEvent(rawBody, signatureHeader, stripeConfig.webhookSecret);
}

/**
 * Normalizes any Stripe SDK error into this codebase's shared
 * ProviderError taxonomy (see src/lib/providers/errors.ts — the exact
 * same RATE_LIMITED/PERMISSION_DENIED/AUTHENTICATION_FAILED/
 * PROVIDER_UNAVAILABLE/NETWORK_ERROR vocabulary Duffel and Nuitee's own
 * clients already use), so callers never branch on a Stripe-specific
 * error class. Detail is sanitized by construction — Stripe's own error
 * objects never carry the secret key or card data, only type/code/
 * status/requestId.
 */
export function mapStripeError(err: unknown): ProviderError {
  if (err instanceof Stripe.errors.StripeError) {
    const detail: ProviderErrorDetail = {
      httpStatus: err.statusCode,
      providerErrorType: err.type,
      providerErrorCode: err.code,
      requestId: err.requestId,
    };
    if (err instanceof Stripe.errors.StripeAuthenticationError) return new ProviderError("AUTHENTICATION_FAILED", "stripe", err.message, detail);
    if (err instanceof Stripe.errors.StripePermissionError) return new ProviderError("PERMISSION_DENIED", "stripe", err.message, detail);
    if (err instanceof Stripe.errors.StripeRateLimitError) return new ProviderError("RATE_LIMITED", "stripe", err.message, detail);
    if (err instanceof Stripe.errors.StripeConnectionError) return new ProviderError("NETWORK_ERROR", "stripe", err.message, detail);
    if (err instanceof Stripe.errors.StripeAPIError) return new ProviderError("PROVIDER_UNAVAILABLE", "stripe", err.message, detail);
    if (err instanceof Stripe.errors.StripeInvalidRequestError) return new ProviderError("INVALID_PROVIDER_RESPONSE", "stripe", err.message, detail);
    return new ProviderError("PROVIDER_UNAVAILABLE", "stripe", err.message, detail);
  }
  return new ProviderError("NETWORK_ERROR", "stripe", err instanceof Error ? err.message : String(err));
}
