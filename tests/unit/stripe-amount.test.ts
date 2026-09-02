import { describe, it, expect } from "vitest";
import { toStripeMinorUnits, fromStripeMinorUnits, isSupportedPaymentCurrency, UnsupportedPaymentCurrencyError } from "@/lib/providers/payments/stripe/amount";

// Fase 3A §4/§25 B — EUR -> Stripe minor units must be exact, never a
// naive float multiply that can drift a cent.

describe("B — toStripeMinorUnits: EUR -> minor units exact", () => {
  it("742.31 € -> 74231", () => {
    expect(toStripeMinorUnits(742.31, "EUR")).toBe(74231);
  });

  it("a whole-euro amount has no fractional drift", () => {
    expect(toStripeMinorUnits(100, "EUR")).toBe(10000);
  });

  it("values known to be float-hazardous (0.1 + 0.2-style sums) still round correctly", () => {
    // 19.99 * 3 = 59.97 in exact decimal, but as a raw float multiply
    // (19.99*100)*3-ish patterns can drift by a cent — exercise the
    // actual helper against a handful of such sums.
    expect(toStripeMinorUnits(19.99 * 3, "EUR")).toBe(5997);
    expect(toStripeMinorUnits(0.1 + 0.2, "EUR")).toBe(30);
    expect(toStripeMinorUnits(742.315, "EUR")).toBe(74232); // rounds half up to the cent
  });

  it("zero is valid (never expected in practice, but not an error case on its own)", () => {
    expect(toStripeMinorUnits(0, "EUR")).toBe(0);
  });

  it("rejects a negative amount", () => {
    expect(() => toStripeMinorUnits(-1, "EUR")).toThrow(RangeError);
  });

  it("rejects a non-finite amount", () => {
    expect(() => toStripeMinorUnits(NaN, "EUR")).toThrow(RangeError);
    expect(() => toStripeMinorUnits(Infinity, "EUR")).toThrow(RangeError);
  });
});

describe("§4 — currency is restricted to EUR by deliberate MVP scope decision", () => {
  it("rejects a non-EUR currency instead of guessing a minor-unit exponent", () => {
    expect(() => toStripeMinorUnits(100, "USD")).toThrow(UnsupportedPaymentCurrencyError);
    expect(() => toStripeMinorUnits(100, "GBP")).toThrow(UnsupportedPaymentCurrencyError);
  });

  it("is case-sensitive (matches FinalQuoteSnapshot's own uppercase ISO convention only)", () => {
    expect(() => toStripeMinorUnits(100, "eur")).toThrow(UnsupportedPaymentCurrencyError);
  });

  it("isSupportedPaymentCurrency mirrors the same rule", () => {
    expect(isSupportedPaymentCurrency("EUR")).toBe(true);
    expect(isSupportedPaymentCurrency("USD")).toBe(false);
  });
});

describe("fromStripeMinorUnits is the exact inverse for EUR", () => {
  it("74231 -> 742.31", () => {
    expect(fromStripeMinorUnits(74231, "EUR")).toBeCloseTo(742.31, 5);
  });

  it("rejects a non-EUR currency the same way", () => {
    expect(() => fromStripeMinorUnits(100, "USD")).toThrow(UnsupportedPaymentCurrencyError);
  });
});
