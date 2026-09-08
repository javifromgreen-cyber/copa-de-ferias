import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { searchHotelShortlist, searchViableFlightOrigins, getFlightSessionOffers } from "@/server/actions/real-checkout-search";
import { SUPPORTED_SPANISH_FLIGHT_ORIGINS } from "@/lib/checkout-atu-aire/spanishFlightOrigins";

const STADIUM_LAT = 53.4831;
const STADIUM_LNG = -2.2004;

// Fase 2.5 §25 J/K/M (hotel SEARCH-only UI wiring) and N (one Offer
// Request, two slices) — the new real-checkout SEARCH server actions
// this session added on top of the existing Nuitee/Duffel provider
// layer. Both actions must never PREBOOK/BOOK/create an Order — SEARCH
// only, exactly like the legacy ATU_AIRE quote layer.

const RUN_ID = `realsearch-${Date.now()}`;
let tripId: string;
let ticketOfferId: string;

beforeAll(async () => {
  const trip = await prisma.trip.create({
    data: {
      number: 900007,
      slug: RUN_ID,
      name: "Test Trip",
      subtitle: "Test",
      city: "Manchester",
      country: "Reino Unido",
      homeTeam: "A",
      awayTeam: "B",
      stadium: "Test",
      matchDate: new Date(),
      price: 100,
      currency: "EUR",
      travelMode: "A_TU_AIRE",
      published: true,
      hotelStars: 3,
      isDemo: true,
    },
  });
  tripId = trip.id;
  const event = await prisma.event.create({
    data: { tripId, homeTeam: "A", awayTeam: "B", stadium: "Test", matchDate: new Date("2026-11-15T20:00:00Z"), stadiumLatitude: STADIUM_LAT, stadiumLongitude: STADIUM_LNG },
  });
  const ticketOffer = await prisma.ticketOffer.create({ data: { eventId: event.id, costNet: 50, currency: "EUR", stock: 10, active: true } });
  ticketOfferId = ticketOffer.id;
});

afterAll(async () => {
  await prisma.flightSearchSession.deleteMany({ where: { tripId } });
  await prisma.event.deleteMany({ where: { tripId } });
  await prisma.trip.delete({ where: { id: tripId } });
  await prisma.$disconnect();
});

/** Shared args every searchHotelShortlist call in this file needs beyond the hotel-specific bits. */
function baseArgs(overrides: { partySize?: number; travelOriginCountry?: string; fetchImpl?: typeof fetch } = {}) {
  return { tripSlug: RUN_ID, partySize: overrides.partySize ?? 1, travelOriginCountry: overrides.travelOriginCountry ?? "ES", ticketOfferId, packageType: "TICKET_HOTEL" as const, fetchImpl: overrides.fetchImpl };
}

const FUTURE_CANCEL_DEADLINE = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

type HotelFixture = { hotelId: string; offerId: string; stars: number; price: number; lat: number; lng: number; name?: string; refundable?: boolean; unknownCancellationInfo?: boolean };

function nuiteeSearchBody(hotels: HotelFixture[]) {
  return {
    data: hotels.map((h) => ({
      hotelId: h.hotelId,
      roomTypes: [
        {
          offerId: h.offerId,
          offerRetailRate: { amount: h.price, currency: "EUR" },
          rates: [
            {
              occupancyNumber: 1,
              name: "Doble",
              adultCount: 2,
              retailRate: { total: [{ amount: h.price, currency: "EUR" }] },
              cancellationPolicies:
                h.refundable === false
                  ? { refundableTag: "NRFN" }
                  : h.unknownCancellationInfo
                    ? { refundableTag: "RFN" } // RFN but no cancelPolicyInfos — the real Nuitee sandbox gap this correction stops discarding on.
                    : { refundableTag: "RFN", cancelPolicyInfos: [{ cancelTime: FUTURE_CANCEL_DEADLINE, amount: 0 }] },
            },
          ],
        },
      ],
    })),
    hotels: hotels.map((h) => ({ id: h.hotelId, name: h.name ?? `Hotel ${h.hotelId}`, address: "Calle Test 1", city_name: "Manchester", stars: h.stars, rating: 8.5, review_count: 100, latitude: h.lat, longitude: h.lng })),
  };
}

