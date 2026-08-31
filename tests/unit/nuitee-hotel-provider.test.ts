import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { computeRequiredRoomMix } from "@/lib/pricing/roomMix";
import { assignTravelersToRooms } from "@/lib/checkout-atu-aire/rooming";
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

// ---------------------------------------------------------------------
// Fixtures below reproduce the REAL Nuitee sandbox payload shapes, as
// captured manually by the user — not an approximation. See this file's
// tests for what each shape quirk (array-vs-object retailRate.total,
// offerId on roomTypes not on individual rates, data[]/hotels[] split,
// bookedRooms inconsistency) is specifically guarding against.
// ---------------------------------------------------------------------

function rawRate(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    rateId: "rate_1",
    occupancyNumber: 1,
    name: "Premium Room",
    maxOccupancy: 2,
    adultCount: 2,
    childCount: 0,
    boardType: "RO",
    boardName: "Room Only",
    retailRate: {
      total: [{ amount: 590.51, currency: "EUR" }],
      suggestedSellingPrice: [{ amount: 689.43, currency: "EUR", source: "" }],
      initialPrice: [{ amount: 590.51, currency: "EUR" }],
      taxesAndFees: [
        { included: true, description: "Resort fee", amount: 23.02, currency: "EUR" },
        { included: false, description: "City tax", amount: 2.01, currency: "EUR" },
      ],
    },
    cancellationPolicies: { cancelPolicyInfos: [], hotelRemarks: [], refundableTag: "NRFN" },
    paymentTypes: ["NUITEE_PAY"],
    ...overrides,
  };
}

function rawRoomType(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    roomTypeId: "rt_1",
    offerId: "offer_1",
    supplier: "nuitee",
    supplierId: 2,
    rates: [rawRate()],
    offerRetailRate: { amount: 590.51, currency: "EUR" },
    ...overrides,
  };
}

function rawDataHotel(overrides: Partial<Record<string, unknown>> = {}) {
  return { hotelId: "lp1897", roomTypes: [rawRoomType()], ...overrides };
}

function rawHotelContent(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "lp1897",
    name: "The Manhattan at Times Square Hotel",
    main_photo: "https://static.cupid.travel/hotels/524489007.jpg",
    thumbnail: "https://static.cupid.travel/hotels/thumbnail/524489007.jpg",
    address: "790 7th Avenue",
    country_code: "us",
    city_name: "New York",
    latitude: 40.762172,
    longitude: -73.983056,
    rating: 7.2,
    stars: 4,
    review_count: 9754,
    ...overrides,
  };
}

function rawSearchResponse(overrides: Partial<Record<string, unknown>> = {}) {
  return { data: [rawDataHotel()], hotels: [rawHotelContent()], sandbox: true, ...overrides };
}

describe("roomMixToOccupancies (§4 — direct translation, no new algorithm)", () => {
  const cases: [number, { adults: number }[]][] = [
    [1, [{ adults: 1 }]],
    [2, [{ adults: 2 }]],
    [3, [{ adults: 3 }]],
    [4, [{ adults: 2 }, { adults: 2 }]],
    [5, [{ adults: 2 }, { adults: 3 }]],
    [6, [{ adults: 2 }, { adults: 2 }, { adults: 2 }]],
  ];
  for (const [partySize, expected] of cases) {
    it(`party of ${partySize} -> ${JSON.stringify(expected)}`, () => {
      expect(roomMixToOccupancies(computeRequiredRoomMix(partySize))).toEqual(expected);
    });
  }

  it("5 travelers is exactly [{adults:2},{adults:3}] — a double at occupancyNumber 1, a triple at occupancyNumber 2, never [3,2]", () => {
    expect(roomMixToOccupancies(computeRequiredRoomMix(5))).toEqual([{ adults: 2 }, { adults: 3 }]);
  });
});

