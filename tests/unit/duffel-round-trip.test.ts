import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { normalizeRoundTripOffer, normalizeRoundTripSearchResult } from "@/lib/providers/flights/duffel/normalize";
import { searchRoundTripOffers, searchDirectRoundTripOffers, isDirectRoundTripOffer, filterDirectRoundTripOffers, filterRoundTripOffersByDaypart } from "@/lib/providers/flights/duffel/roundTripSearch";
import { revalidateRoundTripOffer } from "@/lib/providers/flights/duffel/revalidate";
import { ProviderError } from "@/lib/providers/errors";

// Fase 1.5 §2-§10 — the MVP never books ida/vuelta as two independent
// Duffel Orders. Every test here mocks HTTP explicitly (fetchImpl stub);
// none ever touches the real network, matching the convention already
// established in tests/unit/duffel-flight-provider.test.ts.
const FAKE_TEST_TOKEN = "duffel_test_fake_for_unit_tests_only";

beforeEach(() => {
  vi.stubEnv("DUFFEL_ACCESS_TOKEN", FAKE_TEST_TOKEN);
  vi.stubEnv("APP_MODE", "demo");
});
afterEach(() => vi.unstubAllEnvs());

function rawSegment(overrides: Partial<Record<string, unknown>> = {}) {
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

function returnSegment(overrides: Partial<Record<string, unknown>> = {}) {
  return rawSegment({
    origin: { iata_code: "MAN" },
    destination: { iata_code: "BCN" },
    departing_at: "2026-10-18T18:30:00",
    arriving_at: "2026-10-18T22:00:00",
    ...overrides,
  });
}

function rawRoundTripOffer(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "off_rt_test123",
    total_amount: "180.50",
    total_currency: "EUR",
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    slices: [{ segments: [rawSegment()] }, { segments: [returnSegment()] }],
    ...overrides,
  };
}

function rawOfferRequest(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "orq_rt_1",
    live_mode: false,
    passengers: [{ id: "pas_00001" }, { id: "pas_00002" }],
    offers: [rawRoundTripOffer()],
    ...overrides,
  };
}

function fakeFetch(status: number, body: unknown): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

describe("A — the Offer Request is built with 2 slices (outbound + return)", () => {
  it("sends exactly two slices, origin/destination reversed for the return", async () => {
    const fetchImpl = fakeFetch(201, { data: rawOfferRequest() });
    await searchRoundTripOffers({ originIata: "BCN", destinationIata: "MAN", outboundDate: "2026-10-15", returnDate: "2026-10-18", passengers: 1, fetchImpl });
    const [, init] = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.data.slices).toHaveLength(2);
    expect(body.data.slices[0]).toMatchObject({ origin: "BCN", destination: "MAN", departure_date: "2026-10-15" });
    expect(body.data.slices[1]).toMatchObject({ origin: "MAN", destination: "BCN", departure_date: "2026-10-18" });
  });
});

describe("B — an offer with outbound direct + return direct is accepted", () => {
  it("normalizes into one RoundTripFlightOffer with both slices intact", () => {
    const offer = normalizeRoundTripOffer(rawRoundTripOffer() as never, false, "orq_rt_1", ["pas_00001"]);
    expect(offer.outbound.segments).toHaveLength(1);
    expect(offer.return.segments).toHaveLength(1);
    expect(isDirectRoundTripOffer(offer)).toBe(true);
  });
});

describe("C — outbound with a connection is discarded", () => {
  it("filterDirectRoundTripOffers drops an offer whose outbound slice has 2 segments", () => {
    const raw = rawRoundTripOffer({ slices: [{ segments: [rawSegment(), rawSegment()] }, { segments: [returnSegment()] }] });
    const offer = normalizeRoundTripOffer(raw as never, false, "orq_rt_1", []);
    expect(isDirectRoundTripOffer(offer)).toBe(false);
    expect(filterDirectRoundTripOffers([offer])).toEqual([]);
  });
});

describe("D — return with a connection is discarded", () => {
  it("filterDirectRoundTripOffers drops an offer whose return slice has 2 segments", () => {
    const raw = rawRoundTripOffer({ slices: [{ segments: [rawSegment()] }, { segments: [returnSegment(), returnSegment()] }] });
    const offer = normalizeRoundTripOffer(raw as never, false, "orq_rt_1", []);
    expect(isDirectRoundTripOffer(offer)).toBe(false);
    expect(filterDirectRoundTripOffers([offer])).toEqual([]);
  });
});

describe("E/F — outbound daypart filter", () => {
  it("E: ida mañana keeps a 09:00 outbound", () => {
    const offer = normalizeRoundTripOffer(rawRoundTripOffer() as never, false, "orq_rt_1", []); // outbound 09:00
    expect(filterRoundTripOffersByDaypart([offer], "MORNING", "ANY")).toEqual([offer]);
  });

  it("F: ida tarde rejects that same 09:00 outbound", () => {
    const offer = normalizeRoundTripOffer(rawRoundTripOffer() as never, false, "orq_rt_1", []);
    expect(filterRoundTripOffersByDaypart([offer], "AFTERNOON", "ANY")).toEqual([]);
  });
});

describe("G/H — return daypart filter", () => {
  it("G: vuelta mañana rejects the 18:30 return", () => {
    const offer = normalizeRoundTripOffer(rawRoundTripOffer() as never, false, "orq_rt_1", []); // return 18:30 -> afternoon
    expect(filterRoundTripOffersByDaypart([offer], "ANY", "MORNING")).toEqual([]);
  });

  it("H: vuelta tarde keeps the 18:30 return", () => {
    const offer = normalizeRoundTripOffer(rawRoundTripOffer() as never, false, "orq_rt_1", []);
    expect(filterRoundTripOffersByDaypart([offer], "ANY", "AFTERNOON")).toEqual([offer]);
  });
});

