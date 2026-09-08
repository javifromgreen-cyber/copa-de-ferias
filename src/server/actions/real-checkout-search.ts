"use server";

import type { PackageType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { searchHotels } from "@/lib/providers/hotels/nuitee/search";
import { prebookOffer } from "@/lib/providers/hotels/nuitee/prebook";
import { computeRequiredRoomMix } from "@/lib/pricing/roomMix";
import { computeOrganizationFee, type OrganizationFeeGlobalConfig } from "@/lib/pricing/organizationFee";
import { computeQuote } from "@/lib/pricing/quote";
import { isoCountryCodeForTripCountry } from "@/lib/checkout-atu-aire/tripCountryCode";
import { buildHotelShortlist, HOTEL_SHORTLIST_SIZE } from "@/lib/checkout-atu-aire/hotelAutoSelection";
import { classifyHotelAutoBookability } from "@/lib/checkout-saga/reversibility";
import type { HotelOption, HotelPrebook } from "@/lib/providers/hotels/nuitee/types";
import type { LatLng } from "@/lib/geo/distance";
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
  /** The raw Nuitee net rate — internal only, used at CONTINUAR to detect a material PREBOOK price change (§16). Never shown to the customer directly; see publicPriceTotal/publicPricePerPerson for the displayed price. */
  expectedTotalPrice: number;
  expectedRooms: { roomName: string; occupancyNumber: number }[];
  board: string | null;
  /** Whether every room in the chosen rate is refundable — shown as the card's "useful tarifa info", never provider cost/margin/clientReference/Nuitee internals. */
  refundable: boolean;
  /**
   * The PUBLIC price the customer would pay for the whole trip if they
   * pick this hotel — ticket + this hotel's net cost, run through the
   * exact same computeOrganizationFee/computeQuote pipeline
   * runQuoteRevalidation uses at CONTINUAR (never a second pricing
   * logic). A comparison PREVIEW only: flight cost (if this modality
   * has one) isn't known yet at this step, since the customer picks
   * hotel before flight — the authoritative total is still computed at
   * CONTINUAR. Never provider cost, margin, or org fee shown on their
   * own — only this final total/per-person figure.
   */
  publicPriceTotal: number;
  publicPricePerPerson: number;
  currency: string;
};

export type SearchHotelShortlistResult = { ok: true; hotels: HotelShortlistOption[]; checkIn: string; checkOut: string } | { ok: false; error: string };

/**
 * Progressive SEARCH radius (km), centered on the stadium — starts close
 * and only widens when the closer radius didn't yield enough VALIDATED
 * candidates yet. Never a single fixed cutoff that could turn real
 * inventory into "no hotels": a hotel at 20km or 80km can still end up
 * in the shortlist if that's genuinely the best available inventory for
 * the dates. 80km is a last-resort fallback tier, not a promise to the
 * customer — never a distance we advertise, only the widest ring
 * attempted before genuinely giving up. Stops expanding as soon as
 * HOTEL_SHORTLIST_SIZE valid candidates are found, or the progression
 * (together with MAX_PREBOOK_ATTEMPTS_PER_RESOLUTION below) is exhausted.
 */
const HOTEL_SEARCH_RADIUS_PROGRESSION_KM = [5, 10, 20, 40, 80];

/**
 * Bounds total PREBOOK calls across one shortlist resolution (every
 * radius tier combined) — never PREBOOKs the whole inventory. A generous
 * enough budget to realistically reach 3 validated hotels even with a
 * few invalid candidates along the way, without opening a loop/abuse
 * vector.
 */
const MAX_PREBOOK_ATTEMPTS_PER_RESOLUTION = 8;

