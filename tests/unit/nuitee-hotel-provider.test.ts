import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { computeRequiredRoomMix } from "@/lib/pricing/roomMix";
import { roomMixToOccupancies } from "@/lib/providers/hotels/nuitee/occupancies";
import { normalizeTaxesAndFees, normalizeSearchResult } from "@/lib/providers/hotels/nuitee/normalize";
import { searchHotels } from "@/lib/providers/hotels/nuitee/search";
import { prebookOffer, evaluatePrebookChange } from "@/lib/providers/hotels/nuitee/prebook";
import { bookPrebook, generateClientReference } from "@/lib/providers/hotels/nuitee/book";
import { buildRoomingSnapshot } from "@/lib/providers/hotels/nuitee/roomingSnapshot";
import { ProviderError } from "@/lib/providers/errors";

const FAKE_SANDBOX_KEY = "sand_fake_for_unit_tests_only";

beforeEach(() => {
  vi.stubEnv("NUITEE_API_KEY", FAKE_SANDBOX_KEY);
  vi.stubEnv("APP_MODE", "demo");
  vi.stubEnv("ALLOW_SANDBOX_PROVIDER_BOOKING", "");
});
afterEach(() => vi.unstubAllEnvs());

function fakeFetch(status: number, body: unknown): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

function rawRate(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    offerId: "rate_1",
    roomType: "Double Room",
    maxOccupancy: 2,
    adultCount: 2,
    board: "Room Only",
    retailRate: { total: 240, currency: "EUR" },
    refundableTag: "RFN",
    taxesAndFees: [
      { included: true, description: "Resort fee", amount: 10, currency: "EUR" },
      { included: false, description: "City tax", amount: 6, currency: "EUR" },
      { included: false, description: "Daily Facilities Fee due and payable direct to the property at check in", amount: 15, currency: "EUR" },
    ],
    cancellationPolicies: [{ amount: 240, currency: "EUR", type: "full" }],
    ...overrides,
  };
}

function rawHotel(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    hotelId: "hotel_1",
    name: "Hotel Test",
    address: "Calle Falsa 123",
    city: "Manchester",
    stars: 4,
    rating: 8.5,
    reviewCount: 120,
    latitude: 53.48,
    longitude: -2.24,
    photo: "https://example.com/photo.jpg",
    rates: [rawRate()],
    ...overrides,
  };
}

describe("roomMixToOccupancies (§4 — direct translation, no new algorithm)", () => {
  const cases: [number, { adults: number }[]][] = [
    [1, [{ adults: 1 }]],
    [2, [{ adults: 2 }]],
    [3, [{ adults: 3 }]],
    [4, [{ adults: 2 }, { adults: 2 }]],
    [5, [{ adults: 3 }, { adults: 2 }]],
    [6, [{ adults: 2 }, { adults: 2 }, { adults: 2 }]],
  ];
  for (const [partySize, expected] of cases) {
    it(`party of ${partySize} -> ${JSON.stringify(expected)}`, () => {
      expect(roomMixToOccupancies(computeRequiredRoomMix(partySize))).toEqual(expected);
    });
  }
});

describe("normalizeTaxesAndFees (§8 — included vs excluded, never assume excluded == chargeable by us)", () => {
  it("splits included and excluded fees, preserving description/amount/currency", () => {
    const { included, excluded } = normalizeTaxesAndFees(rawRate().taxesAndFees as never);
    expect(included).toEqual([{ description: "Resort fee", amount: 10, currency: "EUR", included: true }]);
    expect(excluded.map((e) => e.description)).toEqual(["City tax", "Daily Facilities Fee due and payable direct to the property at check in"]);
  });

  it("returns empty arrays when no taxesAndFees are present", () => {
    expect(normalizeTaxesAndFees(undefined)).toEqual({ included: [], excluded: [] });
  });
});