/** ~0.009° latitude ≈ 1km — close enough for these fixtures. */
function atDistanceKm(km: number): { lat: number; lng: number } {
  return { lat: STADIUM_LAT + km * 0.009, lng: STADIUM_LNG };
}

/** A router fetch mock: every SEARCH radius returns the same `hotels` list. searchHotelShortlist never calls PREBOOK/BOOK. */
function makeFetchImpl(hotels: HotelFixture[]) {
  return makeExpandingFetchImpl({ 5: hotels, 10: hotels, 20: hotels, 40: hotels });
}

/**
 * A router fetch mock keyed by SEARCH radius (km) — mirrors how a real
 * geographic SEARCH behaves: a wider radius's response is a superset of
 * a narrower one's (so fixtures for a bigger radius should normally
 * include the smaller radius's hotels too, plus whatever new hotels
 * that wider circle reaches).
 */
function makeExpandingFetchImpl(hotelsByRadiusKm: Record<number, HotelFixture[]>) {
  const calls: { url: string; body: unknown }[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const body = init?.body ? JSON.parse(init.body as string) : null;
    calls.push({ url, body });
    if (/hotels\/rates/.test(url)) {
      const radiusKm = (body as { radius: number }).radius / 1000;
      const hotels = hotelsByRadiusKm[radiusKm] ?? [];
      return new Response(JSON.stringify(nuiteeSearchBody(hotels)), { status: 200 });
    }
    throw new Error(`unexpected call to ${url}`);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

function searchCallRadiiKm(calls: { url: string; body: unknown }[]): number[] {
  return calls.filter((c) => /hotels\/rates/.test(c.url)).map((c) => (c.body as { radius: number }).radius / 1000);
}

describe("F — the public UI never shows the old raw Nuitee list: searchHotelShortlist returns at most HOTEL_SHORTLIST_SIZE (3) hotels", () => {
  it("5 valid candidates within the first (5km) radius -> only the 3 closest are returned", async () => {
    const hotels: HotelFixture[] = [1, 2, 3, 4, 5].map((n) => ({ hotelId: `h${n}`, offerId: `o${n}`, stars: 4, price: 100, ...atDistanceKm(n) }));
    const { fetchImpl } = makeFetchImpl(hotels);
    const result = await searchHotelShortlist(baseArgs({ partySize: 2, fetchImpl }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.hotels).toHaveLength(3);
    expect(result.hotels.map((h) => h.hotelId)).toEqual(["h1", "h2", "h3"]);
  });
});

describe("A — the first SEARCH call uses the closest radius in the progression (5km)", () => {
  it("issues its first request with radius=5000", async () => {
    const hotels: HotelFixture[] = [{ hotelId: "hotel_1", offerId: "offer_1", stars: 4, price: 150, ...atDistanceKm(1) }];
    const { fetchImpl, calls } = makeFetchImpl(hotels);
    await searchHotelShortlist(baseArgs({ fetchImpl }));
    expect(searchCallRadiiKm(calls)[0]).toBe(5);
  });
});

describe("B — fewer than 3 valid candidates at the current radius widens the search", () => {
  it("1 hotel within 5km, two more only within 10km (reaching 3) -> two SEARCH calls, all three hotels in the result", async () => {
    const near: HotelFixture = { hotelId: "h_near", offerId: "o_near", stars: 4, price: 100, ...atDistanceKm(2) };
    const mid1: HotelFixture = { hotelId: "h_mid1", offerId: "o_mid1", stars: 4, price: 100, ...atDistanceKm(7) };
    const mid2: HotelFixture = { hotelId: "h_mid2", offerId: "o_mid2", stars: 4, price: 100, ...atDistanceKm(8) };
    const { fetchImpl, calls } = makeExpandingFetchImpl({ 5: [near], 10: [near, mid1, mid2], 20: [near, mid1, mid2], 40: [near, mid1, mid2] });

    const result = await searchHotelShortlist(baseArgs({ fetchImpl }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(searchCallRadiiKm(calls)).toEqual([5, 10]);
    expect(result.hotels.map((h) => h.hotelId).sort()).toEqual(["h_mid1", "h_mid2", "h_near"]);
  });
});

describe("C — reaching HOTEL_SHORTLIST_SIZE (3) valid candidates stops the expansion", () => {
  it("3 hotels already within 5km -> only one SEARCH call is made", async () => {
    const hotels: HotelFixture[] = [1, 2, 3].map((n) => ({ hotelId: `h${n}`, offerId: `o${n}`, stars: 4, price: 100, ...atDistanceKm(n) }));
    const { fetchImpl, calls } = makeExpandingFetchImpl({ 5: hotels, 10: hotels, 20: hotels, 40: hotels });

    const result = await searchHotelShortlist(baseArgs({ fetchImpl }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(searchCallRadiiKm(calls)).toEqual([5]);
    expect(result.hotels).toHaveLength(3);
  });
});

describe("D — hotels repeated across radius expansions are deduplicated", () => {
  it("the same hotelId returned at both 5km and 10km appears only once in the final shortlist", async () => {
    const repeated: HotelFixture = { hotelId: "h_repeated", offerId: "o_repeated", stars: 4, price: 100, ...atDistanceKm(2) };
    const onlyAt10: HotelFixture = { hotelId: "h_new", offerId: "o_new", stars: 4, price: 100, ...atDistanceKm(7) };
    const { fetchImpl } = makeExpandingFetchImpl({ 5: [repeated], 10: [repeated, onlyAt10], 20: [repeated, onlyAt10], 40: [repeated, onlyAt10] });

    const result = await searchHotelShortlist(baseArgs({ fetchImpl }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ids = result.hotels.map((h) => h.hotelId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => id === "h_repeated")).toHaveLength(1);
  });
});

describe("E — a hotel beyond the old 15km cutoff can still appear if it's among the best available options", () => {
  it("only a 22km hotel exists at all -> the expansion reaches 40km and returns it", async () => {
    const veryFar: HotelFixture = { hotelId: "hotel_22km", offerId: "offer_22km", stars: 4, price: 100, ...atDistanceKm(22) };
    const { fetchImpl, calls } = makeExpandingFetchImpl({ 5: [], 10: [], 20: [], 40: [veryFar] });

    const result = await searchHotelShortlist(baseArgs({ fetchImpl }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(searchCallRadiiKm(calls)).toEqual([5, 10, 20, 40]);
    expect(result.hotels).toHaveLength(1);
    expect(result.hotels[0].distanceToStadiumKm).toBeGreaterThan(15);
  });
});

describe("G — 1 or 2 real hotels -> exactly 1 or 2 shown, never padded", () => {
  it("1 candidate -> exactly 1 shown", async () => {
    const hotels: HotelFixture[] = [{ hotelId: "hotel_1", offerId: "offer_1", stars: 4, price: 150, ...atDistanceKm(1) }];
    const { fetchImpl } = makeFetchImpl(hotels);
    const result = await searchHotelShortlist(baseArgs({ fetchImpl }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.hotels).toHaveLength(1);
  });

  it("2 candidates -> exactly 2 shown", async () => {
    const hotels: HotelFixture[] = [
      { hotelId: "h_a", offerId: "o_a", stars: 4, price: 150, ...atDistanceKm(1) },
      { hotelId: "h_b", offerId: "o_b", stars: 3, price: 90, ...atDistanceKm(2) },
    ];
    const { fetchImpl } = makeFetchImpl(hotels);
    const result = await searchHotelShortlist(baseArgs({ fetchImpl }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.hotels).toHaveLength(2);
  });
});

describe("H — each card shows the public price for choosing that hotel", () => {
  it("publicPriceTotal/publicPricePerPerson are present and reflect ticket + this hotel's cost + org fee", async () => {
    const hotels: HotelFixture[] = [{ hotelId: "hotel_1", offerId: "offer_1", stars: 4, price: 150, ...atDistanceKm(1) }];
    const { fetchImpl } = makeFetchImpl(hotels);
    const result = await searchHotelShortlist(baseArgs({ partySize: 2, fetchImpl }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const h = result.hotels[0];
    // ticketCostNetTotal (50*2=100) + hotelCostNetTotal (150) = 250 net; the public price must be strictly higher (org fee added), never equal to the bare net cost.
    expect(h.publicPriceTotal).toBeGreaterThan(250);
    expect(h.publicPricePerPerson).toBeCloseTo(h.publicPriceTotal / 2, 5);
    expect(h.currency).toBe("EUR");
  });
});

describe("I — never shows provider cost, margin, org fee, or buffer on their own", () => {
  it("the DTO carries only the final public price fields, never a cost/fee breakdown", async () => {
    const hotels: HotelFixture[] = [{ hotelId: "hotel_1", offerId: "offer_1", stars: 4, price: 150, ...atDistanceKm(1) }];
    const { fetchImpl } = makeFetchImpl(hotels);
    const result = await searchHotelShortlist(baseArgs({ fetchImpl }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const h = result.hotels[0];
    expect(h).not.toHaveProperty("clientReference");
    expect(h).not.toHaveProperty("providerCost");
    expect(h).not.toHaveProperty("margin");
    expect(h).not.toHaveProperty("orgFee");
    expect(h).not.toHaveProperty("buffer");
  });
});

describe("J — selecting different hotels produces the correspondingly different public price", () => {
  it("a pricier hotel's card shows a higher publicPriceTotal than a cheaper one, by exactly the net cost delta", async () => {
    const cheap: HotelFixture = { hotelId: "h_cheap", offerId: "o_cheap", stars: 4, price: 100, ...atDistanceKm(1) };
    const pricier: HotelFixture = { hotelId: "h_pricier", offerId: "o_pricier", stars: 4, price: 180, ...atDistanceKm(1) };
    const { fetchImpl } = makeFetchImpl([cheap, pricier]);
    const result = await searchHotelShortlist(baseArgs({ fetchImpl }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const cheapCard = result.hotels.find((h) => h.hotelId === "h_cheap")!;
    const pricierCard = result.hotels.find((h) => h.hotelId === "h_pricier")!;
    expect(pricierCard.publicPriceTotal - cheapCard.publicPriceTotal).toBeCloseTo(80, 5);
  });
});

describe("K — the shortlist is never emptied merely by information only PREBOOK can confirm", () => {
  it("an RFN rate with no cancelPolicyInfos (unknown safe-window deadline) still appears in the shortlist", async () => {
    const hotel: HotelFixture = { hotelId: "hotel_unknown_window", offerId: "offer_unknown_window", stars: 4, price: 120, unknownCancellationInfo: true, ...atDistanceKm(1) };
    const { fetchImpl } = makeFetchImpl([hotel]);
    const result = await searchHotelShortlist(baseArgs({ fetchImpl }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.hotels).toHaveLength(1);
    expect(result.hotels[0].hotelId).toBe("hotel_unknown_window");
  });
});

describe("O — a definitively non-refundable hotel is still discarded entirely (reliable SEARCH evidence)", () => {
  it("excludes a hotel whose only rate is explicitly NRFN", async () => {
    const hotels: HotelFixture[] = [{ hotelId: "hotel_bad", offerId: "offer_bad", stars: 4, price: 50, refundable: false, ...atDistanceKm(1) }];
    const { fetchImpl } = makeFetchImpl(hotels);
    const result = await searchHotelShortlist(baseArgs({ fetchImpl }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("No hay hoteles disponibles para estas fechas.");
  });
});

describe("L/V/W — searchHotelShortlist only ever calls SEARCH, never PREBOOK/BOOK", () => {
  it("no request to /rates/prebook or /rates/book is made, at any radius", async () => {
    const hotels: HotelFixture[] = [{ hotelId: "hotel_1", offerId: "offer_1", stars: 4, price: 150, ...atDistanceKm(1) }];
    const { fetchImpl, calls } = makeFetchImpl(hotels);

    await searchHotelShortlist(baseArgs({ fetchImpl }));
    expect(calls.some((c) => /rates\/prebook/.test(c.url))).toBe(false);
    expect(calls.some((c) => /rates\/book/.test(c.url))).toBe(false);
    expect(calls.some((c) => /hotels\/rates/.test(c.url))).toBe(true);
  });
});

// SEARCH still uses Nuitee's official geographic search (latitude/
// longitude/radius), progressively expanded — never a starRating filter
// (there is no user category anymore) and never cityName/countryCode.
type SearchRequestBody = { latitude?: number; longitude?: number; radius?: number; starRating?: number[]; cityName?: string; countryCode?: string };

function capturedSearchBody(calls: { url: string; body: unknown }[]): SearchRequestBody {
  const call = calls.find((c) => /hotels\/rates/.test(c.url));
  expect(call).toBeDefined();
  return call!.body as SearchRequestBody;
}

describe("SEARCH sends the stadium's own coordinates and no star filter", () => {
  it("sends the Event's stadiumLatitude/stadiumLongitude", async () => {
    const hotels: HotelFixture[] = [{ hotelId: "hotel_1", offerId: "offer_1", stars: 4, price: 150, ...atDistanceKm(1) }];
    const { fetchImpl, calls } = makeFetchImpl(hotels);
    await searchHotelShortlist(baseArgs({ fetchImpl }));
    const body = capturedSearchBody(calls);
    expect(body.latitude).toBe(STADIUM_LAT);
    expect(body.longitude).toBe(STADIUM_LNG);
  });

  it("never sends a starRating filter — every category is a valid shortlist candidate now", async () => {
    const hotels: HotelFixture[] = [{ hotelId: "hotel_1", offerId: "offer_1", stars: 4, price: 150, ...atDistanceKm(1) }];
    const { fetchImpl, calls } = makeFetchImpl(hotels);
    await searchHotelShortlist(baseArgs({ fetchImpl }));
    expect(capturedSearchBody(calls).starRating).toBeUndefined();
  });

  it("never sends cityName/countryCode for this geographic search", async () => {
    const hotels: HotelFixture[] = [{ hotelId: "hotel_1", offerId: "offer_1", stars: 4, price: 150, ...atDistanceKm(1) }];
    const { fetchImpl, calls } = makeFetchImpl(hotels);
    await searchHotelShortlist(baseArgs({ fetchImpl }));
    const body = capturedSearchBody(calls);
    expect(body.cityName).toBeUndefined();
    expect(body.countryCode).toBeUndefined();
  });
});

function duffelSeg(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    origin: { iata_code: "MAD" },
    destination: { iata_code: "MAN" },
    departing_at: "2026-11-14T09:00:00",
    arriving_at: "2026-11-14T11:30:00",
    marketing_carrier: { iata_code: "VY", name: "Vueling" },
    operating_carrier: { iata_code: "VY", name: "Vueling" },
    marketing_carrier_flight_number: "1234",
    passengers: [{ cabin_class: "economy" }],
    ...overrides,
  };
}
const DUFFEL_RETURN_SEG = duffelSeg({ origin: { iata_code: "MAN" }, destination: { iata_code: "MAD" }, departing_at: "2026-11-16T18:00:00", arriving_at: "2026-11-16T21:00:00", marketing_carrier_flight_number: "1235" });

function duffelOfferRequestBody() {
  return {
    data: {
      id: "orq_1",
      live_mode: false,
      passengers: [{ id: "pas_1" }],
      offers: [
        {
          id: "off_1",
          total_amount: "180.00",
          total_currency: "EUR",
          expires_at: new Date(Date.now() + 3_600_000).toISOString(),
          slices: [{ segments: [duffelSeg()], fare_brand_name: "Basic" }, { segments: [DUFFEL_RETURN_SEG] }],
          conditions: { refund_before_departure: { allowed: true, penalty_amount: "20.00", penalty_currency: "EUR" } },
        },
      ],
    },
  };
}

describe("N — one Duffel Offer Request with two slices per candidate origin, never two independent one-way searches", () => {
  it("issues one POST to /air/offer_requests per candidate Spanish origin, each with both an outbound and a return slice", async () => {
    const calls: { url: string; body: unknown }[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: typeof input === "string" ? input : input.toString(), body: init?.body ? JSON.parse(init.body as string) : null });
      return new Response(JSON.stringify(duffelOfferRequestBody()), { status: 201 });
    }) as unknown as typeof fetch;

    const result = await searchViableFlightOrigins({ tripSlug: RUN_ID, partySize: 1, fetchImpl });
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(SUPPORTED_SPANISH_FLIGHT_ORIGINS.length);
    for (const call of calls) {
      expect(call.url).toMatch(/air\/offer_requests/);
      const slices = (call.body as { data: { slices: { origin: string; destination: string }[] } }).data.slices;
      expect(slices).toHaveLength(2);
    }
  });

  it("the stored offers never carry a separate per-leg price — only one totalAmount for the whole round trip", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(duffelOfferRequestBody()), { status: 201 })) as unknown as typeof fetch;
    const originsResult = await searchViableFlightOrigins({ tripSlug: RUN_ID, partySize: 1, fetchImpl });
    expect(originsResult.ok).toBe(true);
    if (!originsResult.ok) return;
    const offersResult = await getFlightSessionOffers({ sessionId: originsResult.origins[0].sessionId });
    expect(offersResult.ok).toBe(true);
    if (!offersResult.ok) return;
    expect(offersResult.offers[0]).not.toHaveProperty("outboundPrice");
    expect(offersResult.offers[0]).not.toHaveProperty("returnPrice");
    expect(typeof offersResult.offers[0].totalAmount).toBe("number");
  });
});

describe("Fase 2.6 §2/§4 — flight session security and origin viability", () => {
  it("D — passengerIds and offerRequestId never appear on the browser-facing offer DTOs", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(duffelOfferRequestBody()), { status: 201 })) as unknown as typeof fetch;
    const originsResult = await searchViableFlightOrigins({ tripSlug: RUN_ID, partySize: 1, fetchImpl });
    expect(originsResult.ok).toBe(true);
    if (!originsResult.ok) return;
    const offersResult = await getFlightSessionOffers({ sessionId: originsResult.origins[0].sessionId });
    expect(offersResult.ok).toBe(true);
    if (!offersResult.ok) return;
    expect(offersResult.offers[0]).not.toHaveProperty("passengerIds");
    expect(offersResult.offers[0]).not.toHaveProperty("offerRequestId");
  });

  it("J — only origins with a real viable direct round trip are returned; passengerIds/offerRequestId are persisted server-side on the session row", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(duffelOfferRequestBody()), { status: 201 })) as unknown as typeof fetch;
    const result = await searchViableFlightOrigins({ tripSlug: RUN_ID, partySize: 1, fetchImpl });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.origins.length).toBe(SUPPORTED_SPANISH_FLIGHT_ORIGINS.length); // every candidate returned an offer in this fixture
    for (const origin of result.origins) {
      expect(SUPPORTED_SPANISH_FLIGHT_ORIGINS.some((c) => c.iata === origin.iata)).toBe(true);
      const session = await prisma.flightSearchSession.findUniqueOrThrow({ where: { id: origin.sessionId } });
      expect(session.offerRequestId).toBe("orq_1");
      expect(JSON.parse(session.passengerIds)).toEqual(["pas_1"]);
    }
  });

  it("no viable origin -> a clear ok:false result, no session rows created", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ data: { id: "orq_empty", live_mode: false, passengers: [{ id: "pas_1" }], offers: [] } }), { status: 201 })) as unknown as typeof fetch;
    const before = await prisma.flightSearchSession.count();
    // Fase 2.6 closure §5 — a distinct partySize (97) never used by an
    // earlier test in this file, so the new session-reuse check can never
    // short-circuit this search with a stale viable session and mask the
    // "genuinely no offers" case this test exists to prove.
    const result = await searchViableFlightOrigins({ tripSlug: RUN_ID, partySize: 97, fetchImpl });
    expect(result.ok).toBe(false);
    const after = await prisma.flightSearchSession.count();
    expect(after).toBe(before);
  });

  it("K — the origin the customer picks feeds the same session that was actually searched for that origin (originIata matches)", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(duffelOfferRequestBody()), { status: 201 })) as unknown as typeof fetch;
    const result = await searchViableFlightOrigins({ tripSlug: RUN_ID, partySize: 1, fetchImpl });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const chosen = result.origins[1];
    const session = await prisma.flightSearchSession.findUniqueOrThrow({ where: { id: chosen.sessionId } });
    expect(session.originIata).toBe(chosen.iata);
  });

  it("M — a session that has expired is rejected by getFlightSessionOffers", async () => {
    const trip = await prisma.trip.findUniqueOrThrow({ where: { slug: RUN_ID } });
    const expired = await prisma.flightSearchSession.create({
      data: {
        tripId: trip.id,
        partySize: 1,
        originIata: "MAD",
        destinationIata: "MAN",
        outboundDate: "2026-11-14",
        returnDate: "2026-11-16",
        offerRequestId: "orq_expired",
        passengerIds: JSON.stringify(["pas_1"]),
        offersJson: JSON.stringify([]),
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    const result = await getFlightSessionOffers({ sessionId: expired.id });
    expect(result.ok).toBe(false);
  });
});

describe("Cierre Fase 2.6 §5 F — an identical repeated search reuses the still-valid session instead of re-calling Duffel", () => {
  it("clicking 'Buscar aeropuertos' twice with the exact same trip/dates/partySize/origins issues Offer Requests only on the first call", async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      calls.push(typeof input === "string" ? input : input.toString());
      return new Response(JSON.stringify(duffelOfferRequestBody()), { status: 201 });
    }) as unknown as typeof fetch;

    // partySize 98 — never used by an earlier test in this file, so the
    // first call below is guaranteed to be a genuine fresh search (no
    // pre-existing session to reuse from), keeping this test's own
    // first-call/second-call call-count assertions meaningful.
    const first = await searchViableFlightOrigins({ tripSlug: RUN_ID, partySize: 98, fetchImpl });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const callsAfterFirst = calls.length;
    expect(callsAfterFirst).toBe(SUPPORTED_SPANISH_FLIGHT_ORIGINS.length); // one Offer Request per candidate origin

    const second = await searchViableFlightOrigins({ tripSlug: RUN_ID, partySize: 98, fetchImpl });
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    // No new Duffel calls at all — every candidate origin resolved via the
    // still-valid FlightSearchSession created by the first call.
    expect(calls.length).toBe(callsAfterFirst);

    // And the reused sessionIds are literally the same rows, not new ones.
    const firstByIata = new Map(first.origins.map((o) => [o.iata, o.sessionId]));
    for (const origin of second.origins) {
      expect(origin.sessionId).toBe(firstByIata.get(origin.iata));
    }
  });

  it("a different partySize is a different search and does hit Duffel again (reuse is exact-match only)", async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      calls.push(typeof input === "string" ? input : input.toString());
      return new Response(JSON.stringify(duffelOfferRequestBody()), { status: 201 });
    }) as unknown as typeof fetch;

    await searchViableFlightOrigins({ tripSlug: RUN_ID, partySize: 99, fetchImpl });
    const callsAfterFirst = calls.length;
    await searchViableFlightOrigins({ tripSlug: RUN_ID, partySize: 100, fetchImpl });
    expect(calls.length).toBe(callsAfterFirst + SUPPORTED_SPANISH_FLIGHT_ORIGINS.length);
  });
});

