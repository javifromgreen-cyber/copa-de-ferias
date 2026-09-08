import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { haversineDistanceKm } from "@/lib/geo/distance";
import { rankHotelCandidates, type HotelCandidate } from "@/lib/checkout-atu-aire/hotelAutoSelection";
import type { HotelOption, HotelRoom } from "@/lib/providers/hotels/nuitee/types";

// Fase 3B.3 — pure-logic tests for the automatic, hidden hotel selection
// (proximity-to-stadium FILTER, then cheapest-in-zone wins) plus static
// checks that the new UI never shows the old raw hotel list or the
// banned "céntrico"/city-center concept. Nothing here touches Nuitee or
// Stripe — see real-checkout-search.test.ts and
// checkout-hotel-fulfillment.test.ts for the integration-level coverage
// (PREBOOK fallback, BOOK guard, snapshot persistence).

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

describe("A — the new UI never shows the old raw Nuitee hotel list, the old search button, or 'céntrico'", () => {
  const source = readFileSync(join(process.cwd(), "src/components/checkout-real/RealCheckoutPrototype.tsx"), "utf-8");

  it("no 'Buscar hoteles' search-and-list button remains", () => {
    expect(source).not.toContain("Buscar hoteles");
    expect(source).not.toContain("handleSearchHotels");
  });

  it("no 'céntrico'/city-center copy anywhere in this flow", () => {
    expect(source.toLowerCase()).not.toContain("céntrico");
    expect(source.toLowerCase()).not.toContain("centrico");
  });

  it("exposes exactly the 3★/4★ category choice, with the required commercial copy", () => {
    expect(source).toContain("3 estrellas");
    expect(source).toContain("4 estrellas");
    expect(source).toContain("Seleccionamos automáticamente hoteles cercanos al estadio");
  });

  it("never renders a per-hotel .map() list for hotel options", () => {
    expect(source).not.toMatch(/hotelOptions\.map/);
  });
});

describe("B — exact star category filtering, never a range", () => {
  it("a 3★ request excludes a 4★ hotel and vice versa", () => {
    const hotels = [hotel({ hotelId: "h3", stars: 3 }), hotel({ hotelId: "h4", stars: 4 })];
    const ranked3 = rankHotelCandidates({ hotels, starCategory: 3, stadium: STADIUM, stadiumHotelRadiusKm: 5 });
    const ranked4 = rankHotelCandidates({ hotels, starCategory: 4, stadium: STADIUM, stadiumHotelRadiusKm: 5 });
    expect(ranked3.map((c) => c.hotel.hotelId)).toEqual(["h3"]);
    expect(ranked4.map((c) => c.hotel.hotelId)).toEqual(["h4"]);
  });
});

describe("C — distanceToStadiumKm is real haversine math, never a textual/estimated distance", () => {
  it("zero distance for the same point", () => {
    expect(haversineDistanceKm(STADIUM, STADIUM)).toBeCloseTo(0, 6);
  });

  it("a known ~1km offset comes back close to 1km", () => {
    const oneKmAway = atDistanceKm(1);
    expect(haversineDistanceKm(STADIUM, oneKmAway)).toBeGreaterThan(0.8);
    expect(haversineDistanceKm(STADIUM, oneKmAway)).toBeLessThan(1.2);
  });

  it("is symmetric", () => {
    const p = atDistanceKm(3);
    expect(haversineDistanceKm(STADIUM, p)).toBeCloseTo(haversineDistanceKm(p, STADIUM), 6);
  });
});