describe("normalizeSearchResult — hotel/rate normalization", () => {
  it("normalizes a hotel with stars/rating/coordinates/photo and its rate", () => {
    const result = normalizeSearchResult({ data: [rawHotel()] });
    expect(result.hotels).toHaveLength(1);
    const hotel = result.hotels[0];
    expect(hotel).toMatchObject({ hotelId: "hotel_1", stars: 4, rating: 8.5, coordinates: { lat: 53.48, lng: -2.24 } });
    expect(hotel.rates[0].refundable).toBe(true);
    // suggestedSellingPrice is never read anywhere in this module — the
    // normalized type has no such field, so there's nothing to assert
    // beyond: only price.total (from retailRate) appears.
    expect(hotel.rates[0].price).toEqual({ total: 240, currency: "EUR" });
  });

  it("normalizes an NRFN (non-refundable) rate", () => {
    const result = normalizeSearchResult({ data: [rawHotel({ rates: [rawRate({ refundableTag: "NRFN" })] })] });
    expect(result.hotels[0].rates[0].refundable).toBe(false);
  });

  it("accepts a bare array response as well as a {data: [...]} envelope", () => {
    const result = normalizeSearchResult([rawHotel()]);
    expect(result.hotels).toHaveLength(1);
  });

  it("skips a malformed rate but keeps the hotel", () => {
    const result = normalizeSearchResult({ data: [rawHotel({ rates: [rawRate(), { offerId: "broken" }] })] });
    expect(result.hotels[0].rates).toHaveLength(1);
  });

  it("skips a malformed hotel rather than failing the whole search", () => {
    const result = normalizeSearchResult({ data: [rawHotel(), { hotelId: "broken" }] });
    expect(result.hotels).toHaveLength(1);
  });

  it("throws INVALID_PROVIDER_RESPONSE on a completely malformed top-level response", () => {
    expect(() => normalizeSearchResult({ nothing: "here" })).toThrow(ProviderError);
  });
});

describe("searchHotels", () => {
  it("translates the room mix into occupancies and passes starRating through when provided", async () => {
    const fetchImpl = fakeFetch(200, { data: [rawHotel()] });
    await searchHotels({
      cityName: "Manchester",
      countryCode: "GB",
      checkin: "2026-10-15",
      checkout: "2026-10-17",
      currency: "EUR",
      guestNationality: "ES",
      mix: computeRequiredRoomMix(4),
      starRatings: [3, 4],
      fetchImpl,
    });
    const [, init] = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.occupancies).toEqual([{ adults: 2 }, { adults: 2 }]);
    expect(body.starRating).toEqual([3, 4]);
  });

  it("maps a timeout to PROVIDER_UNAVAILABLE", async () => {
    const fetchImpl = vi.fn(async () => {
      throw Object.assign(new Error("timeout"), { name: "TimeoutError" });
    }) as unknown as typeof fetch;
    await expect(
      searchHotels({ cityName: "Manchester", countryCode: "GB", checkin: "2026-10-15", checkout: "2026-10-17", currency: "EUR", guestNationality: "ES", mix: computeRequiredRoomMix(2), fetchImpl }),
    ).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
  });

  it("maps a 401/403 (bad/rejected key) to PROVIDER_UNAVAILABLE, not INVALID_PROVIDER_RESPONSE", async () => {
    const fetchImpl = fakeFetch(403, {});
    await expect(
      searchHotels({ cityName: "Manchester", countryCode: "GB", checkin: "2026-10-15", checkout: "2026-10-17", currency: "EUR", guestNationality: "ES", mix: computeRequiredRoomMix(2), fetchImpl }),
    ).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
  });

  it("maps a 500 to PROVIDER_UNAVAILABLE", async () => {
    const fetchImpl = fakeFetch(500, {});
    await expect(
      searchHotels({ cityName: "Manchester", countryCode: "GB", checkin: "2026-10-15", checkout: "2026-10-17", currency: "EUR", guestNationality: "ES", mix: computeRequiredRoomMix(2), fetchImpl }),
    ).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
  });

  it("maps a malformed (non-JSON) response to INVALID_PROVIDER_RESPONSE", async () => {
    const fetchImpl = vi.fn(async () => new Response("not json", { status: 200 })) as unknown as typeof fetch;
    await expect(
      searchHotels({ cityName: "Manchester", countryCode: "GB", checkin: "2026-10-15", checkout: "2026-10-17", currency: "EUR", guestNationality: "ES", mix: computeRequiredRoomMix(2), fetchImpl }),
    ).rejects.toMatchObject({ code: "INVALID_PROVIDER_RESPONSE" });
  });
});

describe("evaluatePrebookChange (§5 — never continue silently past a changed condition)", () => {
  const basePrebook = { prebookId: "pb_1", hotelId: "hotel_1", price: { total: 240, currency: "EUR" }, priceDifferencePercent: 0, cancellationChanged: false, boardChanged: false, paymentTypes: ["ACC_CREDIT_CARD"], checkin: "2026-10-15", checkout: "2026-10-17" };

  it("reports no change when price/cancellation/board all match the search", () => {
    const result = evaluatePrebookChange(240, basePrebook);
    expect(result).toEqual({ priceChanged: false, cancellationChanged: false, boardChanged: false, requiresAcceptance: false });
  });

  it("requires acceptance when the price differs from what SEARCH showed", () => {
    const result = evaluatePrebookChange(200, basePrebook);
    expect(result.priceChanged).toBe(true);
    expect(result.requiresAcceptance).toBe(true);
  });

  it("requires acceptance when cancellation policy changed, even with the same price", () => {
    const result = evaluatePrebookChange(240, { ...basePrebook, cancellationChanged: true });
    expect(result.requiresAcceptance).toBe(true);
  });

  it("requires acceptance when board changed, even with the same price", () => {
    const result = evaluatePrebookChange(240, { ...basePrebook, boardChanged: true });
    expect(result.requiresAcceptance).toBe(true);
  });
});

