import type { ChargeRequest, ChargeResult, PaymentProvider } from "./types";
import { paypalConfig } from "@/lib/env";

/**
 * Prepared for PayPal Checkout, including Pay Later where available to the
 * buyer. Kept separate from Stripe per the product spec. Not wired to the
 * real PayPal SDK yet — see docs/PAYMENTS.md for the activation checklist.
 */
export class PayPalPaymentProvider implements PaymentProvider {
  readonly kind = "paypal" as const;

  async charge(_request: ChargeRequest): Promise<ChargeResult> {
    if (!paypalConfig.isConfigured) {
      throw new Error("PayPalPaymentProvider: no PAYPAL_CLIENT_ID/PAYPAL_CLIENT_SECRET configured.");
    }
    throw new Error("PayPalPaymentProvider is not activated in this build. See docs/PAYMENTS.md.");
  }
}