describe("End-to-end domain rooming for 5 travelers — ONE canonical order, no local reordering anywhere", () => {
  // Everything below starts from the real functions that compute/assign
  // rooming for a party of 5 — nothing here is a hand-built RoomAssignment
  // fixture. If computeRequiredRoomMix's own entry order ever changes,
  // this test (and the ones above) are what catch it.
  const mix = computeRequiredRoomMix(5);
  const assignments = assignTravelersToRooms(5, mix);

  it("assignTravelersToRooms(5, ...) produces RoomAssignment[0]=double(2 travelers), RoomAssignment[1]=triple(3 travelers)", () => {
    expect(assignments).toEqual([
      { type: "double", travelerIndices: [0, 1] },
      { type: "triple", travelerIndices: [2, 3, 4] },
    ]);
  });

  it("roomMixToOccupancies(mix) matches RoomAssignment 1:1 by position — occupancyNumber 1 <-> RoomAssignment[0], occupancyNumber 2 <-> RoomAssignment[1]", () => {
    const occupancies = roomMixToOccupancies(mix);
    expect(occupancies).toEqual([{ adults: 2 }, { adults: 3 }]);
    // Explicit correspondence, not just equal arrays by coincidence: each
    // occupancy's adult count matches the SAME-INDEX RoomAssignment's room
    // size, in order.
    occupancies.forEach((occupancy, i) => {
      expect(occupancy.adults).toBe(assignments[i].travelerIndices.length);
    });
  });

  it("buildRoomingSnapshot(assignments) freezes Room 1 = the same 2 travelers as RoomAssignment[0] (double), Room 2 = the same 3 travelers as RoomAssignment[1] (triple)", () => {
    const snapshot = buildRoomingSnapshot(assignments);
    expect(snapshot).toEqual({
      rooms: [
        { roomIndex: 0, travelerIndices: [0, 1] },
        { roomIndex: 1, travelerIndices: [2, 3, 4] },
      ],
    });
    expect(snapshot.rooms[0].travelerIndices).toEqual(assignments[0].travelerIndices);
    expect(snapshot.rooms[1].travelerIndices).toEqual(assignments[1].travelerIndices);
  });
});

describe("normalizeSearchResult — real Nuitee SEARCH shape (data[] + hotels[])", () => {
  it("joins data[].hotelId with hotels[].id, and reads offerId from roomTypes[] (not per-rate)", () => {
    const result = normalizeSearchResult(rawSearchResponse());
    expect(result.hotels).toHaveLength(1);
    const hotel = result.hotels[0];
    expect(hotel).toMatchObject({ hotelId: "lp1897", name: "The Manhattan at Times Square Hotel", stars: 4, rating: 7.2, reviewCount: 9754, address: "790 7th Avenue", city: "New York", coordinates: { lat: 40.762172, lng: -73.983056 }, photoUrl: "https://static.cupid.travel/hotels/524489007.jpg" });
    expect(hotel.rates).toHaveLength(1);
    expect(hotel.rates[0].offerId).toBe("offer_1");
  });

  it("reads retailRate.total as an ARRAY (SEARCH shape) — rates[].price and the roomType's own offerRetailRate", () => {
    const result = normalizeSearchResult(rawSearchResponse());
    const rate = result.hotels[0].rates[0];
    expect(rate.price).toEqual({ total: 590.51, currency: "EUR" }); // offerRetailRate
    expect(rate.rooms[0].price).toEqual({ total: 590.51, currency: "EUR" }); // retailRate.total[0]
  });

  it("a data[] entry with no matching hotels[] content is skipped, not fabricated", () => {
    const result = normalizeSearchResult(rawSearchResponse({ data: [rawDataHotel({ hotelId: "unknown_hotel" })] }));
    expect(result.hotels).toHaveLength(0);
  });

  it("throws INVALID_PROVIDER_RESPONSE if data[]/hotels[] arrays are missing entirely", () => {
    expect(() => normalizeSearchResult({ nothing: "here" })).toThrow(ProviderError);
  });
});

describe("multi-room SEARCH offer — one offerId, multiple rooms, never one offer per room", () => {
  it("a single roomType with 3 rates (occupancyNumber 1/2/3) normalizes to ONE offerId with 3 rooms", () => {
    const raw = rawSearchResponse({
      data: [
        rawDataHotel({
          roomTypes: [
            rawRoomType({
              offerId: "offer_multi",
              rates: [rawRate({ occupancyNumber: 1, adultCount: 2 }), rawRate({ occupancyNumber: 2, adultCount: 2 }), rawRate({ occupancyNumber: 3, adultCount: 2 })],
            }),
          ],
        }),
      ],
    });
    const result = normalizeSearchResult(raw);
    expect(result.hotels[0].rates).toHaveLength(1);
    const rate = result.hotels[0].rates[0];
    expect(rate.offerId).toBe("offer_multi");
    expect(rate.rooms.map((r) => r.occupancyNumber)).toEqual([1, 2, 3]);
  });
});

