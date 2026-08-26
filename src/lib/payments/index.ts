import type { PaymentMethod, PaymentProvider } from "./types";
import { DemoPaymentProvider } from "./demo";
import { StripePaymentProvider } from "./stripe";
import { PayPalPaymentProvider } from "./paypal";
import { getAppMode, isPaymentsLiveEnabled } from "@/lib/env";

export type { PaymentProvider, ChargeRequest, ChargeResult, PaymentMethod } from "./types";

/**
 * Resolves which payment provider handles a given trip/method.
 *
 * Triple protection against accidental real charges:
 *   1. APP_MODE must be "production" (default is "demo").
 *   2. PAYMENTS_LIVE_ENABLED must explicitly be "true".
 *   3. The trip itself must NOT be marked isDemo — a demo trip always uses
 *      DemoPaymentProvider even if the app is otherwise in production mode
 *      with valid credentials.
 */
export function getPaymentProvider(method: PaymentMethod, opts: { tripIsDemo: boolean }): PaymentProvider {
  const liveAllowed = getAppMode() === "production" && isPaymentsLiveEnabled() && !opts.tripIsDemo;

  if (!liveAllowed) {
    return new DemoPaymentProvider();
  }

  if (method === "paypal") {
    return new PayPalPaymentProvider();
  }
  return new StripePaymentProvider();
}
