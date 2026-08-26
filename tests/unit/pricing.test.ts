import { describe, it, expect } from "vitest";
import { calculateBookingPrice } from "@/lib/trips/pricing";

const trip = { price: 549, singleSupplement: 90, currency: "EUR" };

describe("calculateBookingPrice", () => {
  it("multiplies the per-person price by the number of travelers", () => {
    const result = calculateBookingPrice(trip, 3, 0);
    expect(result.baseSubtotal).toBe(549 * 3);
    expect(result.total).toBe(549 * 3);
  });

  it("adds the single-room supplement once per single room requested", () => {
    const result = calculateBookingPrice(trip, 2, 1);
    expect(result.singleSupplementSubtotal).toBe(90);
    expect(result.total).toBe(549 * 2 + 90);
  });

  it("adds the supplement per single room when several travelers go individual", () => {
    const result = calculateBookingPrice(trip, 4, 2);
    expect(result.total).toBe(549 * 4 + 90 * 2);
  });

  it("uses the same PVP regardless of origin city (not a parameter of the calculation)", () => {
    const barcelona = calculateBookingPrice(trip, 2, 0);
    const madrid = calculateBookingPrice(trip, 2, 0);
    expect(barcelona.total).toBe(madrid.total);
  });
});
