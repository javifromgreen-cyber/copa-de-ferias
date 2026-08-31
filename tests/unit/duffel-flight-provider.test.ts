import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { normalizeSegment, normalizeOffer, normalizeSearchResult } from "@/lib/providers/flights/duffel/normalize";
import { searchOneWayOffers, searchDirectOneWayOffers, filterDirectOffers } from "@/lib/providers/flights/duffel/search";
import { revalidateOffer } from "@/lib/providers/flights/duffel/revalidate";
import { createSandboxOrder } from "@/lib/providers/flights/duffel/order";
import { RealFlightProvider } from "@/lib/providers/flights/realFlightProvider";
import { ProviderError } from "@/lib/providers/errors";

// A fake, obviously-not-real test token — never a real credential, and no
// test in this file ever calls the real `fetch`; every request goes
// through an injected fetchImpl stub instead (§18).
const FAKE_TEST_TOKEN = "duffel_test_fake_for_unit_tests_only";

beforeEach(() => {
  vi.stubEnv("DUFFEL_ACCESS_TOKEN", FAKE_TEST_TOKEN);
  vi.stubEnv("APP_MODE", "demo");
  vi.stubEnv("ALLOW_SANDBOX_PROVIDER_BOOKING", "");
});
afterEach(() => vi.unstubAllEnvs());

function rawSegment(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    origin: { iata_code: "BCN" },
    destination: { iata_code: "MAN" },
    departing_at: "2026-10-15T18:40:00",
    arriving_at: "2026-10-15T20:15:00",
    marketing_carrier: { iata_code: "VY", name: "Vueling" },
    operating_carrier: { iata_code: "VY", name: "Vueling" },
    marketing_carrier_flight_number: "8748",
    passengers: [{ baggages: [{ type: "checked", quantity: 1 }] }],
    ...overrides,
  };
}

function rawOffer(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "off_test123",
    total_amount: "66.03",
    total_currency: "EUR",
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    slices: [{ segments: [rawSegment()] }],
    ...overrides,
  };
}

function fakeFetch(status: number, body: unknown): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

describe("normalizeSegment/normalizeOffer/normalizeSearchResult", () => {
  it("normalizes a segment, including a different operating carrier", () => {
    const seg = normalizeSegment(rawSegment({ operating_carrier: { iata_code: "XX", name: "Other Air" } }) as never);
    expect(seg.marketingCarrier.iata).toBe("VY");
    expect(seg.operatingCarrier).toEqual({ iata: "XX", name: "Other Air" });
  });

  it("normalizeSegment drops the operating carrier when it's the same as marketing", () => {
    const seg = normalizeSegment(rawSegment() as never);
    expect(seg.operatingCarrier).toBeNull();
  });

  it("normalizes a direct (1-segment) offer with baggage", () => {
    const offer = normalizeOffer(rawOffer() as never, false);
    expect(offer.segments).toHaveLength(1);
    expect(offer.totalAmount).toBe(66.03);
    expect(offer.currency).toBe("EUR");
    expect(offer.baggage).toEqual({ checkedIncluded: true, carryOnIncluded: false });
  });

  it("rejects a multi-slice offer (a bundled round trip) rather than silently picking one slice", () => {
    const raw = rawOffer({ slices: [{ segments: [rawSegment()] }, { segments: [rawSegment()] }] });
    expect(() => normalizeOffer(raw as never, false)).toThrow(ProviderError);
  });

  it("rejects an offer missing required fields", () => {
    expect(() => normalizeOffer({ id: "x" } as never, false)).toThrow(ProviderError);
  });

  it("normalizeSearchResult skips a malformed offer instead of failing the whole batch", () => {
    const raw = { id: "orq_1", live_mode: false, offers: [rawOffer(), { id: "broken" }] };
    const result = normalizeSearchResult(raw);
    expect(result.offers).toHaveLength(1);
  });

  it("normalizeSearchResult throws on a malformed top-level response", () => {
    expect(() => normalizeSearchResult({ not: "an offer request" })).toThrow(ProviderError);
  });
});

