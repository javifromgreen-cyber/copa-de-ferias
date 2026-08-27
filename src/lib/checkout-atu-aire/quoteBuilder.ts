import { computeRequiredRoomMix } from "@/lib/pricing/roomMix";
import { computeOrganizationFee, type OrganizationFeeGlobalConfig, type OrganizationFeeTripOverrides } from "@/lib/pricing/organizationFee";
import { computeQuote } from "@/lib/pricing/quote";
import { computeStayWindowBounds, areFlightsBlockedByProvisionalSchedule } from "@/lib/pricing/flightWindow";
import { packageRequiresHotel, packageRequiresFlight, PACKAGE_TYPE_COPY } from "./packageRequirements";
import { buildTicketCategoryOptions, cheapestOfferCost } from "./ticketOptions";
import { buildHotelOptions, cheapestValidHotelPerPerson } from "./hotelOptions";
import { buildOutboundPreferenceOptions, buildReturnPreferenceOptions, filterFlightOffersForSelection, toFlightOfferView } from "./flightOptions";
import { derivePriceLabel, missingSelectionLabels } from "./priceLabel";
import type { AtuAireQuote, AtuAireQuoteData, AtuAireSelection, FlightAvailability } from "./types";

const NIGHTS_DEFAULT = 1;

function tripOverrides(trip: AtuAireQuoteData["trip"]): OrganizationFeeTripOverrides {
  return {
    orgFeeTicketOnlyOverride: trip.orgFeeTicketOnlyOverride,
    orgFeeHotelTiersOverride: trip.orgFeeHotelTiersOverride,
    orgFeeHotelFlightTiersOverride: trip.orgFeeHotelFlightTiersOverride,
    additionalMatchFeeOverride: trip.additionalMatchFeeOverride,
  };
}

function primaryEventId(data: AtuAireQuoteData): string | null {
  return data.events.find((e) => e.primaryEvent)?.id ?? data.events[0]?.id ?? null;
}

function otherEventsCheapestSum(data: AtuAireQuoteData): number {
  const primaryId = primaryEventId(data);
  return data.events
    .filter((e) => e.id !== primaryId)
    .reduce((sum, e) => sum + cheapestOfferCost(data.ticketOffersByEventId[e.id] ?? []), 0);
}

/**
 * Pure orchestration — everything the UI needs to render the current
 * checkout step, for any combination of partial selections, derived
 * fresh every time from raw offer data + the user's choices. This is the
 * single source of truth for pricing (§22): the UI never computes a
 * price itself, it only ever reads what this returns.
 */
