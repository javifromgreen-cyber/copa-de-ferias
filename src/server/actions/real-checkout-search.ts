"use server";

import { prisma } from "@/lib/db";
import { searchHotels } from "@/lib/providers/hotels/nuitee/search";
import { computeRequiredRoomMix } from "@/lib/pricing/roomMix";
import { isoCountryCodeForTripCountry } from "@/lib/checkout-atu-aire/tripCountryCode";
import { buildHotelShortlist } from "@/lib/checkout-atu-aire/hotelAutoSelection";
import { searchDirectRoundTripOffers } from "@/lib/providers/flights/duffel/roundTripSearch";
import { airportForCity } from "@/lib/checkout-atu-aire/airports";
import { SUPPORTED_SPANISH_FLIGHT_ORIGINS } from "@/lib/checkout-atu-aire/spanishFlightOrigins";
import type { OriginOption } from "@/lib/providers/types";
import { toStoredFlightOffer, type RealFlightSegmentDTO, type RealFlightSliceDTO, type RealCommercialProductDTO, type StoredFlightOffer } from "@/lib/checkout-saga/flightSearchSession";

/**
 * Fase 2.5 §8/§10, corrected in Fase 2.6 §2/§4 — the new real flow's own
 * SEARCH-only server actions (never PREBOOK/BOOK/Order — those only ever
 * run inside prepareCheckoutAttempt at CONTINUAR).
 *
 * Fase 2.6 §2 — the flight side no longer hands passengerIds (or even
 * offerRequestId) to the browser at all. A Duffel round-trip search's
 * results are persisted server-side as a FlightSearchSession the moment
 * they're fetched; the browser only ever holds that session's opaque id.
 * searchViableFlightOrigins() does the actual Duffel calls (one per
 * candidate Spanish origin) and creates one session per origin that
 * turned out viable; getFlightSessionOffers() is a DB-only read used
 * once the customer picks an origin, so picking an origin never re-hits
 * Duffel — the search already happened.
 */

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export type HotelShortlistOption = {
  hotelId: string;
  offerId: string;
  name: string;
  stars: number | null;
  address: string;
  city: string;
  /** Proximity to the STADIUM only — never a "city center" concept, never hidden: shown on every card so the customer knows exactly what they're choosing. */
  distanceToStadiumKm: number;
  expectedTotalPrice: number;
  expectedRooms: { roomName: string; occupancyNumber: number }[];
  board: string | null;
  /** Whether every room in the chosen rate is refundable — shown as the card's "useful tarifa info", never provider cost/margin/clientReference/Nuitee internals. */
  refundable: boolean;
};

export type SearchHotelShortlistResult = { ok: true; hotels: HotelShortlistOption[]; checkIn: string; checkOut: string } | { ok: false; error: string };

/**
 * Wide enough to virtually never starve the shortlist, without an
 * artificial hard cutoff that could leave the customer with zero
 * options — Nuitee provides inventory, buildHotelShortlist ranks it by
 * proximity and truncates to the top 3; this radius only bounds how much
 * inventory is fetched, it is never used to eliminate a candidate.
 */
const HOTEL_SEARCH_RADIUS_KM = 15;

/**
 * Fase 3B.2, corrected — replaces both the old "show every Nuitee hotel"
 * flow AND the later "pick a star category, we auto-select ONE hotel"
 * flow. The customer no longer picks anything up front: Copa de Ferias
 * searches automatically and shows a SHORTLIST of up to 3 concrete,
 * available hotels, ranked by proximity to the stadium (price only
 * breaks a practical tie — see hotelAutoSelection.ts), and the customer
 * picks ONE explicitly.
 *
 * SEARCH only — no PREBOOK here at all. PREBOOK/revalidation of the
 * customer's actual choice happens exactly where it always has: inside
 * prepareCheckoutAttempt -> runQuoteRevalidation, at CONTINUAR. If that
 * PREBOOK finds the chosen option no longer viable, this function is
 * simply called again to refresh the shortlist — never a silent
 * substitution of a different hotel.
 */
