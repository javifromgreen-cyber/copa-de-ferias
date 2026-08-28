"use server";

import { prisma } from "@/lib/db";
import { getHotelProviders } from "@/lib/providers/hotels";
import { getFlightProvider } from "@/lib/providers/flights";
import { parseAvailablePackageTypes } from "@/lib/pricing/packageTypes";
import { packageRequiresHotel, packageRequiresFlight } from "@/lib/checkout-atu-aire/packageRequirements";
import { buildAtuAireQuote } from "@/lib/checkout-atu-aire/quoteBuilder";
import { isFlightPackageEligible } from "@/lib/checkout-atu-aire/countries";
import { airportForCity } from "@/lib/checkout-atu-aire/airports";
import type { AtuAireQuote, AtuAireQuoteData, AtuAireSelection } from "@/lib/checkout-atu-aire/types";
import type { NormalizedHotelOffer, NormalizedFlightOffer, OriginOption } from "@/lib/providers/types";

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

  const availablePackageTypes = parseAvailablePackageTypes(trip.availablePackageTypes);
  const needsHotel = availablePackageTypes.some(packageRequiresHotel);
  const needsFlightPackage = availablePackageTypes.some(packageRequiresFlight);
  const flightPackageEligible = isFlightPackageEligible(selection.buyerCountry);

  const sortedEvents = [...trip.events].sort((a, b) => a.matchDate.getTime() - b.matchDate.getTime());
  const earliestMatch = sortedEvents[0].matchDate;
  const latestMatch = sortedEvents[sortedEvents.length - 1].matchDate;

  let hotelOffers: NormalizedHotelOffer[] = [];
  if (needsHotel) {
    const checkIn = addDays(earliestMatch, -1);
    const checkOut = addDays(latestMatch, 1);
    const perProvider = await Promise.all(getHotelProviders().map((p) => p.getOffers({ tripId: trip.id, city: trip.city, checkIn, checkOut })));
    hotelOffers = perProvider.flat();
  }

  // Flight data is only ever fetched when the product actually offers a
  // flight-inclusive package AND the buyer is eligible for it (§2/§3) —
  // a LATAM buyer's request never even queries the flight provider.
  let eligibleOrigins: OriginOption[] = [];
  let flightOffers: NormalizedFlightOffer[] = [];
  if (needsFlightPackage && flightPackageEligible) {
    const destinationAirport = airportForCity(trip.city);
    const provider = getFlightProvider({ tripIsDemo: trip.isDemo });
    eligibleOrigins = await provider.listDirectOrigins({ destinationAirport });

    if (eligibleOrigins.length > 0) {
      const outboundDate = addDays(earliestMatch, -1);
      const returnDate = addDays(latestMatch, 1);
      const perOrigin = await Promise.all(
        eligibleOrigins.map((origin) => provider.getOffers({ originAirport: origin.iata, destinationAirport, outboundDate, returnDate })),
      );
      flightOffers = perOrigin.flat();
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
      availablePackageTypes,
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
      scheduleStatus: e.scheduleStatus,
      primaryEvent: e.primaryEvent,
    })),
    ticketOffersByEventId,
    hotelOffers,
    eligibleOrigins,
    flightOffers,
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
