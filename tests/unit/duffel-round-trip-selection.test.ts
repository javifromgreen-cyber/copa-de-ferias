import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { normalizeRoundTripOffer } from "@/lib/providers/flights/duffel/normalize";
import { revalidateRoundTripOffer } from "@/lib/providers/flights/duffel/revalidate";
import {
  flightSliceKey,
  buildOutboundSliceOptions,
  buildReturnSliceOptionsForOutbound,
  resolveRoundTripOffer,
  revalidatedOfferMatchesSelectedItinerary,
} from "@/lib/providers/flights/duffel/roundTripSelection";
import type { RoundTripFlightOffer } from "@/lib/providers/flights/duffel/types";

// Fase 1.6 §2-§10 — the selection layer the future real checkout will use
// to let the user pick ida/vuelta independently while every option and
// every final resolution stays anchored to real RoundTripFlightOffer[]
// data from ONE search — never two independently-combined one-way offers.

beforeEach(() => {
  vi.stubEnv("DUFFEL_ACCESS_TOKEN", "duffel_test_fake_for_unit_tests_only");
  vi.stubEnv("APP_MODE", "demo");
});
afterEach(() => vi.unstubAllEnvs());

function seg(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    origin: { iata_code: "BCN" },
    destination: { iata_code: "MAN" },
    departing_at: "2026-10-15T09:00:00",
    arriving_at: "2026-10-15T10:30:00",
    marketing_carrier: { iata_code: "VY", name: "Vueling" },
    operating_carrier: { iata_code: "VY", name: "Vueling" },
    marketing_carrier_flight_number: "8748",
    ...overrides,
  };
}

// The brief's own example: Offer1 = A+X (120), Offer2 = A+Y (135), Offer3 = B+X (128), Offer4 = C+Z (110).
const OUTBOUND_A = seg(); // BCN 09:00 -> MAN 10:30, VY8748 (morning)
const OUTBOUND_B = seg({ departing_at: "2026-10-15T14:00:00", arriving_at: "2026-10-15T15:30:00", marketing_carrier_flight_number: "8750" }); // midday
const OUTBOUND_C = seg({ origin: { iata_code: "MAD" }, departing_at: "2026-10-15T08:00:00", arriving_at: "2026-10-15T09:45:00", marketing_carrier: { iata_code: "IB", name: "Iberia" }, operating_carrier: { iata_code: "IB", name: "Iberia" }, marketing_carrier_flight_number: "3201" }); // morning, different route+carrier than A

const RETURN_X = seg({ origin: { iata_code: "MAN" }, destination: { iata_code: "BCN" }, departing_at: "2026-10-18T18:30:00", arriving_at: "2026-10-18T22:00:00", marketing_carrier_flight_number: "8749" }); // afternoon
const RETURN_Y = seg({ origin: { iata_code: "MAN" }, destination: { iata_code: "BCN" }, departing_at: "2026-10-18T09:00:00", arriving_at: "2026-10-18T12:30:00", marketing_carrier_flight_number: "8751" }); // morning
const RETURN_Z = seg({ origin: { iata_code: "MAN" }, destination: { iata_code: "MAD" }, departing_at: "2026-10-18T19:00:00", arriving_at: "2026-10-18T22:30:00", marketing_carrier: { iata_code: "IB", name: "Iberia" }, operating_carrier: { iata_code: "IB", name: "Iberia" }, marketing_carrier_flight_number: "3202" }); // afternoon

function rawOffer(id: string, outbound: ReturnType<typeof seg>, ret: ReturnType<typeof seg>, totalAmount: string, currency = "EUR") {
  return { id, total_amount: totalAmount, total_currency: currency, expires_at: new Date(Date.now() + 60_000).toISOString(), slices: [{ segments: [outbound] }, { segments: [ret] }] };
}

function offer(id: string, outbound: ReturnType<typeof seg>, ret: ReturnType<typeof seg>, totalAmount: string, currency = "EUR"): RoundTripFlightOffer {
  return normalizeRoundTripOffer(rawOffer(id, outbound, ret, totalAmount, currency) as never, false, "orq_1", ["pas_1"]);
}

const offer1 = offer("off_1", OUTBOUND_A, RETURN_X, "120.00"); // A + X
const offer2 = offer("off_2", OUTBOUND_A, RETURN_Y, "135.00"); // A + Y
const offer3 = offer("off_3", OUTBOUND_B, RETURN_X, "128.00"); // B + X
const offer4 = offer("off_4", OUTBOUND_C, RETURN_Z, "110.00"); // C + Z

const ALL_OFFERS = [offer1, offer2, offer3, offer4];
const outboundKeyA = flightSliceKey(offer1.outbound);
const outboundKeyB = flightSliceKey(offer3.outbound);
const returnKeyX = flightSliceKey(offer1.return);
const returnKeyY = flightSliceKey(offer2.return);
const returnKeyZ = flightSliceKey(offer4.return);

describe("A — grouping: several offers sharing outbound A collapse into one UI option", () => {
  it("buildOutboundSliceOptions returns 3 distinct outbounds (A, B, C), not 4", () => {
    const options = buildOutboundSliceOptions(ALL_OFFERS);
    expect(options).toHaveLength(3);
    expect(options.map((o) => o.key).sort()).toEqual([outboundKeyA, outboundKeyB, flightSliceKey(offer4.outbound)].sort());
  });
});

describe("B — return options are scoped to the selected outbound", () => {
  it("selecting A offers X/Y, never Z (which only belongs to C)", () => {
    const returns = buildReturnSliceOptionsForOutbound(ALL_OFFERS, outboundKeyA);
    const keys = returns.map((r) => r.key).sort();
    expect(keys).toEqual([returnKeyX, returnKeyY].sort());
    expect(keys).not.toContain(returnKeyZ);
  });
});