export function buildAtuAireQuote(data: AtuAireQuoteData, selection: AtuAireSelection): AtuAireQuote {
  const global: OrganizationFeeGlobalConfig = data.feeConfig;
  const overrides = tripOverrides(data.trip);
  const matchCount = data.events.length;

  // --- Package-type "desde" options (always computable) ---------------
  const packageTypeOptions = data.trip.availablePackageTypes.map((packageType) => {
    const ticketCost = cheapestOfferCost(data.ticketOffersByEventId[primaryEventId(data) ?? ""] ?? []) + otherEventsCheapestSum(data);
    let hotelCost = 0;
    if (packageRequiresHotel(packageType)) {
      const mix1 = computeRequiredRoomMix(1);
      const hotelOptions1 = buildHotelOptions(data.hotelOffers, mix1, NIGHTS_DEFAULT, 1);
      hotelCost = cheapestValidHotelPerPerson(hotelOptions1) ?? 0;
    }
    let flightCost = 0;
    if (packageRequiresFlight(packageType) && data.flightOffers.length > 0) {
      flightCost = Math.min(...data.flightOffers.map((o) => o.pricePerPerson));
    }
    const fee = computeOrganizationFee({ packageType, partySize: 1, matchCount, global, overrides });
    return {
      packageType,
      label: PACKAGE_TYPE_COPY[packageType].label,
      description: PACKAGE_TYPE_COPY[packageType].description,
      fromPricePerPerson: ticketCost + hotelCost + flightCost + fee.total,
    };
  });

  const chosenPackageOption = selection.packageType ? packageTypeOptions.find((o) => o.packageType === selection.packageType) ?? null : null;

  // --- Ticket options ---------------------------------------------------
  const primaryId = primaryEventId(data);
  const ticketOptions = selection.packageType ? buildTicketCategoryOptions(data.ticketOffersByEventId[primaryId ?? ""] ?? [], otherEventsCheapestSum(data)) : [];
  const selectedTicket = ticketOptions.find((t) => t.category === selection.ticketCategory) ?? null;
  const cheapestTicket = ticketOptions[0] ?? null; // sorted cheapest-first

  // --- Hotel ------------------------------------------------------------
  const hotelRequired = selection.packageType ? packageRequiresHotel(selection.packageType) : false;
  const roomMix = selection.partySize ? computeRequiredRoomMix(selection.partySize) : null;
  const nights = selection.nights ?? NIGHTS_DEFAULT;
  const hotelOptions = hotelRequired && roomMix && selection.partySize ? buildHotelOptions(data.hotelOffers, roomMix, nights, selection.partySize) : [];
  const selectedHotel = hotelOptions.find((h) => h.offer.id === selection.hotelOfferId && h.valid) ?? null;
  const cheapestValidHotel = hotelOptions.find((h) => h.valid) ?? null;

  // --- Flight -------------------------------------------------------------
  const flightRequired = selection.packageType ? packageRequiresFlight(selection.packageType) : false;
  let flightAvailability: FlightAvailability = { blocked: false };
  let outboundPreferenceOptions: AtuAireQuote["outboundPreferenceOptions"] = [];
  let returnPreferenceOptions: AtuAireQuote["returnPreferenceOptions"] = [];
  let flightOfferViews: AtuAireQuote["flightOffers"] = [];
  let selectedFlight = null as ReturnType<typeof toFlightOfferView> | null;
  let cheapestFilteredFlight: number | null = null;

  if (flightRequired) {
    const blocked = areFlightsBlockedByProvisionalSchedule(
      data.events.map((e) => e.scheduleStatus),
      false,
    );
    if (blocked) {
      flightAvailability = {
        blocked: true,
        reason:
          data.events.length > 1
            ? "Uno de los partidos todavía no tiene horario definitivo. Podrás completar la selección de vuelos en cuanto se confirme."
            : "El horario del partido todavía no está confirmado. Podrás completar la selección de vuelos en cuanto se confirme.",
      };
    } else {
      const bounds = computeStayWindowBounds({
        eventDates: data.events.map((e) => e.matchDate),
        minimumArrivalBufferBeforeKickoffMinutes: data.trip.minimumArrivalBufferBeforeKickoffMinutes,
        minimumReturnBufferAfterEventMinutes: data.trip.minimumReturnBufferAfterEventMinutes,
      });
      outboundPreferenceOptions = buildOutboundPreferenceOptions(data.flightOffers, bounds, selection.returnPreference);
      returnPreferenceOptions = buildReturnPreferenceOptions(data.flightOffers, bounds, selection.outboundPreference);
      const filtered = filterFlightOffersForSelection(data.flightOffers, bounds, selection.outboundPreference, selection.returnPreference);
      flightOfferViews = filtered.map(toFlightOfferView);
      selectedFlight = flightOfferViews.find((f) => f.id === selection.flightOfferId) ?? null;
      cheapestFilteredFlight = flightOfferViews[0]?.pricePerPerson ?? null;
    }
  }

  // --- Price --------------------------------------------------------------
  const partySize = selection.partySize;
  let price: AtuAireQuote["price"] = { label: "from", totalCommercial: null, perPerson: chosenPackageOption?.fromPricePerPerson ?? null, missing: [] };

  if (selection.packageType && partySize) {
    const ticketPerPerson = selectedTicket?.totalCostNetPerPerson ?? cheapestTicket?.totalCostNetPerPerson ?? 0;
    const hotelTotal = hotelRequired ? (selectedHotel?.totalPrice ?? cheapestValidHotel?.totalPrice ?? 0) : 0;
    const flightTotal = flightRequired && !flightAvailability.blocked ? (selectedFlight?.pricePerPerson ?? cheapestFilteredFlight ?? 0) * partySize : 0;

    const fee = computeOrganizationFee({ packageType: selection.packageType, partySize, matchCount, global, overrides });
    const quote = computeQuote({
      costs: { ticketCostNetTotal: ticketPerPerson * partySize, hotelCostNetTotal: hotelTotal, flightCostNetTotal: flightTotal, hostCostNetTotal: 0 },
      orgFee: fee,
      buffer: 0,
      paymentMethodInternalCost: 0,
    });

    const missing = missingSelectionLabels({
      ticketSelected: Boolean(selectedTicket),
      hotelRequired,
      hotelSelected: Boolean(selectedHotel),
      // When blocked, the specific reason below replaces the generic
      // "vuelo" entry rather than stacking alongside it.
      flightRequired: flightRequired && !flightAvailability.blocked,
      flightSelected: Boolean(selectedFlight),
    });
    if (flightRequired && flightAvailability.blocked) missing.push("vuelo (horario del partido pendiente de confirmar)");

    price = {
      label: derivePriceLabel({
        hasPartySize: true,
        ticketSelected: Boolean(selectedTicket),
        hotelRequired,
        hotelSelected: Boolean(selectedHotel),
        flightRequired: flightRequired && !flightAvailability.blocked,
        flightSelected: Boolean(selectedFlight),
        revalidated: data.revalidated,
      }),
      totalCommercial: quote.commercialTotal,
      perPerson: quote.commercialTotal / partySize,
      missing,
    };
  }

  return {
    trip: { id: data.trip.id, slug: data.trip.slug, name: data.trip.name, subtitle: data.trip.subtitle, city: data.trip.city, maxPartySize: data.trip.maxPartySize },
    events: data.events,
    packageTypeOptions,
    partySizeLimits: { min: 1, max: data.trip.maxPartySize },
    ticketOptions,
    roomMix,
    hotelOptions,
    flightAvailability,
    outboundPreferenceOptions,
    returnPreferenceOptions,
    flightOffers: flightOfferViews,
    price,
    additionalMatchFeeApplies: matchCount > 1,
  };
}