export async function searchHotelShortlist(input: { tripSlug: string; partySize: number; travelOriginCountry: string; fetchImpl?: typeof fetch }): Promise<SearchHotelShortlistResult> {
  const trip = await prisma.trip.findUnique({ where: { slug: input.tripSlug }, include: { events: true } });
  if (!trip || !trip.published || trip.travelMode !== "A_TU_AIRE") {
    return { ok: false, error: "Este producto no está disponible." };
  }
  if (trip.events.length === 0) {
    return { ok: false, error: "Este producto todavía no tiene partidos configurados." };
  }
  // Still a business gate on supported destinations (independent of the
  // SEARCH mechanism below).
  if (!isoCountryCodeForTripCountry(trip.country)) {
    return { ok: false, error: "No se puede buscar hotel para este destino todavía (país sin mapear)." };
  }

  const sortedEvents = [...trip.events].sort((a, b) => a.matchDate.getTime() - b.matchDate.getTime());
  const stadiumEvent = sortedEvents.find((e) => e.primaryEvent) ?? sortedEvents[0];
  if (stadiumEvent.stadiumLatitude === null || stadiumEvent.stadiumLongitude === null) {
    return { ok: false, error: "Este partido todavía no tiene configurada la ubicación del estadio para mostrar hoteles." };
  }
  const stadium = { lat: stadiumEvent.stadiumLatitude, lng: stadiumEvent.stadiumLongitude };

  const checkIn = addDays(sortedEvents[0].matchDate, -1);
  const checkOut = addDays(sortedEvents[sortedEvents.length - 1].matchDate, 1);
  const mix = computeRequiredRoomMix(input.partySize);

  let searchResult;
  try {
    // Nuitee's official geographic SEARCH (latitude/longitude/radius,
    // radius in METERS), centered on the stadium — a generous, fixed
    // radius so there is enough inventory to rank from, never a small
    // radius that could return zero hotels. No starRating filter: every
    // category is a valid shortlist candidate now.
    searchResult = await searchHotels({
      latitude: stadium.lat,
      longitude: stadium.lng,
      radiusMeters: HOTEL_SEARCH_RADIUS_KM * 1000,
      checkin: toIsoDate(checkIn),
      checkout: toIsoDate(checkOut),
      currency: trip.currency,
      guestNationality: input.travelOriginCountry,
      mix,
      fetchImpl: input.fetchImpl,
    });
  } catch (err) {
    return { ok: false, error: `Búsqueda de hotel no disponible: ${err instanceof Error ? err.message : String(err)}` };
  }

  const shortlist = buildHotelShortlist({ hotels: searchResult.hotels, stadium });
  if (shortlist.length === 0) {
    return { ok: false, error: "No hay hoteles disponibles para estas fechas." };
  }

  const hotels: HotelShortlistOption[] = shortlist.map((c) => ({
    hotelId: c.hotel.hotelId,
    offerId: c.rate.offerId,
    name: c.hotel.name,
    stars: c.hotel.stars,
    address: c.hotel.address,
    city: c.hotel.city,
    distanceToStadiumKm: c.distanceToStadiumKm,
    expectedTotalPrice: c.rate.price.total,
    expectedRooms: c.rate.rooms.map((r) => ({ roomName: r.roomName, occupancyNumber: r.occupancyNumber })),
    board: c.rate.rooms[0]?.board ?? null,
    refundable: c.rate.rooms.every((r) => r.refundable),
  }));

  return { ok: true, hotels, checkIn: toIsoDate(checkIn), checkOut: toIsoDate(checkOut) };
}

export type { RealFlightSegmentDTO, RealFlightSliceDTO, RealCommercialProductDTO, StoredFlightOffer };

/** The browser-facing shape — identical to StoredFlightOffer, named separately so a future field only added for one side doesn't leak into the other by accident. */
export type RealRoundTripOfferDTO = StoredFlightOffer;

const FLIGHT_SEARCH_SESSION_TTL_MS = 20 * 60 * 1000; // conservative bound under Duffel's own offer expiry, same discipline as TICKET_HOLD_TTL_MS.

export type ViableFlightOrigin = OriginOption & { sessionId: string };
export type SearchViableFlightOriginsResult = { ok: true; origins: ViableFlightOrigin[]; outboundDate: string; returnDate: string } | { ok: false; error: string };

/**
 * §4 — the ONLY place that decides which Spanish airports are actually
 * offered: one real direct round-trip search per candidate origin (never
 * a fixed/hidden airport), and an origin only appears in the result when
 * that search actually returned offers. Each viable search's results are
 * persisted as a FlightSearchSession in the same pass — picking that
 * origin afterward (getFlightSessionOffers) never re-hits Duffel, which
 * is the "no búsquedas duplicadas" requirement: the minimal fix is doing
 * the search once and keeping it, not adding a separate cache layer.
 */
