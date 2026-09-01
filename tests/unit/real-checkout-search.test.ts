import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { searchRealHotelOptions, searchViableFlightOrigins, getFlightSessionOffers } from "@/server/actions/real-checkout-search";
import { SUPPORTED_SPANISH_FLIGHT_ORIGINS } from "@/lib/checkout-atu-aire/spanishFlightOrigins";

// Fase 2.5 §25 J/K/M (hotel SEARCH-only UI wiring) and N (one Offer
// Request, two slices) — the new real-checkout SEARCH server actions
// this session added on top of the existing Nuitee/Duffel provider
// layer. Both actions must never PREBOOK/BOOK/create an Order — SEARCH
// only, exactly like the legacy ATU_AIRE quote layer.

const RUN_ID = `realsearch-${Date.now()}`;
let tripId: string;

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
  await prisma.event.create({ data: { tripId, homeTeam: "A", awayTeam: "B", stadium: "Test", matchDate: new Date("2026-11-15T20:00:00Z") } });
});

afterAll(async () => {
  await prisma.flightSearchSession.deleteMany({ where: { tripId } });
  await prisma.event.deleteMany({ where: { tripId } });
  await prisma.trip.delete({ where: { id: tripId } });
  await prisma.$disconnect();
});

function nuiteeSearchBody() {
  return {
    data: [
      {
        hotelId: "hotel_1",
        roomTypes: [
          {
            offerId: "hotel_offer_1",
            offerRetailRate: { amount: 300, currency: "EUR" },
            rates: [
              { occupancyNumber: 1, name: "Doble", adultCount: 2, retailRate: { total: [{ amount: 150, currency: "EUR" }] }, cancellationPolicies: { refundableTag: "RFN" } },
              { occupancyNumber: 2, name: "Triple", adultCount: 3, retailRate: { total: [{ amount: 150, currency: "EUR" }] }, cancellationPolicies: { refundableTag: "RFN" } },
            ],
          },
        ],
      },
    ],
    hotels: [{ id: "hotel_1", name: "Hotel Test", address: "Calle Test 1", city_name: "Manchester", stars: 4, rating: 8.5, review_count: 100 }],
  };
}

describe("J — TICKET_HOTEL search returns real hotel options, no individual price on the card", () => {
  it("returns hotels with name/stars/address/rooms, never a price field", async () => {
    let capturedBody: unknown = null;
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      capturedBody = init?.body ? JSON.parse(init.body as string) : null;
      return new Response(JSON.stringify(nuiteeSearchBody()), { status: 200 });
    }) as unknown as typeof fetch;

    const result = await searchRealHotelOptions({ tripSlug: RUN_ID, partySize: 5, travelOriginCountry: "ES", fetchImpl });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.hotels).toHaveLength(1);
    expect(result.hotels[0].name).toBe("Hotel Test");
    expect(result.hotels[0].rooms.map((r) => r.roomName)).toEqual(["Doble", "Triple"]);
    // §8 — hotel cards never show an individual price; the DTO simply has no price field.
    expect(result.hotels[0]).not.toHaveProperty("price");

    // K — partySize 5 must use the canonical [2, 3] occupancy mix.
    expect((capturedBody as { occupancies: { adults: number }[] }).occupancies).toEqual([{ adults: 2 }, { adults: 3 }]);
  });
});

describe("M — the hotel search action only ever calls SEARCH, never PREBOOK", () => {
  it("no request to /rates/prebook is made", async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      calls.push(typeof input === "string" ? input : input.toString());
      return new Response(JSON.stringify(nuiteeSearchBody()), { status: 200 });
    }) as unknown as typeof fetch;

    await searchRealHotelOptions({ tripSlug: RUN_ID, partySize: 1, travelOriginCountry: "ES", fetchImpl });
    expect(calls.some((u) => /rates\/prebook/.test(u))).toBe(false);
    expect(calls.some((u) => /hotels\/rates/.test(u))).toBe(true);
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