describe("taxesAndFees (§8 — included vs excluded, never assume excluded is chargeable by us or summed into price)", () => {
  it("real SEARCH example (1 traveler): Occupancy Tax + Hotel Tax Rate included, Daily Facilities Fee excluded, and the 79.26 EUR is never added to price", () => {
    const raw = rawSearchResponse({
      data: [
        rawDataHotel({
          roomTypes: [
            rawRoomType({
              offerRetailRate: { amount: 590.65, currency: "EUR" },
              rates: [
                rawRate({
                  retailRate: {
                    total: [{ amount: 590.65, currency: "EUR" }],
                    taxesAndFees: [
                      { included: true, description: "Occupancy Tax", amount: 6.21, currency: "EUR" },
                      { included: true, description: "Hotel Tax Rate", amount: 72.57, currency: "EUR" },
                      { included: false, description: "Daily Facilities Fee due and payable direct to the property at check in ", amount: 79.26, currency: "EUR" },
                    ],
                  },
                }),
              ],
            }),
          ],
        }),
      ],
    });
    const result = normalizeSearchResult(raw);
    const room = result.hotels[0].rates[0].rooms[0];
    expect(room.includedTaxesAndFees.map((t) => t.description)).toEqual(["Occupancy Tax", "Hotel Tax Rate"]);
    expect(room.excludedTaxesAndFees.map((t) => t.description)).toEqual(["Daily Facilities Fee due and payable direct to the property at check in "]);
    // Price stays exactly 590.65 — the 79.26 excluded fee is never summed in.
    expect(room.price.total).toBe(590.65);
    expect(result.hotels[0].rates[0].price.total).toBe(590.65);
  });

  it("returns empty arrays when no taxesAndFees are present", () => {
    expect(normalizeTaxesAndFees(undefined)).toEqual({ included: [], excluded: [] });
  });
});

describe("suggestedSellingPrice — never used as our price, even when present with a source (§9)", () => {
  it("real example: suggestedSellingPrice 873.21 EUR (source booking.com) is ignored — normalized price stays 590.65 EUR", () => {
    const raw = rawSearchResponse({
      data: [
        rawDataHotel({
          roomTypes: [
            rawRoomType({
              offerRetailRate: { amount: 590.65, currency: "EUR" },
              rates: [
                rawRate({
                  retailRate: {
                    total: [{ amount: 590.65, currency: "EUR" }],
                    suggestedSellingPrice: [{ amount: 873.21, currency: "EUR", source: "booking.com" }],
                    taxesAndFees: [],
                  },
                }),
              ],
            }),
          ],
        }),
      ],
    });
    const result = normalizeSearchResult(raw);
    const rate = result.hotels[0].rates[0];
    expect(rate.price.total).toBe(590.65);
    expect(rate.rooms[0].price.total).toBe(590.65);
    // No field on any normalized type can even carry 873.21 — there's no
    // suggestedSellingPrice property in HotelRate/HotelRoom at all.
    expect(JSON.stringify(rate)).not.toContain("873.21");
  });
});

describe("normalizeSearchResult — skips malformed entries rather than failing the whole search", () => {
  it("skips a malformed roomType (offer) but keeps the hotel", () => {
    const raw = rawSearchResponse({ data: [rawDataHotel({ roomTypes: [rawRoomType(), { offerId: "broken" }] })] });
    const result = normalizeSearchResult(raw);
    expect(result.hotels[0].rates).toHaveLength(1);
  });

  it("skips a malformed hotel (data[] entry) rather than failing the whole search", () => {
    const raw = rawSearchResponse({ data: [rawDataHotel(), { hotelId: "broken" }] });
    const result = normalizeSearchResult(raw);
    expect(result.hotels).toHaveLength(1);
  });
});