describe("Cierre Fase 2.6 §4 G — the supported-origins list is genuine domain config, separate from the search algorithm", () => {
  it("SUPPORTED_SPANISH_FLIGHT_ORIGINS is a plain data array searchViableFlightOrigins merely iterates — not baked into its logic", () => {
    expect(Array.isArray(SUPPORTED_SPANISH_FLIGHT_ORIGINS)).toBe(true);
    expect(SUPPORTED_SPANISH_FLIGHT_ORIGINS.length).toBeGreaterThan(0);
    for (const origin of SUPPORTED_SPANISH_FLIGHT_ORIGINS) {
      expect(typeof origin.iata).toBe("string");
      expect(origin.iata).toHaveLength(3);
    }
    // MVP coverage today — documented as such, not the full universe of
    // Spanish airports (closure §4). This assertion pins the current MVP
    // set so a silent, undocumented change is caught; extending the list
    // is a one-line data change, not an algorithm change.
    expect(SUPPORTED_SPANISH_FLIGHT_ORIGINS.map((o) => o.iata).sort()).toEqual(["AGP", "BCN", "MAD", "SVQ"]);
  });

  it("searchViableFlightOrigins issues exactly one search attempt per entry in the current list, however many it holds", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(duffelOfferRequestBody()), { status: 201 })) as unknown as typeof fetch;
    const result = await searchViableFlightOrigins({ tripSlug: RUN_ID, partySize: 4, fetchImpl });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(fetchImpl).toHaveBeenCalledTimes(SUPPORTED_SPANISH_FLIGHT_ORIGINS.length);
  });
});