/**
 * Fase 3B.2, corrected twice — replaces both the old "show every Nuitee
 * hotel" flow AND the later "pick a star category, we auto-select ONE
 * hotel" flow. The customer no longer picks anything up front: Copa de
 * Ferias searches automatically and shows a SHORTLIST of up to 3
 * concrete, available hotels, ranked by proximity to the stadium (price
 * only breaks a practical tie — see hotelAutoSelection.ts), and the
 * customer picks ONE explicitly.
 *
 * Second correction — every card shown here is now PREBOOK-validated
 * before it's ever shown: SEARCH alone (even with a reliable
 * refundableTag) cannot prove a rate is genuinely bookable, since
 * Nuitee's SEARCH response often omits the cancellation-policy detail
 * PREBOOK actually confirms. resolveValidatedHotelShortlist below walks
 * the distance-ranked candidates in order, PREBOOKs each one (bounded by
 * MAX_PREBOOK_ATTEMPTS_PER_RESOLUTION), and only a candidate that passes
 * the full reversibility/safe-window/autoBookability gate — the exact
 * same one PREBOOK-time gate this codebase has always used — becomes a
 * visible card. An invalid candidate is never retried within the same
 * resolution, even if a wider radius tier's SEARCH response includes it
 * again.
 *
 * PREBOOK here is safe to use freely: it's Nuitee's own revalidation
 * step, never an irreversible reservation — no BOOK, no Stripe, no
 * charge. The customer's actual choice is still independently
 * revalidated once more at CONTINUAR (prepareCheckoutAttempt ->
 * runQuoteRevalidation) immediately before payment — not a "duplicate"
 * PREBOOK, but the domain's own mandatory final revalidation
 * (state can genuinely change in the minutes between browsing the
 * shortlist and paying). If that final PREBOOK finds the choice no
 * longer viable, this function is simply called again to refresh the
 * shortlist — never a silent substitution of a different hotel.
 */
