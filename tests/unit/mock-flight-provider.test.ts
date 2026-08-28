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

describe("MockFlightProvider.listEligibleDirectOriginsForTrip — round-trip eligibility (§21-23/§29)", () => {
  const params = { destinationAirport: "MAN", outboundDate: new Date(2026, 5, 10), returnDate: new Date(2026, 5, 12) };

  it("returns only Spanish airports with genuinely round-trip-direct service", async () => {
    const provider = new MockFlightProvider();
    const origins = await provider.listEligibleDirectOriginsForTrip(params);
    expect(origins.map((o) => o.iata).sort()).toEqual(["AGP", "BCN", "MAD"]);
  });

  it("excludes Sevilla (SVQ) — direct outbound only, no direct return — entirely", async () => {
    const provider = new MockFlightProvider();
    const origins = await provider.listEligibleDirectOriginsForTrip(params);
    expect(origins.map((o) => o.iata)).not.toContain("SVQ");
  });

  it("excludes Asturias (OVD) — no route at all for this destination", async () => {
    const provider = new MockFlightProvider();
    const origins = await provider.listEligibleDirectOriginsForTrip(params);
    expect(origins.map((o) => o.iata)).not.toContain("OVD");
  });

  it("SVQ's offers for this destination always carry stops > 0 — never a usable direct round trip", async () => {
    const provider = new MockFlightProvider();
    const offers = await provider.getOffers({ originAirport: "SVQ", destinationAirport: "MAN", outboundDate: params.outboundDate, returnDate: params.returnDate });
    expect(offers.length).toBeGreaterThan(0);
    expect(offers.every((o) => o.stops > 0)).toBe(true);
  });

  it("a destination with only one eligible Spanish origin (e.g. AMS/MXP) still returns just that one, not a hardcoded list", async () => {
    const provider = new MockFlightProvider();
    const origins = await provider.listEligibleDirectOriginsForTrip({ destinationAirport: "AMS", outboundDate: params.outboundDate, returnDate: params.returnDate });
    expect(origins.map((o) => o.iata)).toEqual(["MAD"]);
  });
});

describe("MockFlightProvider — Manchester daypart-unavailable fixture (§25/§30)", () => {
  it("MAD -> MAN has no afternoon return slot at all — a real 'unavailable' case", async () => {
    const provider = new MockFlightProvider();
    const offers = await provider.getOffers({ originAirport: "MAD", destinationAirport: "MAN", outboundDate: new Date(2026, 5, 10), returnDate: new Date(2026, 5, 12) });
    const returnHours = new Set(offers.map((o) => o.returnDeparture.getHours()));
    for (const h of returnHours) {
      expect(h).toBeLessThan(15); // every MAD return slot is before the afternoon window (15-20)
    }
  });
});
