"use server";

import { prisma } from "@/lib/db";
import { searchHotels } from "@/lib/providers/hotels/nuitee/search";
import { computeRequiredRoomMix } from "@/lib/pricing/roomMix";
import { isoCountryCodeForTripCountry } from "@/lib/checkout-atu-aire/tripCountryCode";
import { searchDirectRoundTripOffers } from "@/lib/providers/flights/duffel/roundTripSearch";
import { airportForCity } from "@/lib/checkout-atu-aire/airports";
import { CANDIDATE_SPANISH_ORIGINS } from "@/lib/providers/flights/realFlightProvider";
import type { OriginOption } from "@/lib/providers/types";

/**
 * Fase 2.5 §8/§10 — the new real flow's own SEARCH-only server actions
 * (never PREBOOK/BOOK/Order — those only ever run inside
 * prepareCheckoutAttempt at CONTINUAR, see prepareCheckoutAttempt.ts's own
 * header comment). This file exists purely so the UI can browse real
 * Nuitee/Duffel availability before the customer commits to anything.
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
 */
export async function searchRealHotelOptions(input: { tripSlug: string; partySize: number; buyerCountryCode: string; fetchImpl?: typeof fetch }): Promise<RealHotelSearchResult> {
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
      guestNationality: input.buyerCountryCode,
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

export async function getRealFlightOriginOptions(): Promise<OriginOption[]> {
  return CANDIDATE_SPANISH_ORIGINS;
}

export type RealFlightSegmentDTO = { originIata: string; destinationIata: string; departingAt: string; arrivingAt: string; carrierIata: string; carrierName: string; flightNumber: string | null };
export type RealFlightSliceDTO = { segments: RealFlightSegmentDTO[] };
export type RealRoundTripOfferDTO = {
  offerId: string;
  offerRequestId: string;
  passengerIds: string[];
  totalAmount: number;
  currency: string;
  expiresAt: string;
  outbound: RealFlightSliceDTO;
  return: RealFlightSliceDTO;
  commercialProduct: {
    outbound: { cabinClass: string | null; fareBrandName: string | null; baggage: { checkedIncluded: boolean; carryOnIncluded: boolean } | null };
    return: { cabinClass: string | null; fareBrandName: string | null; baggage: { checkedIncluded: boolean; carryOnIncluded: boolean } | null };
    refundBeforeDeparture: { allowed: boolean; penaltyAmount: number | null; penaltyCurrency: string | null } | null;
    changeBeforeDeparture: { allowed: boolean; penaltyAmount: number | null; penaltyCurrency: string | null } | null;
  };
};

export type RealFlightSearchResult = { ok: true; offers: RealRoundTripOfferDTO[] } | { ok: false; error: string };

/**
 * §10/§12 — ONE Duffel Offer Request with TWO slices, exactly what
 * searchDirectRoundTripOffers already builds — never two independent
 * one-way searches. Returns every direct round-trip offer for this
 * origin, serialized to plain DTOs (Date -> ISO string) for the client
 * component; the client derives PASO IDA / PASO VUELTA options and the
 * final resolved offer from this SAME array (see roundTripSelection.ts's
 * own pure functions, mirrored client-side for UI grouping only — the
 * real enforcement happens again, server-side, inside
 * prepareCheckoutAttempt's Duffel revalidation).
 */
export async function searchRealRoundTripFlightOptions(input: { tripSlug: string; originIata: string; partySize: number; fetchImpl?: typeof fetch }): Promise<RealFlightSearchResult> {
  const trip = await prisma.trip.findUnique({ where: { slug: input.tripSlug }, include: { events: true } });
  if (!trip || !trip.published || trip.travelMode !== "A_TU_AIRE") {
    return { ok: false, error: "Este producto no está disponible." };
  }
  if (trip.events.length === 0) {
    return { ok: false, error: "Este producto todavía no tiene partidos configurados." };
  }
  const sortedEvents = [...trip.events].sort((a, b) => a.matchDate.getTime() - b.matchDate.getTime());
  const outboundDate = addDays(sortedEvents[0].matchDate, -1);
  const returnDate = addDays(sortedEvents[sortedEvents.length - 1].matchDate, 1);
  const destinationAirport = airportForCity(trip.city);

  try {
    const result = await searchDirectRoundTripOffers({
      originIata: input.originIata,
      destinationIata: destinationAirport,
      outboundDate: toIsoDate(outboundDate),
      returnDate: toIsoDate(returnDate),
      passengers: input.partySize,
      fetchImpl: input.fetchImpl,
    });
    const offers: RealRoundTripOfferDTO[] = result.offers.map((o) => ({
      offerId: o.offerId,
      offerRequestId: o.offerRequestId,
      passengerIds: o.passengerIds,
      totalAmount: o.totalAmount,
      currency: o.currency,
      expiresAt: o.expiresAt.toISOString(),
      outbound: { segments: o.outbound.segments.map((s) => ({ originIata: s.originIata, destinationIata: s.destinationIata, departingAt: s.departingAt.toISOString(), arrivingAt: s.arrivingAt.toISOString(), carrierIata: s.marketingCarrier.iata, carrierName: s.marketingCarrier.name, flightNumber: s.flightNumber })) },
      return: { segments: o.return.segments.map((s) => ({ originIata: s.originIata, destinationIata: s.destinationIata, departingAt: s.departingAt.toISOString(), arrivingAt: s.arrivingAt.toISOString(), carrierIata: s.marketingCarrier.iata, carrierName: s.marketingCarrier.name, flightNumber: s.flightNumber })) },
      commercialProduct: o.commercialProduct,
    }));
    return { ok: true, offers };
  } catch (err) {
    return { ok: false, error: `Búsqueda de vuelos no disponible: ${err instanceof Error ? err.message : String(err)}` };
  }
}
