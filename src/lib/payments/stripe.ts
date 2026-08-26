import type { ChargeRequest, ChargeResult, PaymentProvider } from "./types";
import { stripeConfig } from "@/lib/env";

/**
 * Prepared for card, Apple Pay/Google Pay, Bizum and Klarna via Stripe.
 * Intentionally NOT wired to the real Stripe SDK yet — this is scaffolding
 * for when credentials exist and go-live is explicitly approved. See
 * docs/PAYMENTS.md for the activation checklist.
 */
export class StripePaymentProvider implements PaymentProvider {
  readonly kind = "stripe" as const;

  async charge(_request: ChargeRequest): Promise<ChargeResult> {
    if (!stripeConfig.isConfigured) {
      throw new Error(
        "StripePaymentProvider: no STRIPE_SECRET_KEY/STRIPE_PUBLISHABLE_KEY configured."
      );
    }
    // Intentionally not implemented: wire the Stripe SDK here
    // (PaymentIntents + webhook confirmation) only once credentials exist,
    // APP_MODE=production, PAYMENTS_LIVE_ENABLED=true, and go-live has been
    // explicitly approved. Never trust a client-side redirect as proof of
    // payment — always confirm via the Stripe webhook (idempotently).
    throw new Error("StripePaymentProvider is not activated in this build. See docs/PAYMENTS.md.");
  }
}