describe("I — combined ida mañana + vuelta tarde", () => {
  it("accepts the offer (outbound 09:00 morning + return 18:30 afternoon) and rejects the mismatched examples from the brief", () => {
    const valid = normalizeRoundTripOffer(rawRoundTripOffer() as never, false, "orq_rt_1", []);
    expect(filterRoundTripOffersByDaypart([valid], "MORNING", "AFTERNOON")).toEqual([valid]);

    // The brief's second example: outbound BCN 17:00 -> afternoon, so it must be rejected for an "ida mañana" preference even though the return still matches.
    const raw = rawRoundTripOffer({ slices: [{ segments: [rawSegment({ departing_at: "2026-10-15T17:00:00", arriving_at: "2026-10-15T18:30:00" })] }, { segments: [returnSegment()] }] });
    const invalid = normalizeRoundTripOffer(raw as never, false, "orq_rt_1", []);
    expect(filterRoundTripOffersByDaypart([invalid], "MORNING", "AFTERNOON")).toEqual([]);
  });
});

describe("J — the normalized result contains ONE single offerId", () => {
  it("never two independent offer ids for outbound/return", () => {
    const offer = normalizeRoundTripOffer(rawRoundTripOffer() as never, false, "orq_rt_1", []);
    expect(offer.offerId).toBe("off_rt_test123");
    expect(offer).not.toHaveProperty("outboundOfferId");
    expect(offer).not.toHaveProperty("returnOfferId");
  });

  it("rejects a single-slice (one-way) offer passed to the round-trip normalizer — it is not a round trip", () => {
    const oneWay = { id: "off_ow", total_amount: "50", total_currency: "EUR", expires_at: new Date(Date.now() + 60_000).toISOString(), slices: [{ segments: [rawSegment()] }] };
    expect(() => normalizeRoundTripOffer(oneWay as never, false, "orq_rt_1", [])).toThrow(ProviderError);
  });
});

describe("K — the normalized price uses the offer's own total_amount", () => {
  it("never sums an independent outbound + return price", () => {
    const offer = normalizeRoundTripOffer(rawRoundTripOffer({ total_amount: "180.50" }) as never, false, "orq_rt_1", []);
    expect(offer.totalAmount).toBe(180.5);
    expect(offer.currency).toBe("EUR");
  });
});

describe("L — Duffel passenger ids survive normalization", () => {
  it("normalizeRoundTripSearchResult carries the offer_request's passengers through to every offer", () => {
    const result = normalizeRoundTripSearchResult(rawOfferRequest());
    expect(result.offers).toHaveLength(1);
    expect(result.offers[0].passengerIds).toEqual(["pas_00001", "pas_00002"]);
  });

  it("an offer_request with no passengers array normalizes to an empty (never undefined/crashing) passengerIds list", () => {
    const result = normalizeRoundTripSearchResult(rawOfferRequest({ passengers: undefined }));
    expect(result.offers[0].passengerIds).toEqual([]);
  });
});

describe("M — revalidation works over the single round-trip offerId", () => {
  it("reports unchanged and keeps both slices + passenger ids on the revalidated offer", async () => {
    const fetchImpl = fakeFetch(200, { data: rawRoundTripOffer() });
    const result = await revalidateRoundTripOffer("off_rt_test123", 180.5, "orq_rt_1", ["pas_00001"], fetchImpl);
    expect(result.status).toBe("unchanged");
    expect(result.offer?.offerId).toBe("off_rt_test123");
    expect(result.offer?.outbound.segments).toHaveLength(1);
    expect(result.offer?.return.segments).toHaveLength(1);
    expect(result.offer?.passengerIds).toEqual(["pas_00001"]);
  });

  it("reports price_changed when the round-trip total_amount differs", async () => {
    const fetchImpl = fakeFetch(200, { data: rawRoundTripOffer({ total_amount: "199.00" }) });
    const result = await revalidateRoundTripOffer("off_rt_test123", 180.5, "orq_rt_1", [], fetchImpl);
    expect(result.status).toBe("price_changed");
  });

  it("reports not_found on a 404 instead of throwing", async () => {
    const fetchImpl = fakeFetch(404, {});
    const result = await revalidateRoundTripOffer("off_gone", 180.5, "orq_rt_1", [], fetchImpl);
    expect(result.status).toBe("not_found");
    expect(result.offer).toBeNull();
  });
});

describe("searchDirectRoundTripOffers — client-side direct enforcement, never trusting max_connections alone", () => {
  it("filters out a connecting round-trip result Duffel still returned", async () => {
    const raw = rawOfferRequest({
      offers: [rawRoundTripOffer(), rawRoundTripOffer({ id: "off_rt_conn", slices: [{ segments: [rawSegment(), rawSegment()] }, { segments: [returnSegment()] }] })],
    });
    const fetchImpl = fakeFetch(201, { data: raw });
    const result = await searchDirectRoundTripOffers({ originIata: "BCN", destinationIata: "MAN", outboundDate: "2026-10-15", returnDate: "2026-10-18", passengers: 1, fetchImpl });
    expect(result.offers).toHaveLength(1);
    expect(result.offers[0].offerId).toBe("off_rt_test123");
  });
});
