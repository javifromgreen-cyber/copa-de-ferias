import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { searchRealHotelOptions, searchRealRoundTripFlightOptions } from "@/server/actions/real-checkout-search";

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

    const result = await searchRealHotelOptions({ tripSlug: RUN_ID, partySize: 5, buyerCountryCode: "ES", fetchImpl });
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

    await searchRealHotelOptions({ tripSlug: RUN_ID, partySize: 1, buyerCountryCode: "ES", fetchImpl });
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

describe("N — one Duffel Offer Request with two slices, never two independent one-way searches", () => {
  it("issues exactly one POST to /air/offer_requests with both an outbound and a return slice in the same body", async () => {
    const calls: { url: string; body: unknown }[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: typeof input === "string" ? input : input.toString(), body: init?.body ? JSON.parse(init.body as string) : null });
      return new Response(JSON.stringify(duffelOfferRequestBody()), { status: 201 });
    }) as unknown as typeof fetch;

    const result = await searchRealRoundTripFlightOptions({ tripSlug: RUN_ID, originIata: "MAD", partySize: 1, fetchImpl });
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toMatch(/air\/offer_requests/);
    const slices = (calls[0].body as { data: { slices: { origin: string; destination: string }[] } }).data.slices;
    expect(slices).toHaveLength(2);
    expect(slices[0].origin).toBe("MAD");
    expect(slices[1].destination).toBe("MAD");
  });

  it("the returned DTO never carries a separate per-leg price — only one totalAmount for the whole round trip", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(duffelOfferRequestBody()), { status: 201 })) as unknown as typeof fetch;
    const result = await searchRealRoundTripFlightOptions({ tripSlug: RUN_ID, originIata: "MAD", partySize: 1, fetchImpl });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.offers[0]).not.toHaveProperty("outboundPrice");
    expect(result.offers[0]).not.toHaveProperty("returnPrice");
    expect(typeof result.offers[0].totalAmount).toBe("number");
  });
});
