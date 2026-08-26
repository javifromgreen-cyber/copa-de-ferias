import { describe, it, expect } from "vitest";
import { getPaymentProvider } from "@/lib/payments";
import { DemoPaymentProvider } from "@/lib/payments/demo";

describe("getPaymentProvider", () => {
  it("always returns the demo provider for a trip marked isDemo, regardless of env", () => {
    const provider = getPaymentProvider("card", { tripIsDemo: true });
    expect(provider).toBeInstanceOf(DemoPaymentProvider);
  });

  it("defaults to the demo provider when APP_MODE is not production", () => {
    const provider = getPaymentProvider("card", { tripIsDemo: false });
    expect(provider).toBeInstanceOf(DemoPaymentProvider);
  });
});

describe("DemoPaymentProvider", () => {
  it("never performs a real charge — it always simulates", async () => {
    const provider = new DemoPaymentProvider();
    const result = await provider.charge({
      bookingReference: "CDF-TEST",
      amount: 549,
      currency: "EUR",
      method: "card",
      buyerEmail: "ana@example.com",
      description: "Test",
    });
    expect(result.success).toBe(true);
    expect(result.isSimulated).toBe(true);
  });
});
