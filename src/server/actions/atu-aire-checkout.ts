"use server";

import { prisma } from "@/lib/db";
import { getHotelProviders } from "@/lib/providers/hotels";
import { getFlightProvider } from "@/lib/providers/flights";
import { buildAtuAireQuote } from "@/lib/checkout-atu-aire/quoteBuilder";
import { isFlightPackageEligible } from "@/lib/checkout-atu-aire/countries";
import { airportForCity } from "@/lib/checkout-atu-aire/airports";
import type { AtuAireQuote, AtuAireQuoteData, AtuAireSelection } from "@/lib/checkout-atu-aire/types";
import type { NormalizedHotelOffer, NormalizedFlightLeg, OriginOption } from "@/lib/providers/types";

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export async function getAtuAireCheckoutQuote(
  tripSlug: string,
  selection: AtuAireSelection,
  opts: { revalidate?: boolean } = {},
): Promise<{ ok: true; quote: AtuAireQuote } | { ok: false; error: string }> {
  const trip = await prisma.trip.findUnique({
    where: { slug: tripSlug },
    include: {
      events: {
        orderBy: { order: "asc" },
        include: { ticketOffers: { where: { active: true }, orderBy: { costNet: "asc" } } },
      },
    },
  });

  if (!trip || !trip.published || trip.travelMode !== "A_TU_AIRE") {
    return { ok: false, error: "Este producto no está disponible." };
  }
  if (trip.events.length === 0) {
    return { ok: false, error: "Este producto todavía no tiene partidos configurados." };
  }

  const feeConfig = await prisma.organizationFeeConfig.upsert({ where: { id: "default" }, create: { id: "default" }, update: {} });

  // Every A_TU_AIRE product always conceptually supports all three
  // modalities (§1) — hotel and flight data are always fetched; whether
  // TICKET_HOTEL_FLIGHT is actually offered/available comes entirely from
  // buyer eligibility and real route/date feasibility, never from a
  // per-trip configuration flag.
  const flightPackageEligible = isFlightPackageEligible(selection.buyerCountry);

  const sortedEvents = [...trip.events].sort((a, b) => a.matchDate.getTime() - b.matchDate.getTime());
  const earliestMatch = sortedEvents[0].matchDate;
  const latestMatch = sortedEvents[sortedEvents.length - 1].matchDate;

  const checkIn = addDays(earliestMatch, -1);
  const checkOut = addDays(latestMatch, 1);
  const perProvider = await Promise.all(getHotelProviders().map((p) => p.getOffers({ tripId: trip.id, city: trip.city, checkIn, checkOut })));
  const hotelOffers: NormalizedHotelOffer[] = perProvider.flat();

  // Flight data is only ever fetched when the buyer is eligible for the
  // flight-inclusive package (§2/§3) — a LATAM buyer's request never even
  // queries the flight provider. Outbound and return legs are two
  // independent one-way queries per eligible origin (§9/§10) — never a
  // single combined round-trip fetch.
  let eligibleOrigins: OriginOption[] = [];
  let outboundLegs: NormalizedFlightLeg[] = [];
  let returnLegs: NormalizedFlightLeg[] = [];
  if (flightPackageEligible) {
    const destinationAirport = airportForCity(trip.city);
    const provider = getFlightProvider({ tripIsDemo: trip.isDemo });
    const outboundDate = addDays(earliestMatch, -1);
    const returnDate = addDays(latestMatch, 1);
    eligibleOrigins = await provider.listEligibleDirectOriginsForTrip({ destinationAirport, outboundDate, returnDate });

    if (eligibleOrigins.length > 0) {
      const perOriginOutbound = await Promise.all(
        eligibleOrigins.map((origin) => provider.getLegs({ originAirport: origin.iata, destinationAirport, date: outboundDate })),
      );
      outboundLegs = perOriginOutbound.flat();
      const perOriginReturn = await Promise.all(
        eligibleOrigins.map((origin) => provider.getLegs({ originAirport: destinationAirport, destinationAirport: origin.iata, date: returnDate })),
      );
      returnLegs = perOriginReturn.flat();
    }
  }

  const ticketOffersByEventId: AtuAireQuoteData["ticketOffersByEventId"] = {};
  for (const event of trip.events) {
    ticketOffersByEventId[event.id] = event.ticketOffers.map((o) => ({ id: o.id, category: o.category, sector: o.sector, costNet: o.costNet, restrictions: o.restrictions }));
  }

  const data: AtuAireQuoteData = {
    trip: {
      id: trip.id,
      slug: trip.slug,
      name: trip.name,
      subtitle: trip.subtitle,
      city: trip.city,
      maxPartySize: trip.maxPartySize,
      requiredTravelerFields: trip.requiredTravelerFields,
      minimumArrivalBufferBeforeKickoffMinutes: trip.minimumArrivalBufferBeforeKickoffMinutes,
      minimumReturnBufferAfterEventMinutes: trip.minimumReturnBufferAfterEventMinutes,
      orgFeeTicketOnlyOverride: trip.orgFeeTicketOnlyOverride,
      orgFeeHotelTiersOverride: trip.orgFeeHotelTiersOverride,
      orgFeeHotelFlightTiersOverride: trip.orgFeeHotelFlightTiersOverride,
      additionalMatchFeeOverride: trip.additionalMatchFeeOverride,
    },
    events: trip.events.map((e) => ({
      id: e.id,
      homeTeam: e.homeTeam,
      awayTeam: e.awayTeam,
      stadium: e.stadium,
      city: e.city,
      matchDate: e.matchDate,
      kickoff: e.kickoff,
      scheduleStatus: e.scheduleStatus,
      primaryEvent: e.primaryEvent,
    })),
    ticketOffersByEventId,
    hotelOffers,
    eligibleOrigins,
    outboundLegs,
    returnLegs,
    feeConfig: {
      feeTicketOnly: feeConfig.feeTicketOnly,
      feeHotelTiers: feeConfig.feeHotelTiers,
      feeHotelFlightTiers: feeConfig.feeHotelFlightTiers,
      additionalMatchFee: feeConfig.additionalMatchFee,
    },
    revalidated: Boolean(opts.revalidate),
  };

  return { ok: true, quote: buildAtuAireQuote(data, selection) };
}