describe("D/E — radius-based exclusion: a cheap-but-too-far hotel never wins", () => {
  it("a hotel outside stadiumHotelRadiusKm is excluded even though it is far cheaper than every in-zone candidate", () => {
    const cheapButFar = hotel({ hotelId: "cheap_far", coordinates: atDistanceKm(20), rates: [{ offerId: "o_far", rooms: [room({ price: { total: 10, currency: "EUR" } })], price: { total: 10, currency: "EUR" } }] });
    const expensiveButClose = hotel({ hotelId: "expensive_close", coordinates: atDistanceKm(1), rates: [{ offerId: "o_close", rooms: [room({ price: { total: 300, currency: "EUR" } })], price: { total: 300, currency: "EUR" } }] });
    const ranked = rankHotelCandidates({ hotels: [cheapButFar, expensiveButClose], starCategory: 4, stadium: STADIUM, stadiumHotelRadiusKm: 5 });
    expect(ranked.map((c) => c.hotel.hotelId)).toEqual(["expensive_close"]);
  });

  it("a hotel with no coordinates at all is excluded — never a guessed location", () => {
    const noCoords = hotel({ hotelId: "no_coords", coordinates: null });
    const ranked = rankHotelCandidates({ hotels: [noCoords], starCategory: 4, stadium: STADIUM, stadiumHotelRadiusKm: 5 });
    expect(ranked).toHaveLength(0);
  });
});

describe("F/G — within the in-zone set, the cheapest valid rate wins — never a pure distance sort", () => {
  it("two in-zone hotels, different prices: the cheaper one wins even though it is farther (within the same zone)", () => {
    const cheaperButFartherInZone = hotel({ hotelId: "h_cheap", coordinates: atDistanceKm(4), rates: [{ offerId: "o1", rooms: [room({ price: { total: 80, currency: "EUR" } })], price: { total: 80, currency: "EUR" } }] });
    const pricierButCloserInZone = hotel({ hotelId: "h_pricey", coordinates: atDistanceKm(0.5), rates: [{ offerId: "o2", rooms: [room({ price: { total: 150, currency: "EUR" } })], price: { total: 150, currency: "EUR" } }] });
    const ranked = rankHotelCandidates({ hotels: [pricierButCloserInZone, cheaperButFartherInZone], starCategory: 4, stadium: STADIUM, stadiumHotelRadiusKm: 5 });
    expect(ranked[0].hotel.hotelId).toBe("h_cheap");
  });
});

describe("H — price tie: the closer-to-stadium candidate wins", () => {
  it("same price, different distance", () => {
    const far = hotel({ hotelId: "h_far_tie", coordinates: atDistanceKm(4), rates: [{ offerId: "o_far_tie", rooms: [room({ price: { total: 100, currency: "EUR" } })], price: { total: 100, currency: "EUR" } }] });
    const close = hotel({ hotelId: "h_close_tie", coordinates: atDistanceKm(1), rates: [{ offerId: "o_close_tie", rooms: [room({ price: { total: 100, currency: "EUR" } })], price: { total: 100, currency: "EUR" } }] });
    const ranked = rankHotelCandidates({ hotels: [far, close], starCategory: 4, stadium: STADIUM, stadiumHotelRadiusKm: 5 });
    expect(ranked[0].hotel.hotelId).toBe("h_close_tie");
  });
});

describe("I — deterministic tie-breaks: identical candidates always produce the same order regardless of input order", () => {
  it("same price/distance/rating/board — sorted by a stable hotelId:offerId key", () => {
    const a = hotel({ hotelId: "h_a", rating: 8, coordinates: atDistanceKm(1), rates: [{ offerId: "o_a", rooms: [room({ board: "Breakfast Included" })], price: { total: 100, currency: "EUR" } }] });
    const b = hotel({ hotelId: "h_b", rating: 8, coordinates: atDistanceKm(1), rates: [{ offerId: "o_b", rooms: [room({ board: "Breakfast Included" })], price: { total: 100, currency: "EUR" } }] });
    const order1 = rankHotelCandidates({ hotels: [a, b], starCategory: 4, stadium: STADIUM, stadiumHotelRadiusKm: 5 }).map((c) => c.hotel.hotelId);
    const order2 = rankHotelCandidates({ hotels: [b, a], starCategory: 4, stadium: STADIUM, stadiumHotelRadiusKm: 5 }).map((c) => c.hotel.hotelId);
    expect(order1).toEqual(order2);
    expect(order1).toEqual(["h_a", "h_b"]); // "h_a:o_a" < "h_b:o_b" lexicographically
  });

  it("a better rating wins over a worse one when price/distance tie", () => {
    const lowerRated = hotel({ hotelId: "h_low", rating: 6, coordinates: atDistanceKm(1) });
    const higherRated = hotel({ hotelId: "h_high", rating: 9, coordinates: atDistanceKm(1) });
    const ranked = rankHotelCandidates({ hotels: [lowerRated, higherRated], starCategory: 4, stadium: STADIUM, stadiumHotelRadiusKm: 5 });
    expect(ranked[0].hotel.hotelId).toBe("h_high");
  });
});

