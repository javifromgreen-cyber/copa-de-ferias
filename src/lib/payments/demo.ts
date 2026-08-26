import type { ChargeRequest, ChargeResult, PaymentProvider } from "./types";
import { generateAccessToken } from "@/lib/utils";

/**
 * Always "succeeds" without moving any real money. Used for every booking
 * while APP_MODE=demo, and always for any trip marked isDemo=true
 * regardless of APP_MODE — see src/lib/payments/index.ts for the full gate.
 */
export class DemoPaymentProvider implements PaymentProvider {
  readonly kind = "demo" as const;

  async charge(request: ChargeRequest): Promise<ChargeResult> {
    return {
      success: true,
      providerReference: `DEMO-${generateAccessToken().slice(0, 10).toUpperCase()}`,
      isSimulated: true,
      raw: { note: "Simulated charge, no real payment was processed.", request },
    };
  }
}
