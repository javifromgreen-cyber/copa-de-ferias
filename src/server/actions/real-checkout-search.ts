"use server";

import { prisma } from "@/lib/db";
import { searchHotels } from "@/lib/providers/hotels/nuitee/search";
import { computeRequiredRoomMix } from "@/lib/pricing/roomMix";
import { isoCountryCodeForTripCountry } from "@/lib/checkout-atu-aire/tripCountryCode";
import { searchDirectRoundTripOffers } from "@/lib/providers/flights/duffel/roundTripSearch";
import { airportForCity } from "@/lib/checkout-atu-aire/airports";
import { CANDIDATE_SPANISH_ORIGINS } from "@/lib/providers/flights/realFlightProvider";
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

export type RealHotelRoomOption = { occupancyNumber: number; roomName: string; board: string | null };
export type RealHotelOption = {
  hotelId: string;
  name: string;
  stars: number | null;
  rating: number | null;
  address: string;
  city: string;
  photoUrl: string | null;
  /** The whole multi-room combination for this trip's exact occupancy — never one offer per room, never a price shown here (§8's own "hotel cards never show an individual price" product decision). */
  offerId: string;
  rooms: RealHotelRoomOption[];
};

export type RealHotelSearchResult = { ok: true; hotels: RealHotelOption[]; checkIn: string; checkOut: string } | { ok: false; error: string };

/**
 * §8/§9 — SEARCH only, using the canonical occupancy request
 * (computeRequiredRoomMix, same mix prepareCheckoutAttempt/rooming use
 * everywhere else) so what the UI shows is exactly the combination a
 * later PREBOOK will be asked to match — never a hand-built rooming guess.
 *
 * Fase 2.6 §3 — `guestNationality` is Nuitee's own API parameter (guest
 * tax/pricing nationality), fed here with `travelOriginCountry` as a
 * pragmatic proxy since this checkout doesn't collect a separate buyer
 * nationality field. This is NOT the flight-eligibility decision — that
 * is decided exclusively by isFlightPackageEligible(travelOriginCountry)
 * in the UI, never by this parameter or by Traveler.nationality.
 */
export async function searchRealHotelOptions(input: { tripSlug: string; partySize: number; travelOriginCountry: string; fetchImpl?: typeof fetch }): Promise<RealHotelSearchResult> {
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
  const checkIn = addDays(sortedEvents[0].matchDate, -1);
  const checkOut = addDays(sortedEvents[sortedEvents.length - 1].matchDate, 1);
  const mix = computeRequiredRoomMix(input.partySize);

  try {
    const result = await searchHotels({
      cityName: trip.city,
      countryCode,
      checkin: toIsoDate(checkIn),
      checkout: toIsoDate(checkOut),
      currency: trip.currency,
      guestNationality: input.travelOriginCountry,
      mix,
      starRatings: [trip.hotelStars, trip.hotelStars + 1],
      fetchImpl: input.fetchImpl,
    });
    const hotels: RealHotelOption[] = result.hotels
      .filter((h) => h.rates.length > 0)
      .map((h) => {
        const rate = h.rates[0];
        return {
          hotelId: h.hotelId,
          name: h.name,
          stars: h.stars,
          rating: h.rating,
          address: h.address,
          city: h.city,
          photoUrl: h.photoUrl,
          offerId: rate.offerId,
          rooms: rate.rooms.map((r) => ({ occupancyNumber: r.occupancyNumber, roomName: r.roomName, board: r.board })),
        };
      });
    return { ok: true, hotels, checkIn: toIsoDate(checkIn), checkOut: toIsoDate(checkOut) };
  } catch (err) {
    return { ok: false, error: `Búsqueda de hotel no disponible: ${err instanceof Error ? err.message : String(err)}` };
  }
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
  for (const candidate of CANDIDATE_SPANISH_ORIGINS) {
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
