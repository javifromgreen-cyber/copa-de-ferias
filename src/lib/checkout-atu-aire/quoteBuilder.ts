import { computeRequiredRoomMix } from "@/lib/pricing/roomMix";
import { computeOrganizationFee, type OrganizationFeeGlobalConfig, type OrganizationFeeTripOverrides } from "@/lib/pricing/organizationFee";
import { computeQuote } from "@/lib/pricing/quote";
import { computeStayWindowBounds, areFlightsBlockedByProvisionalSchedule, deriveEventKickoffWindow } from "@/lib/pricing/flightWindow";
import { ALL_PACKAGE_TYPES } from "@/lib/pricing/packageTypes";
import { packageRequiresHotel, packageRequiresFlight, PACKAGE_TYPE_COPY } from "./packageRequirements";
import { buildTicketCategoryOptionsForEvent, cheapestOfferCost } from "./ticketOptions";
import { buildHotelOptions, cheapestValidHotelPerPerson } from "./hotelOptions";
import { buildOutboundPreferenceOptions, buildReturnPreferenceOptions, filterFlightOffersForSelection, toFlightOfferView } from "./flightOptions";
import { derivePriceLabel, missingSelectionLabels } from "./priceLabel";
import { isFlightPackageEligible } from "./countries";
import type { AtuAireQuote, AtuAireQuoteData, AtuAireSelection, FlightAvailability, TicketCategoryOption } from "./types";
import type { NormalizedFlightOffer } from "@/lib/providers/types";

const NIGHTS_DEFAULT = 1;

const NO_DIRECT_ROUTE_MESSAGE =
  "Ahora mismo no hemos encontrado vuelos directos compatibles con este viaje desde los aeropuertos disponibles. Puedes probar otro aeropuerto más adelante o continuar con Entrada + Hotel.";

function tripOverrides(trip: AtuAireQuoteData["trip"]): OrganizationFeeTripOverrides {
  return {
    orgFeeTicketOnlyOverride: trip.orgFeeTicketOnlyOverride,
    orgFeeHotelTiersOverride: trip.orgFeeHotelTiersOverride,
    orgFeeHotelFlightTiersOverride: trip.orgFeeHotelFlightTiersOverride,
    additionalMatchFeeOverride: trip.additionalMatchFeeOverride,
  };
}

function buildTicketOptionsByEvent(data: AtuAireQuoteData): Record<string, TicketCategoryOption[]> {
  const result: Record<string, TicketCategoryOption[]> = {};
  for (const event of data.events) {
    result[event.id] = buildTicketCategoryOptionsForEvent(data.ticketOffersByEventId[event.id] ?? []);
  }
  return result;
}

function cheapestTicketTotalAcrossEvents(data: AtuAireQuoteData): number {
  return data.events.reduce((sum, e) => sum + cheapestOfferCost(data.ticketOffersByEventId[e.id] ?? []), 0);
}

function cheapestDirectFlightPrice(offers: NormalizedFlightOffer[]): number | null {
  const direct = offers.filter((o) => o.stops === 0);
  if (direct.length === 0) return null;
  return Math.min(...direct.map((o) => o.pricePerPerson));
}

/**
 * Sums the selected (or, for pricing purposes, cheapest-as-placeholder)
 * ticket cost across every Event, and reports whether every Event
 * genuinely has a real selection — an Event with exactly one offer
 * counts as selected even without an explicit click (§19: it's shown,
 * never hidden, but doesn't block progress).
 */
