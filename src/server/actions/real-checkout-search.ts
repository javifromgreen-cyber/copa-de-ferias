"use server";

import { prisma } from "@/lib/db";
import { searchHotels } from "@/lib/providers/hotels/nuitee/search";
import { prebookOffer } from "@/lib/providers/hotels/nuitee/prebook";
import { computeRequiredRoomMix } from "@/lib/pricing/roomMix";
import { isoCountryCodeForTripCountry } from "@/lib/checkout-atu-aire/tripCountryCode";
import { rankHotelCandidates } from "@/lib/checkout-atu-aire/hotelAutoSelection";
import { classifyHotelAutoBookability } from "@/lib/checkout-saga/reversibility";
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

export type ResolvedAutoHotel = {
  offerId: string;
  hotelName: string;
  hotelAddress: string;
  /** The star rating Nuitee actually reported for this hotel — always equal to hotelStarCategory by construction (only exact-category candidates are ever ranked), carried separately so a later defensive check (hotelFulfillment.ts, right before BOOK) never has to trust that equality blindly. */
  stars: number;
  /** The category the customer selected — 3 or 4, never a range. */
  hotelStarCategory: number;
  expectedTotalPrice: number;
  expectedRooms: { roomName: string; occupancyNumber: number }[];
  /** § — proximity to the STADIUM only; never a "city center" concept. */
  distanceToStadiumKm: number;
  stadiumHotelRadiusKm: number;
};

export type ResolveAutoHotelResult = { ok: true; hotel: ResolvedAutoHotel; checkIn: string; checkOut: string } | { ok: false; error: string };

/** How many ranked candidates to try PREBOOKing before giving up — bounds both response time and Nuitee sandbox call volume. */
const MAX_AUTO_HOTEL_ATTEMPTS = 6;

function noHotelsAvailableMessage(starCategory: number): string {
  return `No hay hoteles de ${starCategory} estrellas disponibles cerca del estadio para estas fechas.`;
}

/**
 * Fase 3B.3 — replaces the old "show every Nuitee hotel, let the customer
 * pick" flow entirely. The customer only ever chooses a star CATEGORY (3
 * or 4); this resolves ONE specific hotel automatically:
 *
 *   SEARCH (exact category) -> rank candidates (proximity-to-stadium
 *   FILTER, then cheapest-in-zone wins — see hotelAutoSelection.ts) ->
 *   PREBOOK the best candidate to confirm it's still real and
 *   auto-bookable -> on failure, try the next candidate of the SAME
 *   category within the SAME radius (never a silent 4★->3★ downgrade,
 *   never falling back to showing the list).
 *
 * Still SEARCH+PREBOOK only — never BOOK, never an Order, exactly like
 * the rest of this file's actions. The later CONTINUAR step
 * (prepareCheckoutAttempt -> runQuoteRevalidation) re-PREBOOKs this exact
 * offerId again before payment, same as it always has — this function
 * only decides WHICH hotel/offer that step will be asked to confirm.
 */
export async function resolveAutoHotelSelection(input: { tripSlug: string; partySize: number; travelOriginCountry: string; hotelStarCategory: number; fetchImpl?: typeof fetch }): Promise<ResolveAutoHotelResult> {
  const trip = await prisma.trip.findUnique({ where: { slug: input.tripSlug }, include: { events: true } });
  if (!trip || !trip.published || trip.travelMode !== "A_TU_AIRE") {
    return { ok: false, error: "Este producto no está disponible." };
  }
  if (trip.events.length === 0) {
    return { ok: false, error: "Este producto todavía no tiene partidos configurados." };
  }
  const countryCode = isoCountryCodeForTripCountry(trip.country);
  if (!countryCode) {
    return { ok: false, error: "No se puede buscar hotel para este destino todavía (país sin mapear)." };
  }

  const sortedEvents = [...trip.events].sort((a, b) => a.matchDate.getTime() - b.matchDate.getTime());
  const stadiumEvent = sortedEvents.find((e) => e.primaryEvent) ?? sortedEvents[0];
  if (stadiumEvent.stadiumLatitude === null || stadiumEvent.stadiumLongitude === null || stadiumEvent.stadiumHotelRadiusKm === null) {
    return { ok: false, error: "Este partido todavía no tiene configurada la ubicación del estadio para la selección automática de hotel." };
  }
  const stadium = { lat: stadiumEvent.stadiumLatitude, lng: stadiumEvent.stadiumLongitude };
  const stadiumHotelRadiusKm = stadiumEvent.stadiumHotelRadiusKm;

  const checkIn = addDays(sortedEvents[0].matchDate, -1);
  const checkOut = addDays(sortedEvents[sortedEvents.length - 1].matchDate, 1);
  const mix = computeRequiredRoomMix(input.partySize);

  let searchResult;
  try {
    searchResult = await searchHotels({
      cityName: trip.city,
      countryCode,
      checkin: toIsoDate(checkIn),
      checkout: toIsoDate(checkOut),
      currency: trip.currency,
      guestNationality: input.travelOriginCountry,
      mix,
      starRatings: [input.hotelStarCategory],
      fetchImpl: input.fetchImpl,
    });
  } catch (err) {
    return { ok: false, error: `Búsqueda de hotel no disponible: ${err instanceof Error ? err.message : String(err)}` };
  }

  const ranked = rankHotelCandidates({ hotels: searchResult.hotels, starCategory: input.hotelStarCategory, stadium, stadiumHotelRadiusKm });
  if (ranked.length === 0) {
    return { ok: false, error: noHotelsAvailableMessage(input.hotelStarCategory) };
  }

  for (const candidate of ranked.slice(0, MAX_AUTO_HOTEL_ATTEMPTS)) {
    let prebook;
    try {
      prebook = await prebookOffer(candidate.rate.offerId, input.fetchImpl);
    } catch {
      continue; // this candidate is no longer bookable — try the next one in the SAME category/zone.
    }
    if (prebook.hotelId !== candidate.hotel.hotelId) continue;
    if (!classifyHotelAutoBookability(prebook.rooms).autoBookable) continue; // lost reversibility/safe-window between SEARCH and PREBOOK.

    return {
      ok: true,
      hotel: {
        offerId: prebook.offerId,
        hotelName: candidate.hotel.name,
        hotelAddress: candidate.hotel.address,
        stars: input.hotelStarCategory,
        hotelStarCategory: input.hotelStarCategory,
        expectedTotalPrice: prebook.price.total,
        expectedRooms: prebook.rooms.map((r) => ({ roomName: r.roomName, occupancyNumber: r.occupancyNumber })),
        distanceToStadiumKm: candidate.distanceToStadiumKm,
        stadiumHotelRadiusKm,
      },
      checkIn: toIsoDate(checkIn),
      checkOut: toIsoDate(checkOut),
    };
  }

  return { ok: false, error: noHotelsAvailableMessage(input.hotelStarCategory) };
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