describe("searchHotels", () => {
  it("translates the room mix into occupancies and passes starRating through when provided", async () => {
    const fetchImpl = fakeFetch(200, rawSearchResponse());
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

// ---------------------------------------------------------------------
// PREBOOK — real shape: { data: { prebookId, offerId, hotelId, currency,
// roomTypes: [{ rates: [...] }], price (plain number), ... }, sandbox }.
// price is a plain number; the nested roomTypes[].rates[].retailRate.total
// is the SAME array shape as SEARCH.
// ---------------------------------------------------------------------

function rawPrebookResponse(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    data: {
      prebookId: "pb_1",
      offerId: "offer_1",
      hotelId: "lp1897",
      currency: "EUR",
      roomTypes: [
        {
          rates: [
            {
              occupancyNumber: 1,
              adultCount: 2,
              retailRate: {
                total: [{ amount: 590.51, currency: "EUR" }],
                taxesAndFees: [{ included: true, description: "Resort fee", amount: 23.02, currency: "EUR" }],
              },
            },
          ],
        },
      ],
      price: 590.51,
      priceDifferencePercent: 0,
      cancellationChanged: false,
      boardChanged: false,
      paymentTypes: ["NUITEE_PAY", "ACC_CREDIT_CARD", "WALLET"],
      checkin: "2026-10-15",
      checkout: "2026-10-17",
      sellingPriceToUser: 590.51,
      ...overrides,
    },
    sandbox: true,
  };
}

describe("evaluatePrebookChange (§5 — never continue silently past a changed condition)", () => {
  function prebook(overrides: Partial<Record<string, unknown>> = {}) {
    return { prebookId: "pb_1", offerId: "offer_1", hotelId: "hotel_1", rooms: [], price: { total: 240, currency: "EUR" }, priceDifferencePercent: 0, cancellationChanged: false, boardChanged: false, paymentTypes: ["ACC_CREDIT_CARD"], checkin: "2026-10-15", checkout: "2026-10-17", ...overrides } as Parameters<typeof evaluatePrebookChange>[1];
  }

  it("reports no change when price/cancellation/board all match the search", () => {
    const result = evaluatePrebookChange(240, prebook());
    expect(result).toEqual({ priceChanged: false, cancellationChanged: false, boardChanged: false, requiresAcceptance: false });
  });

  it("requires acceptance when the price differs from what SEARCH showed", () => {
    const result = evaluatePrebookChange(200, prebook());
    expect(result.priceChanged).toBe(true);
    expect(result.requiresAcceptance).toBe(true);
  });

  it("requires acceptance when cancellation policy changed, even with the same price", () => {
    expect(evaluatePrebookChange(240, prebook({ cancellationChanged: true })).requiresAcceptance).toBe(true);
  });

  it("requires acceptance when board changed, even with the same price", () => {
    expect(evaluatePrebookChange(240, prebook({ boardChanged: true })).requiresAcceptance).toBe(true);
  });
});

describe("prebookOffer — real Nuitee PREBOOK shape", () => {
  it("reads price as a plain number (not array/object) and rooms[].price from the nested array-shaped retailRate.total", async () => {
    const fetchImpl = fakeFetch(200, rawPrebookResponse());
    const result = await prebookOffer("offer_1", fetchImpl);
    expect(result).toMatchObject({ prebookId: "pb_1", offerId: "offer_1", hotelId: "lp1897", price: { total: 590.51, currency: "EUR" } });
    expect(result.rooms).toHaveLength(1);
    expect(result.rooms[0].price).toEqual({ total: 590.51, currency: "EUR" });
    expect(result.rooms[0].includedTaxesAndFees).toEqual([{ description: "Resort fee", amount: 23.02, currency: "EUR", included: true }]);
  });

  it("throws INVALID_PROVIDER_RESPONSE when the prebook body is malformed", async () => {
    const fetchImpl = fakeFetch(200, { data: {} });
    await expect(prebookOffer("rate_gone", fetchImpl)).rejects.toMatchObject({ code: "INVALID_PROVIDER_RESPONSE" });
  });

  it("maps a 404 (offer no longer exists) to NO_AVAILABILITY", async () => {
    const fetchImpl = fakeFetch(404, {});
    await expect(prebookOffer("rate_gone", fetchImpl)).rejects.toMatchObject({ code: "NO_AVAILABILITY" });
  });
});

// ---------------------------------------------------------------------
// BOOK — real shape: retailRate.total inside bookedRooms is an OBJECT
// ({amount, currency}), unlike SEARCH/PREBOOK's array. bookedRooms is
// deliberately never read by bookPrebook() (§7) — see book.ts.
// ---------------------------------------------------------------------

function rawBookResponse(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    data: {
      bookingId: "bk_1",
      status: "CONFIRMED",
      hotelConfirmationCode: "test",
      // Deliberately inconsistent, matching a real observed sandbox BOOK
      // response: occupancy_number stuck at 1 for every room, and the
      // "adults" per room stuck at 1 even though the booking is for more
      // travelers — this must never leak into our own rooming.
      bookedRooms: [
        { rate: { retailRate: { total: { amount: 295.25, currency: "EUR" }, taxesAndFees: [] } }, occupancy_number: 1, adults: 1, guests: [{ firstName: "Test", lastName: "Sandbox" }], amount: 295.25, currency: "EUR" },
        { rate: { retailRate: { total: { amount: 295.26, currency: "EUR" }, taxesAndFees: [] } }, occupancy_number: 1, adults: 1, guests: [{ firstName: "Test", lastName: "Sandbox" }], amount: 295.26, currency: "EUR" },
      ],
      price: 590.51,
      currency: "EUR",
      adults: 4, // the booking-level total IS correct, unlike the per-room fields above
      paymentStatus: "succeeded",
      processingFee: 6.85,
      sandbox: 1,
      ...overrides,
    },
    sandbox: true,
  };
}

describe("bookPrebook — real BOOK shape, retailRate.total as an object (not array)", () => {
  it("normalizes the top-level fields correctly, ignoring bookedRooms entirely", async () => {
    vi.stubEnv("ALLOW_SANDBOX_PROVIDER_BOOKING", "true");
    const fetchImpl = fakeFetch(200, rawBookResponse());
    const result = await bookPrebook("pb_1", "ref_1", { firstName: "Test", lastName: "Sandbox", email: "test@example.com" }, [{ occupancyNumber: 1, firstName: "Test", lastName: "Sandbox", email: "test@example.com" }], fetchImpl);
    expect(result).toMatchObject({ bookingId: "bk_1", status: "CONFIRMED", hotelConfirmationCode: "test", paymentStatus: "succeeded", currency: "EUR", totalPrice: 590.51, processingFee: 6.85 });
  });

  it("§3 — never exposes bookedRooms/occupancy_number/adults-per-room/guests from BOOK, even though they were present and inconsistent in the raw response", async () => {
    vi.stubEnv("ALLOW_SANDBOX_PROVIDER_BOOKING", "true");
    const fetchImpl = fakeFetch(200, rawBookResponse());
    const result = await bookPrebook("pb_1", "ref_1", { firstName: "Test", lastName: "Sandbox", email: "test@example.com" }, [], fetchImpl);
    expect(result).not.toHaveProperty("bookedRooms");
    expect(result).not.toHaveProperty("rooms");
    expect(result).not.toHaveProperty("rooming");
    expect(result).not.toHaveProperty("guests");
    // Only the whole-booking totals are surfaced — never a per-room breakdown.
    expect(Object.keys(result).sort()).toEqual(["bookingId", "currency", "hotelConfirmationCode", "paymentStatus", "processingFee", "status", "supplierBookingId", "totalPrice"]);
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
    const fetchImpl = fakeFetch(200, rawBookResponse());
    const result = await bookPrebook("pb_1", "ref_1", { firstName: "Test", lastName: "Sandbox", email: "test@example.com" }, [{ occupancyNumber: 1, firstName: "Test", lastName: "Sandbox", email: "test@example.com" }], fetchImpl);
    expect(result.bookingId).toBe("bk_1");
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

describe("buildRoomingSnapshot (§7/§3 — our own record, never derived from Nuitee's BOOK response)", () => {
  it("freezes room->traveler assignments exactly as Copa de Ferias computed them, from RoomAssignment[] only", () => {
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

  it("a snapshot built for a 5-traveler booking (2+3) is unaffected by whatever a real BOOK response's bookedRooms says — buildRoomingSnapshot's signature can't even accept it", () => {
    // The inconsistent real BOOK payload from rawBookResponse() is never
    // passed to buildRoomingSnapshot at all — its only input is our own
    // RoomAssignment[], computed before BOOK is ever called.
    const ourOwnAssignments = [
      { type: "double" as const, travelerIndices: [0, 1] },
      { type: "triple" as const, travelerIndices: [2, 3, 4] },
    ];
    const snapshot = buildRoomingSnapshot(ourOwnAssignments);
    expect(snapshot.rooms[0].travelerIndices).toEqual([0, 1]);
    expect(snapshot.rooms[1].travelerIndices).toEqual([2, 3, 4]);
    // Never occupancy_number: 1 for both rooms, never adults: 1, never a
    // repeated guest — those are exactly the inconsistencies real BOOK
    // responses have shown, and none of them exist anywhere in this
    // snapshot's shape.
    expect(snapshot).not.toHaveProperty("occupancy_number");
    expect(snapshot).not.toHaveProperty("adults");
    expect(snapshot).not.toHaveProperty("guests");
  });
});