describe("prebookOffer", () => {
  it("normalizes a successful prebook response", async () => {
    const fetchImpl = fakeFetch(200, { data: { prebookId: "pb_1", hotelId: "hotel_1", price: 240, currency: "EUR", priceDifferencePercent: 0, cancellationChanged: false, boardChanged: false, paymentTypes: ["ACC_CREDIT_CARD"], checkin: "2026-10-15", checkout: "2026-10-17" } });
    const result = await prebookOffer("rate_1", fetchImpl);
    expect(result.prebookId).toBe("pb_1");
    expect(result.price).toEqual({ total: 240, currency: "EUR" });
  });

  it("throws OFFER... INVALID_PROVIDER_RESPONSE when the offer is missing/expired and Nuitee returns a malformed body", async () => {
    const fetchImpl = fakeFetch(200, { data: {} });
    await expect(prebookOffer("rate_gone", fetchImpl)).rejects.toMatchObject({ code: "INVALID_PROVIDER_RESPONSE" });
  });

  it("maps a 404 (offer no longer exists) to NO_AVAILABILITY", async () => {
    const fetchImpl = fakeFetch(404, {});
    await expect(prebookOffer("rate_gone", fetchImpl)).rejects.toMatchObject({ code: "NO_AVAILABILITY" });
  });
});

describe("bookPrebook — hard gate against accidental real bookings", () => {
  it("refuses when ALLOW_SANDBOX_PROVIDER_BOOKING is not set", async () => {
    await expect(bookPrebook("pb_1", "ref_1", { firstName: "Test", lastName: "Sandbox", email: "test@example.com" }, [], fakeFetch(200, {}))).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
  });

  it("refuses in APP_MODE=production even with the flag set", async () => {
    vi.stubEnv("ALLOW_SANDBOX_PROVIDER_BOOKING", "true");
    vi.stubEnv("APP_MODE", "production");
    await expect(bookPrebook("pb_1", "ref_1", { firstName: "Test", lastName: "Sandbox", email: "test@example.com" }, [], fakeFetch(200, {}))).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
  });

  it("refuses when the key doesn't look like a sand_ sandbox key, even with the flag set", async () => {
    vi.stubEnv("ALLOW_SANDBOX_PROVIDER_BOOKING", "true");
    vi.stubEnv("NUITEE_API_KEY", "live_something");
    await expect(bookPrebook("pb_1", "ref_1", { firstName: "Test", lastName: "Sandbox", email: "test@example.com" }, [], fakeFetch(200, {}))).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
  });

  it("succeeds when explicitly enabled, outside production, with a sandbox key, and always uses ACC_CREDIT_CARD", async () => {
    vi.stubEnv("ALLOW_SANDBOX_PROVIDER_BOOKING", "true");
    const fetchImpl = fakeFetch(200, { data: { bookingId: "bk_1", status: "CONFIRMED", paymentStatus: "succeeded", price: 240, currency: "EUR", processingFee: 6.85 } });
    const result = await bookPrebook("pb_1", "ref_1", { firstName: "Test", lastName: "Sandbox", email: "test@example.com" }, [{ occupancyNumber: 1, firstName: "Test", lastName: "Sandbox", email: "test@example.com" }], fetchImpl);
    expect(result).toMatchObject({ bookingId: "bk_1", status: "CONFIRMED", processingFee: 6.85 });
    const [, init] = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.payment).toEqual({ method: "ACC_CREDIT_CARD" });
    expect(body.clientReference).toBe("ref_1");
  });
});

describe("generateClientReference (§16 — idempotency, generated+persisted before BOOK)", () => {
  it("generates a distinct reference each call", () => {
    const a = generateClientReference();
    const b = generateClientReference();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^cdf_/);
  });
});

describe("buildRoomingSnapshot (§7 — our own record, never derived from Nuitee's BOOK response)", () => {
  it("freezes room->traveler assignments exactly as Copa de Ferias computed them", () => {
    const snapshot = buildRoomingSnapshot([
      { type: "double", travelerIndices: [0, 1] },
      { type: "triple", travelerIndices: [2, 3, 4] },
    ]);
    expect(snapshot).toEqual({
      rooms: [
        { roomIndex: 0, travelerIndices: [0, 1] },
        { roomIndex: 1, travelerIndices: [2, 3, 4] },
      ],
    });
  });
});
