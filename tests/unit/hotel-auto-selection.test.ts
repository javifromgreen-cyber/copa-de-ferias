import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { haversineDistanceKm } from "@/lib/geo/distance";
import { buildHotelShortlist, HOTEL_SHORTLIST_SIZE, type HotelCandidate } from "@/lib/checkout-atu-aire/hotelAutoSelection";
import type { HotelOption, HotelRoom } from "@/lib/providers/hotels/nuitee/types";

// Fase 3B.2, corrected — pure-logic tests for the automatic hotel
// SHORTLIST (up to 3 concrete hotels, ranked by proximity to the
// stadium, price only breaking a practical tie) plus static checks that
// the public UI never shows the old raw hotel list or the removed
// 3★/4★ category selector. Nothing here touches Nuitee or Stripe — see
// real-checkout-search.test.ts and checkout-hotel-fulfillment.test.ts
// for the integration-level coverage (shortlist search, BOOK no longer
// gated by star/radius, snapshot persistence).

const STADIUM = { lat: 53.4831, lng: -2.2004 }; // Etihad Stadium, Manchester

function room(overrides: Partial<HotelRoom> = {}): HotelRoom {
  const inOneDay = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  return {
    occupancyNumber: 1,
    roomName: "Doble",
    maxOccupancy: 2,
    adultCount: 2,
    board: "RO",
    price: { total: 100, currency: "EUR" },
    includedTaxesAndFees: [],
    excludedTaxesAndFees: [],
    refundable: true,
    freeCancellationUntil: inOneDay,
    ...overrides,
  };
}

function nonRefundableRoom(overrides: Partial<HotelRoom> = {}): HotelRoom {
  return room({ refundable: false, freeCancellationUntil: null, ...overrides });
}

function hotel(overrides: Partial<HotelOption> = {}): HotelOption {
  return {
    provider: "nuitee",
    hotelId: "hotel_default",
    name: "Hotel Default",
    stars: 4,
    rating: null,
    reviewCount: null,
    address: "Somewhere",
    city: "Manchester",
    coordinates: STADIUM,
    photoUrl: null,
    rates: [{ offerId: "offer_default", rooms: [room()], price: { total: 100, currency: "EUR" } }],
    ...overrides,
  };
}

function atDistanceKm(km: number): { lat: number; lng: number } {
  // ~0.009 degrees of latitude is ~1km — close enough for these fixtures.
  return { lat: STADIUM.lat + km * 0.009, lng: STADIUM.lng };
}

function ids(candidates: HotelCandidate[]): string[] {
  return candidates.map((c) => c.hotel.hotelId);
}

describe("A — the public UI never shows the old raw Nuitee list, the removed 3★/4★ selector, or 'céntrico'", () => {
  const source = readFileSync(join(process.cwd(), "src/components/checkout-real/RealCheckoutPrototype.tsx"), "utf-8");

  it("no 'Buscar hoteles' search-and-list button, and no star-category buttons/handler remain", () => {
    expect(source).not.toContain("Buscar hoteles");
    expect(source).not.toContain("handleSearchHotels");
    expect(source).not.toContain("handleSelectHotelCategory");
    expect(source).not.toContain("3 estrellas");
    expect(source).not.toContain("4 estrellas");
    expect(source).not.toMatch(/no hay hoteles de/i);
  });

  it("no 'céntrico'/city-center copy anywhere in this flow", () => {
    expect(source.toLowerCase()).not.toContain("céntrico");
    expect(source.toLowerCase()).not.toContain("centrico");
  });

  it("has the required shortlist copy", () => {
    expect(source).toContain("Elige tu hotel");
    expect(source).toContain("Te mostramos hasta 3 opciones disponibles para tus fechas");
    expect(source).toContain("priorizando las más próximas al estadio");
  });
});

describe("B/C — the shortlist never contains more than HOTEL_SHORTLIST_SIZE (3) hotels", () => {
  it("HOTEL_SHORTLIST_SIZE is 3", () => {
    expect(HOTEL_SHORTLIST_SIZE).toBe(3);
  });

  it("5 valid, distinct candidates -> only the best 3 are returned", () => {
    const hotels = [1, 2, 3, 4, 5].map((n) => hotel({ hotelId: `h${n}`, coordinates: atDistanceKm(n), rates: [{ offerId: `o${n}`, rooms: [room({ price: { total: 100, currency: "EUR" } })], price: { total: 100, currency: "EUR" } }] }));
    const shortlist = buildHotelShortlist({ hotels, stadium: STADIUM });
    expect(shortlist).toHaveLength(3);
    expect(ids(shortlist)).toEqual(["h1", "h2", "h3"]); // closest 3 win, since price/rating/board all tie.
  });
});