export async function searchViableFlightOrigins(input: { tripSlug: string; partySize: number; fetchImpl?: typeof fetch }): Promise<SearchViableFlightOriginsResult> {
  const trip = await prisma.trip.findUnique({ where: { slug: input.tripSlug }, include: { events: true } });
  if (!trip || !trip.published || trip.travelMode !== "A_TU_AIRE") {
    return { ok: false, error: "Este producto no está disponible." };
  }
  if (trip.events.length === 0) {
    return { ok: false, error: "Este producto todavía no tiene partidos configurados." };
  }
  const sortedEvents = [...trip.events].sort((a, b) => a.matchDate.getTime() - b.matchDate.getTime());
  const outboundDate = toIsoDate(addDays(sortedEvents[0].matchDate, -1));
  const returnDate = toIsoDate(addDays(sortedEvents[sortedEvents.length - 1].matchDate, 1));
  const destinationAirport = airportForCity(trip.city);

  const origins: ViableFlightOrigin[] = [];
  for (const candidate of SUPPORTED_SPANISH_FLIGHT_ORIGINS) {
    // §5 — reuse a still-valid session from an earlier identical search
    // (same trip/dates/partySize/origin) instead of firing a new Offer
    // Request. A plain DB lookup, not a cache layer: the session row
    // already IS the cached result, so a second "Buscar aeropuertos"
    // click within its TTL costs zero Duffel calls.
    const reusable = await prisma.flightSearchSession.findFirst({
      where: { tripId: trip.id, partySize: input.partySize, originIata: candidate.iata, destinationIata: destinationAirport, outboundDate, returnDate, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    if (reusable) {
      origins.push({ ...candidate, sessionId: reusable.id });
      continue;
    }

    let result;
    try {
      result = await searchDirectRoundTripOffers({
        originIata: candidate.iata,
        destinationIata: destinationAirport,
        outboundDate,
        returnDate,
        passengers: input.partySize,
        fetchImpl: input.fetchImpl,
      });
    } catch {
      continue; // a single origin failing (timeout, no route) never fails the whole search
    }
    if (result.offers.length === 0) continue;

    const storedOffers = result.offers.map(toStoredFlightOffer);
    const earliestExpiry = result.offers.reduce((min, o) => (o.expiresAt.getTime() < min.getTime() ? o.expiresAt : min), result.offers[0].expiresAt);
    const expiresAt = new Date(Math.min(earliestExpiry.getTime(), Date.now() + FLIGHT_SEARCH_SESSION_TTL_MS));

    const session = await prisma.flightSearchSession.create({
      data: {
        tripId: trip.id,
        partySize: input.partySize,
        originIata: candidate.iata,
        destinationIata: destinationAirport,
        outboundDate,
        returnDate,
        offerRequestId: result.offers[0].offerRequestId,
        passengerIds: JSON.stringify(result.offers[0].passengerIds),
        offersJson: JSON.stringify(storedOffers),
        expiresAt,
      },
    });
    origins.push({ ...candidate, sessionId: session.id });
  }

  if (origins.length === 0) {
    return { ok: false, error: "No hay ningún aeropuerto español con vuelo directo de ida y vuelta disponible para estas fechas." };
  }
  return { ok: true, origins, outboundDate, returnDate };
}

export type GetFlightSessionOffersResult = { ok: true; offers: RealRoundTripOfferDTO[] } | { ok: false; error: string };

/**
 * §2/§4 — a pure DB read (no Duffel call): the offers a viable-origin
 * search already found and persisted. Called once the customer picks an
 * origin from searchViableFlightOrigins()'s result, so choosing an
 * origin is instant and never issues a second, duplicate search.
 */
export async function getFlightSessionOffers(input: { sessionId: string }): Promise<GetFlightSessionOffersResult> {
  const session = await prisma.flightSearchSession.findUnique({ where: { id: input.sessionId } });
  if (!session || session.expiresAt.getTime() <= Date.now()) {
    return { ok: false, error: "La búsqueda de vuelos ha caducado — vuelve a buscar." };
  }
  const offers = JSON.parse(session.offersJson) as StoredFlightOffer[];
  return { ok: true, offers };
}