describe("filterDirectOffers", () => {
  it("keeps only single-segment (direct) offers — connections are rejected, never surfaced as an alternative", () => {
    const direct = normalizeOffer(rawOffer() as never, false);
    const connecting = normalizeOffer(rawOffer({ id: "off_conn", slices: [{ segments: [rawSegment(), rawSegment()] }] }) as never, false);
    expect(filterDirectOffers([direct, connecting])).toEqual([direct]);
  });
});

describe("searchOneWayOffers / searchDirectOneWayOffers", () => {
  it("builds a single-slice one-way request and normalizes the response", async () => {
    const fetchImpl = fakeFetch(201, { data: { id: "orq_1", live_mode: false, offers: [rawOffer()] } });
    const result = await searchOneWayOffers({ originIata: "BCN", destinationIata: "MAN", date: "2026-10-15", passengers: 1, fetchImpl });
    expect(result.offers).toHaveLength(1);
    const [, init] = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.data.slices).toHaveLength(1);
    expect(body.data.max_connections).toBe(0);
  });

  it("searchDirectOneWayOffers filters out a connecting result Duffel still returned", async () => {
    const raw = { id: "orq_1", live_mode: false, offers: [rawOffer(), rawOffer({ id: "off_conn", slices: [{ segments: [rawSegment(), rawSegment()] }] })] };
    const fetchImpl = fakeFetch(201, { data: raw });
    const result = await searchDirectOneWayOffers({ originIata: "BCN", destinationIata: "MAN", date: "2026-10-15", passengers: 1, fetchImpl });
    expect(result.offers).toHaveLength(1);
  });

  it("maps a Duffel 401/403 (bad/rejected token) to PROVIDER_UNAVAILABLE, not INVALID_PROVIDER_RESPONSE", async () => {
    const fetchImpl = fakeFetch(403, {});
    await expect(searchOneWayOffers({ originIata: "BCN", destinationIata: "MAN", date: "2026-10-15", passengers: 1, fetchImpl })).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
  });

  it("maps a Duffel 5xx to PROVIDER_UNAVAILABLE", async () => {
    const fetchImpl = fakeFetch(500, {});
    await expect(searchOneWayOffers({ originIata: "BCN", destinationIata: "MAN", date: "2026-10-15", passengers: 1, fetchImpl })).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
  });

  it("maps a network/timeout failure to PROVIDER_UNAVAILABLE", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("fetch failed");
    }) as unknown as typeof fetch;
    await expect(searchOneWayOffers({ originIata: "BCN", destinationIata: "MAN", date: "2026-10-15", passengers: 1, fetchImpl })).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
  });

  it("maps a malformed (non-JSON) response to INVALID_PROVIDER_RESPONSE", async () => {
    const fetchImpl = vi.fn(async () => new Response("not json", { status: 200 })) as unknown as typeof fetch;
    await expect(searchOneWayOffers({ originIata: "BCN", destinationIata: "MAN", date: "2026-10-15", passengers: 1, fetchImpl })).rejects.toMatchObject({ code: "INVALID_PROVIDER_RESPONSE" });
  });

  it("refuses to run without DUFFEL_ACCESS_TOKEN configured", async () => {
    vi.stubEnv("DUFFEL_ACCESS_TOKEN", "");
    await expect(searchOneWayOffers({ originIata: "BCN", destinationIata: "MAN", date: "2026-10-15", passengers: 1 })).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
  });
});