describe("D/E — the shortlist shows exactly as many candidates as are actually valid, never invented", () => {
  it("1 valid candidate -> exactly 1 shown", () => {
    const hotels = [hotel({ hotelId: "only_one" })];
    const shortlist = buildHotelShortlist({ hotels, stadium: STADIUM });
    expect(shortlist).toHaveLength(1);
  });

  it("2 valid candidates -> exactly 2 shown", () => {
    const hotels = [hotel({ hotelId: "h_a" }), hotel({ hotelId: "h_b", coordinates: atDistanceKm(2) })];
    const shortlist = buildHotelShortlist({ hotels, stadium: STADIUM });
    expect(shortlist).toHaveLength(2);
  });

  it("0 valid candidates -> an empty shortlist, never fabricated", () => {
    const shortlist = buildHotelShortlist({ hotels: [], stadium: STADIUM });
    expect(shortlist).toEqual([]);
  });
});

describe("G — primary ranking is proximity to the stadium", () => {
  it("a closer hotel outranks a farther one even at a higher price", () => {
    const close = hotel({ hotelId: "h_close", coordinates: atDistanceKm(1), rates: [{ offerId: "o_close", rooms: [room({ price: { total: 300, currency: "EUR" } })], price: { total: 300, currency: "EUR" } }] });
    const far = hotel({ hotelId: "h_far", coordinates: atDistanceKm(9), rates: [{ offerId: "o_far", rooms: [room({ price: { total: 50, currency: "EUR" } })], price: { total: 50, currency: "EUR" } }] });
    const shortlist = buildHotelShortlist({ hotels: [far, close], stadium: STADIUM });
    expect(shortlist[0].hotel.hotelId).toBe("h_close");
  });
});

describe("H — a practical distance tie is decided by price, never a hard 5km cutoff", () => {
  it("two hotels within the tie-tolerance: the cheaper one wins the higher rank", () => {
    const cheaper = hotel({ hotelId: "h_cheap", coordinates: atDistanceKm(2.0), rates: [{ offerId: "o_cheap", rooms: [room({ price: { total: 80, currency: "EUR" } })], price: { total: 80, currency: "EUR" } }] });
    const pricier = hotel({ hotelId: "h_pricey", coordinates: atDistanceKm(2.1), rates: [{ offerId: "o_pricey", rooms: [room({ price: { total: 150, currency: "EUR" } })], price: { total: 150, currency: "EUR" } }] });
    const shortlist = buildHotelShortlist({ hotels: [pricier, cheaper], stadium: STADIUM });
    expect(shortlist[0].hotel.hotelId).toBe("h_cheap");
  });

  it("a genuine (non-tie) distance difference is never overridden by price", () => {
    const closeButPricier = hotel({ hotelId: "h_close_pricey", coordinates: atDistanceKm(1), rates: [{ offerId: "o1", rooms: [room({ price: { total: 300, currency: "EUR" } })], price: { total: 300, currency: "EUR" } }] });
    const farButCheaper = hotel({ hotelId: "h_far_cheap", coordinates: atDistanceKm(5), rates: [{ offerId: "o2", rooms: [room({ price: { total: 40, currency: "EUR" } })], price: { total: 40, currency: "EUR" } }] });
    const shortlist = buildHotelShortlist({ hotels: [farButCheaper, closeButPricier], stadium: STADIUM });
    expect(shortlist[0].hotel.hotelId).toBe("h_close_pricey");
  });
});

describe("I — a genuinely distant hotel can still appear in the top 3 if it's among the best available options", () => {
  it("with only far candidates available, they still populate the shortlist — never left empty by an artificial radius", () => {
    const hotels = [
      hotel({ hotelId: "h_far1", coordinates: atDistanceKm(12) }),
      hotel({ hotelId: "h_far2", coordinates: atDistanceKm(15) }),
    ];
    const shortlist = buildHotelShortlist({ hotels, stadium: STADIUM });
    expect(shortlist).toHaveLength(2);
    expect(shortlist.some((c) => c.distanceToStadiumKm > 10)).toBe(true);
  });
});

describe("J — there is no hard 5km (or any) radius filter anymore", () => {
  it("buildHotelShortlist accepts no radius parameter at all — a 20km-away hotel is still ranked, not discarded", () => {
    const veryFar = hotel({ hotelId: "h_20km", coordinates: atDistanceKm(20) });
    const shortlist = buildHotelShortlist({ hotels: [veryFar], stadium: STADIUM });
    expect(shortlist).toHaveLength(1);
    expect(shortlist[0].distanceToStadiumKm).toBeGreaterThan(15);
  });

  it("a hotel with no coordinates is still excluded — never a guessed distance", () => {
    const noCoords = hotel({ hotelId: "no_coords", coordinates: null });
    const shortlist = buildHotelShortlist({ hotels: [noCoords], stadium: STADIUM });
    expect(shortlist).toHaveLength(0);
  });
});