describe("J — stadiumHotelRadiusKm is configurable per call, never hardcoded", () => {
  it("the exact same candidate set produces a different result under two different radii", () => {
    const hotels = [hotel({ hotelId: "h_mid", coordinates: atDistanceKm(6) })];
    const tightRadius = rankHotelCandidates({ hotels, starCategory: 4, stadium: STADIUM, stadiumHotelRadiusKm: 5 });
    const wideRadius = rankHotelCandidates({ hotels, starCategory: 4, stadium: STADIUM, stadiumHotelRadiusKm: 10 });
    expect(tightRadius).toHaveLength(0);
    expect(wideRadius).toHaveLength(1);
  });
});

describe("L/M — a hotel with no auto-bookable rate at all is discarded entirely", () => {
  it("every rate non-refundable -> the whole hotel is excluded", () => {
    const irreversible = hotel({ hotelId: "h_irreversible", rates: [{ offerId: "o_bad", rooms: [nonRefundableRoom()], price: { total: 50, currency: "EUR" } }] });
    const ranked = rankHotelCandidates({ hotels: [irreversible], starCategory: 4, stadium: STADIUM, stadiumHotelRadiusKm: 5 });
    expect(ranked).toHaveLength(0);
  });

  it("a rate whose free-cancellation deadline has already passed the safety window is excluded", () => {
    const pastDeadline = new Date(Date.now() - 60_000).toISOString();
    const unsafe = hotel({ hotelId: "h_unsafe", rates: [{ offerId: "o_unsafe", rooms: [room({ freeCancellationUntil: pastDeadline })], price: { total: 50, currency: "EUR" } }] });
    const ranked = rankHotelCandidates({ hotels: [unsafe], starCategory: 4, stadium: STADIUM, stadiumHotelRadiusKm: 5 });
    expect(ranked).toHaveLength(0);
  });
});

describe("§ multiple rates within one hotel: the cheapest VALID (auto-bookable) rate wins, never a cheaper non-refundable one over a pricier refundable one", () => {
  it("picks the pricier refundable rate over a cheaper non-refundable rate in the same hotel", () => {
    const mixed = hotel({
      hotelId: "h_mixed",
      rates: [
        { offerId: "cheap_nrfn", rooms: [nonRefundableRoom({ price: { total: 40, currency: "EUR" } })], price: { total: 40, currency: "EUR" } },
        { offerId: "pricier_rfn", rooms: [room({ price: { total: 90, currency: "EUR" } })], price: { total: 90, currency: "EUR" } },
      ],
    });
    const ranked = rankHotelCandidates({ hotels: [mixed], starCategory: 4, stadium: STADIUM, stadiumHotelRadiusKm: 5 });
    expect(ranked).toHaveLength(1);
    expect(ranked[0].rate.offerId).toBe("pricier_rfn");
  });
});

describe("no candidates at all — an empty ranked list, never a fabricated one", () => {
  it("an empty input hotel list ranks to an empty list", () => {
    const ranked: HotelCandidate[] = rankHotelCandidates({ hotels: [], starCategory: 3, stadium: STADIUM, stadiumHotelRadiusKm: 5 });
    expect(ranked).toEqual([]);
  });
});