describe("C/D — resolving a chosen outbound+return pair to ONE offer", () => {
  it("C: A + Y resolves to off_2", () => {
    const result = resolveRoundTripOffer(ALL_OFFERS, outboundKeyA, returnKeyY);
    expect(result).toEqual({ ok: true, offer: offer2 });
  });

  it("D: B + X resolves to off_3", () => {
    const result = resolveRoundTripOffer(ALL_OFFERS, outboundKeyB, returnKeyX);
    expect(result).toEqual({ ok: true, offer: offer3 });
  });
});

describe("E — a combination that never exists in the offer set resolves nothing", () => {
  it("A + Z (Z only belongs to C) does not resolve", () => {
    const result = resolveRoundTripOffer(ALL_OFFERS, outboundKeyA, returnKeyZ);
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });
});

describe("F — outbound daypart filter (morning)", () => {
  it("keeps A and C (both morning), excludes B (midday)", () => {
    const options = buildOutboundSliceOptions(ALL_OFFERS, "MORNING");
    const keys = options.map((o) => o.key).sort();
    expect(keys).toEqual([outboundKeyA, flightSliceKey(offer4.outbound)].sort());
    expect(keys).not.toContain(outboundKeyB);
  });
});

describe("G — return daypart filter (afternoon), applied AFTER selecting an outbound", () => {
  it("selecting A then filtering returns to afternoon keeps only X (18:30), not Y (09:00 morning)", () => {
    const returns = buildReturnSliceOptionsForOutbound(ALL_OFFERS, outboundKeyA, "AFTERNOON");
    expect(returns.map((r) => r.key)).toEqual([returnKeyX]);
  });
});

describe("H — same itinerary, different price: deterministic cheapest, only when comparable", () => {
  it("a cheaper offer for the exact same A+X itinerary wins", () => {
    const cheaperAX = offer("off_1_cheap", OUTBOUND_A, RETURN_X, "95.00");
    const result = resolveRoundTripOffer([offer1, cheaperAX], outboundKeyA, returnKeyX);
    expect(result).toEqual({ ok: true, offer: cheaperAX });
  });

  it("refuses to guess across a genuine currency mismatch for the same itinerary — not_comparable, never invented", () => {
    const gbpAX = offer("off_1_gbp", OUTBOUND_A, RETURN_X, "90.00", "GBP");
    const result = resolveRoundTripOffer([offer1, gbpAX], outboundKeyA, returnKeyX);
    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === "not_comparable") {
      expect(result.candidates.map((o) => o.offerId).sort()).toEqual([offer1.offerId, gbpAX.offerId].sort());
    } else {
      throw new Error("expected not_comparable");
    }
  });
});

describe("I — no artificial per-leg price in the new model", () => {
  it("FlightSliceOption/RoundTripFlightSlice never carry a price/outboundPrice/returnPrice field", () => {
    const options = buildOutboundSliceOptions(ALL_OFFERS);
    for (const option of options) {
      expect(option.slice).not.toHaveProperty("price");
      expect(option.slice).not.toHaveProperty("pricePerPerson");
      expect(Object.keys(option.slice)).toEqual(["segments"]);
    }
    expect(offer1).not.toHaveProperty("outboundPrice");
    expect(offer1).not.toHaveProperty("returnPrice");
  });
});

describe("J — the resolved selection keeps every field a future Order needs", () => {
  it("offerId, offerRequestId, passengerIds, expiresAt, totalAmount, currency, outbound, return", () => {
    const result = resolveRoundTripOffer(ALL_OFFERS, outboundKeyA, returnKeyY);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.offer).toMatchObject({
      offerId: "off_2",
      offerRequestId: "orq_1",
      passengerIds: ["pas_1"],
      currency: "EUR",
      totalAmount: 135,
    });
    expect(result.offer.expiresAt).toBeInstanceOf(Date);
    expect(result.offer.outbound.segments).toHaveLength(1);
    expect(result.offer.return.segments).toHaveLength(1);
  });
});

describe("K — revalidation of the single offerId preserves identity of both slices", () => {
  function fakeFetch(status: number, body: unknown): typeof fetch {
    return vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
  }

  it("an unchanged revalidated offer still matches the originally selected outbound+return keys", async () => {
    const fetchImpl = fakeFetch(200, { data: rawOffer("off_2", OUTBOUND_A, RETURN_Y, "135.00") });
    const revalidation = await revalidateRoundTripOffer("off_2", 135, "orq_1", ["pas_1"], fetchImpl);
    expect(revalidation.offer).not.toBeNull();
    if (!revalidation.offer) return;
    expect(revalidatedOfferMatchesSelectedItinerary(revalidation.offer, outboundKeyA, returnKeyY)).toBe(true);
  });

  it("a revalidated offer whose outbound segment changed (different time/flight) is detected as a DIFFERENT itinerary", async () => {
    const changedOutbound = seg({ departing_at: "2026-10-15T11:00:00", arriving_at: "2026-10-15T12:30:00", marketing_carrier_flight_number: "9999" });
    const fetchImpl = fakeFetch(200, { data: rawOffer("off_2", changedOutbound, RETURN_Y, "135.00") });
    const revalidation = await revalidateRoundTripOffer("off_2", 135, "orq_1", ["pas_1"], fetchImpl);
    expect(revalidation.offer).not.toBeNull();
    if (!revalidation.offer) return;
    expect(revalidatedOfferMatchesSelectedItinerary(revalidation.offer, outboundKeyA, returnKeyY)).toBe(false);
  });
});
