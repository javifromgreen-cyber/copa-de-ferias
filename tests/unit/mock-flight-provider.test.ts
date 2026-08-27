import { describe, it, expect } from "vitest";
import { MockFlightProvider } from "@/lib/providers/flights/mockFlightProvider";

describe("MockFlightProvider (§17/§26 — several concrete deterministic offers)", () => {
  it("returns several distinct offers, not a single fixed one", async () => {
    const provider = new MockFlightProvider();
    const offers = await provider.getOffers({
      originAirport: "MAD",
      destinationAirport: "AMS",
      outboundDate: new Date(2026, 5, 10),
      returnDate: new Date(2026, 5, 12),
    });
    expect(offers.length).toBeGreaterThan(3);
    const uniqueIds = new Set(offers.map((o) => o.id));
    expect(uniqueIds.size).toBe(offers.length);
  });

  it("spreads offers across different departure hours and prices, not a single hardcoded price", async () => {
    const provider = new MockFlightProvider();
    const offers = await provider.getOffers({
      originAirport: "MAD",
      destinationAirport: "AMS",
      outboundDate: new Date(2026, 5, 10),
      returnDate: new Date(2026, 5, 12),
    });
    const prices = new Set(offers.map((o) => o.pricePerPerson));
    const hours = new Set(offers.map((o) => o.outboundDeparture.getHours()));
    expect(prices.size).toBeGreaterThan(1);
    expect(hours.size).toBeGreaterThan(1);
  });

  it("is deterministic — same input always produces the same output", async () => {
    const provider = new MockFlightProvider();
    const params = { originAirport: "MAD", destinationAirport: "LHR", outboundDate: new Date(2026, 5, 10), returnDate: new Date(2026, 5, 12) };
    const first = await provider.getOffers(params);
    const second = await provider.getOffers(params);
    expect(first).toEqual(second);
  });
});
