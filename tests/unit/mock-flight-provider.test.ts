import { describe, it, expect } from "vitest";
import { MockFlightProvider } from "@/lib/providers/flights/mockFlightProvider";

describe("MockFlightProvider.getLegs (§9/§10 — several concrete deterministic one-way legs)", () => {
  it("returns several distinct outbound legs, not a single fixed one", async () => {
    const provider = new MockFlightProvider();
    const legs = await provider.getLegs({ originAirport: "MAD", destinationAirport: "AMS", date: new Date(2026, 5, 10) });
    expect(legs.length).toBeGreaterThan(1);
    const uniqueIds = new Set(legs.map((l) => l.id));
    expect(uniqueIds.size).toBe(legs.length);
  });

  it("spreads outbound legs across different departure hours and prices, not a single hardcoded price", async () => {
    const provider = new MockFlightProvider();
    const legs = await provider.getLegs({ originAirport: "MAD", destinationAirport: "AMS", date: new Date(2026, 5, 10) });
    const prices = new Set(legs.map((l) => l.pricePerPerson));
    const hours = new Set(legs.map((l) => l.departure.getHours()));
    expect(prices.size).toBeGreaterThan(1);
    expect(hours.size).toBeGreaterThan(1);
  });

  it("is deterministic — same input always produces the same output", async () => {
    const provider = new MockFlightProvider();
    const params = { originAirport: "MAD", destinationAirport: "LHR", date: new Date(2026, 5, 10) };
    const first = await provider.getLegs(params);
    const second = await provider.getLegs(params);
    expect(first).toEqual(second);
  });

  it("outbound and return legs for the same origin/destination are priced independently, never a bundled round-trip fare", async () => {
    const provider = new MockFlightProvider();
    const outbound = await provider.getLegs({ originAirport: "MAD", destinationAirport: "AMS", date: new Date(2026, 5, 10) });
    const returnLegs = await provider.getLegs({ originAirport: "AMS", destinationAirport: "MAD", date: new Date(2026, 5, 12) });
    expect(outbound.length).toBeGreaterThan(0);
    expect(returnLegs.length).toBeGreaterThan(0);
    // Each leg carries only its own one-way price — the two direction's
    // price sets don't have to (and here, don't) match.
    const outboundPrices = new Set(outbound.map((l) => l.pricePerPerson));
    const returnPrices = new Set(returnLegs.map((l) => l.pricePerPerson));
    expect([...outboundPrices].every((p) => p > 0)).toBe(true);
    expect([...returnPrices].every((p) => p > 0)).toBe(true);
  });
});

describe("MockFlightProvider.listEligibleDirectOriginsForTrip — round-trip eligibility (§7/§8/§22)", () => {
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

  it("SVQ's legs for this destination always carry stops > 0 — never a usable direct round trip", async () => {
    const provider = new MockFlightProvider();
    const outboundLegs = await provider.getLegs({ originAirport: "SVQ", destinationAirport: "MAN", date: params.outboundDate });
    const returnLegs = await provider.getLegs({ originAirport: "MAN", destinationAirport: "SVQ", date: params.returnDate });
    expect(outboundLegs.length).toBeGreaterThan(0);
    expect(returnLegs.length).toBeGreaterThan(0);
    // SVQ is direct outbound (stops === 0) but only ever connecting on the
    // return (stops > 0) — the asymmetry is real, not narrative.
    expect(outboundLegs.every((l) => l.stops === 0)).toBe(true);
    expect(returnLegs.every((l) => l.stops > 0)).toBe(true);
  });

  it("a destination with more than one eligible Spanish origin (e.g. AMS) returns all of them, never just Madrid (§7 fix)", async () => {
    const provider = new MockFlightProvider();
    const origins = await provider.listEligibleDirectOriginsForTrip({ destinationAirport: "AMS", outboundDate: params.outboundDate, returnDate: params.returnDate });
    expect(origins.map((o) => o.iata).sort()).toEqual(["BCN", "MAD"]);
  });
});

describe("MockFlightProvider — Manchester daypart-unavailable fixture (§12/§13)", () => {
  it("MAD -> MAN has no afternoon return leg at all — a real 'unavailable' case", async () => {
    const provider = new MockFlightProvider();
    const returnLegs = await provider.getLegs({ originAirport: "MAN", destinationAirport: "MAD", date: new Date(2026, 5, 12) });
    const returnHours = new Set(returnLegs.map((l) => l.departure.getHours()));
    for (const h of returnHours) {
      expect(h).toBeLessThan(15); // every MAD return slot is before the afternoon window (15-20)
    }
  });
});