describe("revalidateOffer (§Duffel revalidación)", () => {
  it("reports unchanged when price matches and hasn't expired", async () => {
    const fetchImpl = fakeFetch(200, { data: rawOffer() });
    const result = await revalidateOffer("off_test123", 66.03, fetchImpl);
    expect(result.status).toBe("unchanged");
  });

  it("reports price_changed and never trusts a magic boolean — we compute it ourselves", async () => {
    const fetchImpl = fakeFetch(200, { data: rawOffer({ total_amount: "70.00" }) });
    const result = await revalidateOffer("off_test123", 66.03, fetchImpl);
    expect(result.status).toBe("price_changed");
    expect(result.offer?.totalAmount).toBe(70.0);
  });

  it("reports expired using the freshest expires_at received, never assuming the GET renewed it", async () => {
    const fetchImpl = fakeFetch(200, { data: rawOffer({ expires_at: new Date(Date.now() - 1000).toISOString() }) });
    const result = await revalidateOffer("off_test123", 66.03, fetchImpl);
    expect(result.status).toBe("expired");
  });

  it("reports not_found on a 404 instead of throwing — the caller must trigger a new search", async () => {
    const fetchImpl = fakeFetch(404, {});
    const result = await revalidateOffer("off_gone", 66.03, fetchImpl);
    expect(result.status).toBe("not_found");
    expect(result.offer).toBeNull();
  });
});

describe("createSandboxOrder — hard gate against accidental real bookings", () => {
  it("refuses when ALLOW_SANDBOX_PROVIDER_BOOKING is not set", async () => {
    await expect(createSandboxOrder("off_1", "66.03", "EUR", [], fakeFetch(201, {}))).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
  });

  it("refuses in APP_MODE=production even with the flag set", async () => {
    vi.stubEnv("ALLOW_SANDBOX_PROVIDER_BOOKING", "true");
    vi.stubEnv("APP_MODE", "production");
    await expect(createSandboxOrder("off_1", "66.03", "EUR", [], fakeFetch(201, {}))).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
  });

  it("refuses when the token doesn't look like a duffel_test_ token, even with the flag set", async () => {
    vi.stubEnv("ALLOW_SANDBOX_PROVIDER_BOOKING", "true");
    vi.stubEnv("DUFFEL_ACCESS_TOKEN", "duffel_live_something");
    await expect(createSandboxOrder("off_1", "66.03", "EUR", [], fakeFetch(201, {}))).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
  });

  it("succeeds when explicitly enabled, outside production, with a test token", async () => {
    vi.stubEnv("ALLOW_SANDBOX_PROVIDER_BOOKING", "true");
    const fetchImpl = fakeFetch(201, {
      data: { id: "ord_1", live_mode: false, booking_reference: "RH9R6K", total_amount: "66.03", total_currency: "EUR", slices: [{ segments: [rawSegment()] }] },
    });
    const result = await createSandboxOrder("off_1", "66.03", "EUR", [], fetchImpl);
    expect(result.orderId).toBe("ord_1");
    expect(result.bookingReference).toBe("RH9R6K");
    expect(result.liveMode).toBe(false);
  });
});

describe("RealFlightProvider — maps Duffel offers into NormalizedFlightLeg for the existing checkout engine", () => {
  it("getLegs maps a direct offer's price/times into a leg with stops: 0", async () => {
    const provider = new RealFlightProvider();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: { id: "orq_1", live_mode: false, offers: [rawOffer()] } }), { status: 201 }));
    const legs = await provider.getLegs({ originAirport: "BCN", destinationAirport: "MAN", date: new Date("2026-10-15") });
    expect(legs).toHaveLength(1);
    expect(legs[0]).toMatchObject({ provider: "duffel", originAirport: "BCN", destinationAirport: "MAN", pricePerPerson: 66.03, stops: 0 });
    fetchSpy.mockRestore();
  });

  it("getLegs never throws — degrades to [] on a provider error", async () => {
    const provider = new RealFlightProvider();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 500 }));
    const legs = await provider.getLegs({ originAirport: "BCN", destinationAirport: "MAN", date: new Date("2026-10-15") });
    expect(legs).toEqual([]);
    fetchSpy.mockRestore();
  });

  it("returns [] without calling the network when DUFFEL_ACCESS_TOKEN isn't configured", async () => {
    vi.stubEnv("DUFFEL_ACCESS_TOKEN", "");
    const provider = new RealFlightProvider();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const legs = await provider.getLegs({ originAirport: "BCN", destinationAirport: "MAN", date: new Date("2026-10-15") });
    expect(legs).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