describe("L/M — no duplicate hotels: multiple rates in the same hotel produce exactly one card", () => {
  it("a hotel with 3 rates still yields exactly one candidate", () => {
    const multiRate = hotel({
      hotelId: "h_multi",
      rates: [
        { offerId: "o1", rooms: [room({ price: { total: 120, currency: "EUR" } })], price: { total: 120, currency: "EUR" } },
        { offerId: "o2", rooms: [room({ price: { total: 90, currency: "EUR" } })], price: { total: 90, currency: "EUR" } },
        { offerId: "o3", rooms: [room({ price: { total: 200, currency: "EUR" } })], price: { total: 200, currency: "EUR" } },
      ],
    });
    const shortlist = buildHotelShortlist({ hotels: [multiRate], stadium: STADIUM });
    expect(shortlist).toHaveLength(1);
  });
});

describe("N — the cheapest VALID (auto-bookable) rate wins within a hotel, never a cheaper non-refundable rate over a pricier refundable one", () => {
  it("picks the pricier refundable rate over a cheaper non-refundable rate in the same hotel", () => {
    const mixed = hotel({
      hotelId: "h_mixed",
      rates: [
        { offerId: "cheap_nrfn", rooms: [nonRefundableRoom({ price: { total: 40, currency: "EUR" } })], price: { total: 40, currency: "EUR" } },
        { offerId: "pricier_rfn", rooms: [room({ price: { total: 90, currency: "EUR" } })], price: { total: 90, currency: "EUR" } },
      ],
    });
    const shortlist = buildHotelShortlist({ hotels: [mixed], stadium: STADIUM });
    expect(shortlist).toHaveLength(1);
    expect(shortlist[0].rate.offerId).toBe("pricier_rfn");
  });
});

describe("O — a hotel with no auto-bookable rate at all is discarded entirely", () => {
  it("every rate non-refundable -> the whole hotel is excluded", () => {
    const irreversible = hotel({ hotelId: "h_irreversible", rates: [{ offerId: "o_bad", rooms: [nonRefundableRoom()], price: { total: 50, currency: "EUR" } }] });
    const shortlist = buildHotelShortlist({ hotels: [irreversible], stadium: STADIUM });
    expect(shortlist).toHaveLength(0);
  });

  it("a rate whose free-cancellation deadline has already passed the safety window is excluded", () => {
    const pastDeadline = new Date(Date.now() - 60_000).toISOString();
    const unsafe = hotel({ hotelId: "h_unsafe", rates: [{ offerId: "o_unsafe", rooms: [room({ freeCancellationUntil: pastDeadline })], price: { total: 50, currency: "EUR" } }] });
    const shortlist = buildHotelShortlist({ hotels: [unsafe], stadium: STADIUM });
    expect(shortlist).toHaveLength(0);
  });
});

describe("distance is real haversine math, never a textual/estimated distance", () => {
  it("zero distance for the same point", () => {
    expect(haversineDistanceKm(STADIUM, STADIUM)).toBeCloseTo(0, 6);
  });

  it("a known ~1km offset comes back close to 1km", () => {
    const oneKmAway = atDistanceKm(1);
    expect(haversineDistanceKm(STADIUM, oneKmAway)).toBeGreaterThan(0.8);
    expect(haversineDistanceKm(STADIUM, oneKmAway)).toBeLessThan(1.2);
  });
});

describe("deterministic tie-breaks: identical candidates always produce the same order regardless of input order", () => {
  it("same distance/price/rating/board — sorted by a stable hotelId:offerId key", () => {
    const a = hotel({ hotelId: "h_a", rating: 8, coordinates: atDistanceKm(1), rates: [{ offerId: "o_a", rooms: [room({ board: "Breakfast Included" })], price: { total: 100, currency: "EUR" } }] });
    const b = hotel({ hotelId: "h_b", rating: 8, coordinates: atDistanceKm(1), rates: [{ offerId: "o_b", rooms: [room({ board: "Breakfast Included" })], price: { total: 100, currency: "EUR" } }] });
    const order1 = ids(buildHotelShortlist({ hotels: [a, b], stadium: STADIUM }));
    const order2 = ids(buildHotelShortlist({ hotels: [b, a], stadium: STADIUM }));
    expect(order1).toEqual(order2);
    expect(order1).toEqual(["h_a", "h_b"]);
  });

  it("a better rating wins over a worse one when distance/price tie", () => {
    const lowerRated = hotel({ hotelId: "h_low", rating: 6, coordinates: atDistanceKm(1) });
    const higherRated = hotel({ hotelId: "h_high", rating: 9, coordinates: atDistanceKm(1) });
    const shortlist = buildHotelShortlist({ hotels: [lowerRated, higherRated], stadium: STADIUM });
    expect(shortlist[0].hotel.hotelId).toBe("h_high");
  });
});