export async function searchHotelShortlist(input: { tripSlug: string; partySize: number; travelOriginCountry: string; ticketOfferId: string; packageType: PackageType; fetchImpl?: typeof fetch }): Promise<SearchHotelShortlistResult> {
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
  const ticketOffer = await prisma.ticketOffer.findUnique({ where: { id: input.ticketOfferId } });
  if (!ticketOffer) {
    return { ok: false, error: "La oferta de entradas seleccionada ya no está disponible." };
  }

  const sortedEvents = [...trip.events].sort((a, b) => a.matchDate.getTime() - b.matchDate.getTime());
  const stadiumEvent = sortedEvents.find((e) => e.primaryEvent) ?? sortedEvents[0];
  if (stadiumEvent.stadiumLatitude === null || stadiumEvent.stadiumLongitude === null) {
    return { ok: false, error: "Este partido todavía no tiene configurada la ubicación del estadio para mostrar hoteles." };
  }
  const stadium: LatLng = { lat: stadiumEvent.stadiumLatitude, lng: stadiumEvent.stadiumLongitude };

  const checkIn = addDays(sortedEvents[0].matchDate, -1);
  const checkOut = addDays(sortedEvents[sortedEvents.length - 1].matchDate, 1);
  const mix = computeRequiredRoomMix(input.partySize);

  let validated: ValidatedHotelCandidate[];
  try {
    validated = await resolveValidatedHotelShortlist({
      stadium,
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

  if (validated.length === 0) {
    return { ok: false, error: "No hay hoteles disponibles para estas fechas." };
  }

  // Same commercial pipeline runQuoteRevalidation uses at CONTINUAR
  // (computeOrganizationFee + computeQuote) — reused here, never a
  // second pricing logic, so each card's public price is directly
  // comparable to what CONTINUAR will actually charge.
  const feeConfig = await prisma.organizationFeeConfig.upsert({ where: { id: "default" }, create: { id: "default" }, update: {} });
  const global: OrganizationFeeGlobalConfig = feeConfig;
  const matchCount = trip.events.length;
  const ticketCostNetTotal = ticketOffer.costNet * input.partySize;
  const orgFee = computeOrganizationFee({
    packageType: input.packageType,
    partySize: input.partySize,
    matchCount,
    global,
    overrides: {
      orgFeeTicketOnlyOverride: trip.orgFeeTicketOnlyOverride,
      orgFeeHotelTiersOverride: trip.orgFeeHotelTiersOverride,
      orgFeeHotelFlightTiersOverride: trip.orgFeeHotelFlightTiersOverride,
      additionalMatchFeeOverride: trip.additionalMatchFeeOverride,
    },
  });

  const hotels: HotelShortlistOption[] = validated.map((v) => {
    // The PREBOOK-revalidated price, never the original SEARCH price —
    // if PREBOOK moved the price, the card reflects the new one, so what
    // the customer sees here is already what CONTINUAR will confirm.
    // Flight cost isn't known yet at this step (hotel is picked before
    // flight) — the preview below is ticket+hotel only; CONTINUAR still
    // computes the real, authoritative total once flight (if any) joins.
    const quote = computeQuote({ costs: { ticketCostNetTotal, hotelCostNetTotal: v.prebook.price.total, flightCostNetTotal: 0, hostCostNetTotal: 0 }, orgFee, buffer: 0, paymentMethodInternalCost: 0 });
    return {
      hotelId: v.hotel.hotelId,
      offerId: v.prebook.offerId,
      name: v.hotel.name,
      stars: v.hotel.stars,
      address: v.hotel.address,
      city: v.hotel.city,
      distanceToStadiumKm: v.distanceToStadiumKm,
      expectedTotalPrice: v.prebook.price.total,
      expectedRooms: v.prebook.rooms.map((r) => ({ roomName: r.roomName, occupancyNumber: r.occupancyNumber })),
      board: v.prebook.rooms[0]?.board ?? null,
      refundable: v.prebook.rooms.every((r) => r.refundable),
      publicPriceTotal: quote.commercialTotal,
      publicPricePerPerson: quote.commercialTotal / input.partySize,
      currency: trip.currency,
    };
  });

  return { ok: true, hotels, checkIn: toIsoDate(checkIn), checkOut: toIsoDate(checkOut) };
}

type ValidatedHotelCandidate = {
  hotel: HotelOption;
  distanceToStadiumKm: number;
  /** The real PREBOOK response for this hotel — price/rooms shown to the customer come from here, never from SEARCH's own (unconfirmed) rate. */
  prebook: HotelPrebook;
};

/**
 * The progressive-radius SEARCH + progressive PREBOOK-validation loop:
 * for each radius tier (widening only if still short of
 * HOTEL_SHORTLIST_SIZE validated candidates), rank the accumulated
 * SEARCH pool by distance (excluding hotels already validated or
 * already found invalid THIS resolution — never retried), and PREBOOK
 * each ranked candidate in order until either 3 are validated or
 * MAX_PREBOOK_ATTEMPTS_PER_RESOLUTION is reached — whichever comes
 * first, across the whole resolution, not per tier. A candidate is
 * "valid" only once its own PREBOOK response passes the same
 * reversibility/safe-window/autoBookability gate used everywhere else
 * in this codebase (classifyHotelAutoBookability) — a thrown PREBOOK
 * error, a hotelId mismatch, or a failed gate all mark that hotel
 * invalid for the rest of this resolution.
 */
async function resolveValidatedHotelShortlist(params: {
  stadium: LatLng;
  checkin: string;
  checkout: string;
  currency: string;
  guestNationality: string;
  mix: ReturnType<typeof computeRequiredRoomMix>;
  fetchImpl?: typeof fetch;
}): Promise<ValidatedHotelCandidate[]> {
  const byHotelId = new Map<string, HotelOption>();
  const invalidHotelIds = new Set<string>();
  const validated: ValidatedHotelCandidate[] = [];
  let attempts = 0;

  for (const radiusKm of HOTEL_SEARCH_RADIUS_PROGRESSION_KM) {
    const searchResult = await searchHotels({
      latitude: params.stadium.lat,
      longitude: params.stadium.lng,
      radiusMeters: radiusKm * 1000,
      checkin: params.checkin,
      checkout: params.checkout,
      currency: params.currency,
      guestNationality: params.guestNationality,
      mix: params.mix,
      fetchImpl: params.fetchImpl,
    });
    for (const hotel of searchResult.hotels) byHotelId.set(hotel.hotelId, hotel);

    const excludeHotelIds = new Set<string>([...invalidHotelIds, ...validated.map((v) => v.hotel.hotelId)]);
    const ranked = buildHotelShortlist({
      hotels: [...byHotelId.values()],
      stadium: params.stadium,
      maxResults: MAX_PREBOOK_ATTEMPTS_PER_RESOLUTION,
      excludeHotelIds,
    });

    for (const candidate of ranked) {
      if (validated.length >= HOTEL_SHORTLIST_SIZE || attempts >= MAX_PREBOOK_ATTEMPTS_PER_RESOLUTION) break;
      attempts++;

      let prebook: HotelPrebook;
      try {
        prebook = await prebookOffer(candidate.rate.offerId, params.fetchImpl);
      } catch {
        invalidHotelIds.add(candidate.hotel.hotelId); // lost availability, or PREBOOK itself failed — never retried this resolution.
        continue;
      }
      if (prebook.hotelId !== candidate.hotel.hotelId || !classifyHotelAutoBookability(prebook.rooms).autoBookable) {
        invalidHotelIds.add(candidate.hotel.hotelId); // NRFN, unsafe window, or otherwise not auto-bookable — never retried this resolution.
        continue;
      }

      validated.push({ hotel: candidate.hotel, distanceToStadiumKm: candidate.distanceToStadiumKm, prebook });
    }

    if (validated.length >= HOTEL_SHORTLIST_SIZE || attempts >= MAX_PREBOOK_ATTEMPTS_PER_RESOLUTION) break;
  }

  return validated;
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