function ticketsAcrossEvents(
  data: AtuAireQuoteData,
  selection: AtuAireSelection,
  optionsByEvent: Record<string, TicketCategoryOption[]>,
): { total: number; allSelected: boolean } {
  let total = 0;
  let allSelected = true;
  for (const event of data.events) {
    const options = optionsByEvent[event.id] ?? [];
    const selectedCategory = selection.ticketSelections[event.id];
    const selectedOption = options.find((o) => o.category === selectedCategory);
    if (selectedOption) {
      total += selectedOption.totalCostNetPerPerson;
    } else {
      if (options.length !== 1) allSelected = false;
      total += options[0]?.totalCostNetPerPerson ?? 0;
    }
  }
  return { total, allSelected };
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

  const flightPackageEligible = isFlightPackageEligible(selection.buyerCountry);

  // --- Ticket options, per Event (§17/§18) -------------------------------
  const ticketOptionsByEvent = buildTicketOptionsByEvent(data);
  const ticketPerPersonTotal_Cheapest = cheapestTicketTotalAcrossEvents(data);

  // --- Package-type "desde" options ---------------------------------------
  // Every A_TU_AIRE product conceptually supports all three modalities
  // (§1) — the buyer's own market eligibility is the only thing that ever
  // removes TICKET_HOTEL_FLIGHT from this list (§4/§5); a lack of current
  // flight inventory never does; that's surfaced later as an "unavailable"
  // price state instead (§3/§10/§14).
  const packageTypeOptions = ALL_PACKAGE_TYPES.filter((packageType) => !packageRequiresFlight(packageType) || flightPackageEligible).map((packageType) => {
    const ticketCost = ticketPerPersonTotal_Cheapest;
    let hotelCost = 0;
    if (packageRequiresHotel(packageType)) {
      const mix1 = computeRequiredRoomMix(1);
      const hotelOptions1 = buildHotelOptions(data.hotelOffers, mix1, NIGHTS_DEFAULT, 1, 0);
      hotelCost = cheapestValidHotelPerPerson(hotelOptions1) ?? 0;
    }
    // Cheapest DIRECT offer across every eligible Spanish origin — never
    // silently assumes any single airport (§13). null when we genuinely
    // can't compute one yet (no eligible route found at all) — the card
    // still appears, just without a fabricated price (§10).
    const flightCost = packageRequiresFlight(packageType) ? cheapestDirectFlightPrice(data.flightOffers) : 0;
    const fee = computeOrganizationFee({ packageType, partySize: 1, matchCount, global, overrides });
    return {
      packageType,
      label: PACKAGE_TYPE_COPY[packageType].label,
      description: PACKAGE_TYPE_COPY[packageType].description,
      fromPricePerPerson: flightCost === null ? null : ticketCost + hotelCost + flightCost + fee.total,
    };
  });

  const chosenPackageOption = selection.packageType ? (packageTypeOptions.find((o) => o.packageType === selection.packageType) ?? null) : null;

  const hotelRequired = selection.packageType ? packageRequiresHotel(selection.packageType) : false;
  const flightRequiredByPackage = selection.packageType ? packageRequiresFlight(selection.packageType) : false;
  const partySize = selection.partySize;

  // --- Shared components (ticket total + org fee), computed once and
  // reused by the hotel "resultant price" cards, the flight offers'
  // resultant price, and the final price block below (§11/§12/§14). ---
  const { total: ticketPerPersonTotal, allSelected: allTicketsSelected } = ticketsAcrossEvents(data, selection, ticketOptionsByEvent);
  const fee = selection.packageType && partySize ? computeOrganizationFee({ packageType: selection.packageType, partySize, matchCount, global, overrides }) : null;
  const feePerPerson = fee && partySize ? fee.total / partySize : 0;
  const flightEstimatePerPerson = flightRequiredByPackage ? (cheapestDirectFlightPrice(data.flightOffers) ?? 0) : 0;

  // --- Hotel ------------------------------------------------------------
  const roomMix = partySize ? computeRequiredRoomMix(partySize) : null;
  const nights = selection.nights ?? NIGHTS_DEFAULT;
  const otherComponentsForHotel = ticketPerPersonTotal + flightEstimatePerPerson + feePerPerson;
  const hotelOptions = hotelRequired && roomMix && partySize ? buildHotelOptions(data.hotelOffers, roomMix, nights, partySize, otherComponentsForHotel) : [];
  const selectedHotel = hotelOptions.find((h) => h.offer.id === selection.hotelOfferId && h.valid) ?? null;
  const cheapestValidHotel = hotelOptions.find((h) => h.valid) ?? null;
  const hotelComponentPerPerson = selectedHotel?.perPersonPrice ?? cheapestValidHotel?.perPersonPrice ?? 0;

  // --- Flight: schedule gate, then route gate, then origin gate, then
  // preferences/offers ----------------------------------------------------
  let flightAvailability: FlightAvailability = { blocked: false };
  let outboundPreferenceOptions: AtuAireQuote["outboundPreferenceOptions"] = [];
  let returnPreferenceOptions: AtuAireQuote["returnPreferenceOptions"] = [];
  let flightOfferViews: AtuAireQuote["flightOffers"] = [];
  let selectedFlight = null as ReturnType<typeof toFlightOfferView> | null;
  let cheapestFilteredFlight: number | null = null;

  if (flightRequiredByPackage) {
    // A genuinely uncertain match DAY is the only thing that hard-blocks
    // (§15/§19) — an uncertain kickoff hour on a known day is handled by
    // deriveEventKickoffWindow's conservative range instead, below.
    const dateBlocked = areFlightsBlockedByProvisionalSchedule(
      data.events.map((e) => e.scheduleStatus),
      false,
    );
    if (dateBlocked) {
      flightAvailability = {
        blocked: true,
        reason:
          data.events.length > 1
            ? "La fecha de uno de los partidos todavía no está confirmada, así que no podemos garantizar un vuelo seguro. Podrás completar la selección de vuelos en cuanto se confirme la fecha."
            : "La fecha de este partido todavía no está confirmada, así que no podemos garantizar un vuelo seguro. Podrás completar la selección de vuelos en cuanto se confirme la fecha.",
      };
    } else if (data.eligibleOrigins.length === 0) {
      // The route itself doesn't exist yet for this destination — never
      // fake availability, and never remove the modality (§3/§10/§14).
      flightAvailability = { blocked: true, reason: NO_DIRECT_ROUTE_MESSAGE };
    } else if (selection.originAirport) {
      const eventWindows = data.events.map((e) => deriveEventKickoffWindow(e)).filter((w): w is NonNullable<typeof w> => w !== null);
      const bounds = computeStayWindowBounds({
        eventWindows,
        minimumArrivalBufferBeforeKickoffMinutes: data.trip.minimumArrivalBufferBeforeKickoffMinutes,
        minimumReturnBufferAfterEventMinutes: data.trip.minimumReturnBufferAfterEventMinutes,
      });
      const offersForOrigin = data.flightOffers.filter((o) => o.originAirport === selection.originAirport);
      outboundPreferenceOptions = buildOutboundPreferenceOptions(offersForOrigin, bounds, selection.returnPreference);
      returnPreferenceOptions = buildReturnPreferenceOptions(offersForOrigin, bounds, selection.outboundPreference);
      const filtered = filterFlightOffersForSelection(offersForOrigin, bounds, selection.outboundPreference, selection.returnPreference);
      const resultantBase = ticketPerPersonTotal + hotelComponentPerPerson + feePerPerson;
      flightOfferViews = filtered.map((o) => ({ ...toFlightOfferView(o), resultantTotalPerPerson: resultantBase + o.pricePerPerson }));
      selectedFlight = flightOfferViews.find((f) => f.id === selection.flightOfferId) ?? null;
      cheapestFilteredFlight = flightOfferViews[0]?.pricePerPerson ?? null;
    }
    // Not blocked but no originAirport chosen yet: preference/offer lists
    // stay empty — the UI shows the airport step first (§11).
  }

  const flightBlocked = flightAvailability.blocked;
  const originRequired = flightRequiredByPackage && !flightBlocked;

  // --- Price --------------------------------------------------------------
  let price: AtuAireQuote["price"] = { label: "from", totalCommercial: null, perPerson: chosenPackageOption?.fromPricePerPerson ?? null, missing: [] };

  if (selection.packageType && partySize && fee) {
    const hotelTotal = hotelRequired ? (selectedHotel?.totalPrice ?? cheapestValidHotel?.totalPrice ?? 0) : 0;

    let flightTotal = 0;
    if (flightRequiredByPackage && !flightBlocked) {
      const perPersonFlightPrice = selectedFlight?.pricePerPerson ?? cheapestFilteredFlight ?? flightEstimatePerPerson;
      flightTotal = perPersonFlightPrice * partySize;
    }

    const quote = computeQuote({
      costs: { ticketCostNetTotal: ticketPerPersonTotal * partySize, hotelCostNetTotal: hotelTotal, flightCostNetTotal: flightTotal, hostCostNetTotal: 0 },
      orgFee: fee,
      buffer: 0,
      paymentMethodInternalCost: 0,
    });

    const missing = missingSelectionLabels({
      ticketsSelected: allTicketsSelected,
      hotelRequired,
      hotelSelected: Boolean(selectedHotel),
      flightRequired: flightRequiredByPackage && !flightBlocked,
      originRequired,
      originSelected: Boolean(selection.originAirport),
      flightSelected: Boolean(selectedFlight),
    });
    if (flightRequiredByPackage && flightBlocked) missing.push("vuelo (" + (data.eligibleOrigins.length === 0 ? "sin ruta directa disponible todavía" : "fecha del partido pendiente de confirmar") + ")");

    price = {
      label: derivePriceLabel({
        hasPartySize: true,
        ticketsSelected: allTicketsSelected,
        hotelRequired,
        hotelSelected: Boolean(selectedHotel),
        flightRequired: flightRequiredByPackage && !flightBlocked,
        originRequired,
        originSelected: Boolean(selection.originAirport),
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
    flightPackageEligible,
    packageTypeOptions,
    partySizeLimits: { min: 1, max: data.trip.maxPartySize },
    ticketOptionsByEvent,
    roomMix,
    hotelOptions,
    eligibleOrigins: data.eligibleOrigins,
    flightAvailability,
    outboundPreferenceOptions,
    returnPreferenceOptions,
    flightOffers: flightOfferViews,
    price,
    additionalMatchFeeApplies: matchCount > 1,
  };
}
