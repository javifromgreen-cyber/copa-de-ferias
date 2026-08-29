import { computeRequiredRoomMix } from "@/lib/pricing/roomMix";
import { computeOrganizationFee, type OrganizationFeeGlobalConfig, type OrganizationFeeTripOverrides } from "@/lib/pricing/organizationFee";
import { computeQuote } from "@/lib/pricing/quote";
import { computeStayWindowBounds, areFlightsBlockedByProvisionalSchedule, deriveEventKickoffWindow } from "@/lib/pricing/flightWindow";
import { ALL_PACKAGE_TYPES } from "@/lib/pricing/packageTypes";
import { packageRequiresHotel, packageRequiresFlight, PACKAGE_TYPE_COPY } from "./packageRequirements";
import { buildTicketCategoryOptionsForEvent, cheapestOfferCost } from "./ticketOptions";
import { buildHotelOptions, cheapestValidHotelPerPerson } from "./hotelOptions";
import {
  buildOutboundPreferenceOptions,
  buildReturnPreferenceOptions,
  filterOutboundLegsForSelection,
  filterReturnLegsForSelection,
  toFlightLegView,
} from "./flightOptions";
import { derivePriceLabel, missingSelectionLabels } from "./priceLabel";
import { isFlightPackageEligible } from "./countries";
import { parseRequiredFields } from "@/lib/checkout/travelerFields";
import type { AtuAireQuote, AtuAireQuoteData, AtuAireSelection, FlightAvailability, FlightLegView, TicketCategoryOption } from "./types";
import type { NormalizedFlightLeg } from "@/lib/providers/types";

const NIGHTS_DEFAULT = 1;

// Product rule, not a per-trip setting: no A_TU_AIRE booking may exceed 6
// travelers, regardless of what an individual Trip.maxPartySize says. A
// trip's own maxPartySize can still cap it lower than 6, but never raise it.
const MAX_PARTY_SIZE = 6;

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

function cheapestDirectLegPrice(legs: NormalizedFlightLeg[]): number | null {
  const direct = legs.filter((l) => l.stops === 0);
  if (direct.length === 0) return null;
  return Math.min(...direct.map((l) => l.pricePerPerson));
}

// A round-trip "desde" estimate is the cheapest direct outbound leg plus
// the cheapest direct return leg — null (never a fabricated number) when
// either direction genuinely has no direct offer at all (§10).
function cheapestDirectRoundTripPrice(outboundLegs: NormalizedFlightLeg[], returnLegs: NormalizedFlightLeg[]): number | null {
  const outbound = cheapestDirectLegPrice(outboundLegs);
  const ret = cheapestDirectLegPrice(returnLegs);
  if (outbound === null || ret === null) return null;
  return outbound + ret;
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
      const hotelOptions1 = buildHotelOptions(data.hotelOffers, mix1, NIGHTS_DEFAULT, 1);
      hotelCost = cheapestValidHotelPerPerson(hotelOptions1) ?? 0;
    }
    // Cheapest DIRECT outbound + cheapest DIRECT return, across every
    // eligible Spanish origin — never silently assumes any single airport
    // (§13). null when we genuinely can't compute one yet (no eligible
    // route found in either direction) — the card still appears, just
    // without a fabricated price (§10).
    const flightCost = packageRequiresFlight(packageType) ? cheapestDirectRoundTripPrice(data.outboundLegs, data.returnLegs) : 0;
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

  // --- Hotel --------------------------------------------------------------
  // Hotel cards never show a price at all, not even resultant (§5/§6) — so
  // buildHotelOptions no longer needs the other-components baseline that
  // used to feed a resultantTotalPerPerson field.
  const roomMix = partySize ? computeRequiredRoomMix(partySize) : null;
  const nights = selection.nights ?? NIGHTS_DEFAULT;
  const hotelOptions = hotelRequired && roomMix && partySize ? buildHotelOptions(data.hotelOffers, roomMix, nights, partySize) : [];
  const selectedHotel = hotelOptions.find((h) => h.offer.id === selection.hotelOfferId && h.valid) ?? null;
  const cheapestValidHotel = hotelOptions.find((h) => h.valid) ?? null;

  // --- Flight: schedule gate, then route gate, then origin gate, then
  // preferences/legs — outbound and return are computed fully independently
  // of one another from here on (§9/§10/§11): each has its own leg list,
  // its own preference options, and its own selection. -------------------
  let flightAvailability: FlightAvailability = { blocked: false };
  let outboundPreferenceOptions: AtuAireQuote["outboundPreferenceOptions"] = [];
  let returnPreferenceOptions: AtuAireQuote["returnPreferenceOptions"] = [];
  let outboundLegViews: FlightLegView[] = [];
  let returnLegViews: FlightLegView[] = [];
  let selectedOutboundLeg: FlightLegView | null = null;
  let selectedReturnLeg: FlightLegView | null = null;
  let cheapestFilteredOutbound: number | null = null;
  let cheapestFilteredReturn: number | null = null;

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
      // Outbound legs run Spanish origin -> destination; return legs run
      // destination -> Spanish origin, so the selected origin shows up on
      // opposite ends of each direction's legs (§9/§10).
      const outboundForOrigin = data.outboundLegs.filter((l) => l.originAirport === selection.originAirport);
      const returnForOrigin = data.returnLegs.filter((l) => l.destinationAirport === selection.originAirport);

      outboundPreferenceOptions = buildOutboundPreferenceOptions(outboundForOrigin, bounds);
      returnPreferenceOptions = buildReturnPreferenceOptions(returnForOrigin, bounds);

      outboundLegViews = filterOutboundLegsForSelection(outboundForOrigin, bounds, selection.outboundPreference).map(toFlightLegView);
      returnLegViews = filterReturnLegsForSelection(returnForOrigin, bounds, selection.returnPreference).map(toFlightLegView);

      selectedOutboundLeg = outboundLegViews.find((l) => l.id === selection.outboundLegId) ?? null;
      selectedReturnLeg = returnLegViews.find((l) => l.id === selection.returnLegId) ?? null;
      cheapestFilteredOutbound = outboundLegViews[0]?.pricePerPerson ?? null;
      cheapestFilteredReturn = returnLegViews[0]?.pricePerPerson ?? null;
    }
    // Not blocked but no originAirport chosen yet: preference/leg lists
    // stay empty — the UI shows the airport step first (§11).
  }

  const flightBlocked = flightAvailability.blocked;
  const originRequired = flightRequiredByPackage && !flightBlocked;

  // --- Price --------------------------------------------------------------
  let price: AtuAireQuote["price"] = {
    label: "from",
    totalCommercial: null,
    perPerson: chosenPackageOption?.fromPricePerPerson ?? null,
    missing: [],
    breakdown: [],
  };

  if (selection.packageType && partySize && fee) {
    const ticketTotal = ticketPerPersonTotal * partySize;
    const hotelTotal = hotelRequired ? (selectedHotel?.totalPrice ?? cheapestValidHotel?.totalPrice ?? 0) : 0;

    let outboundTotal = 0;
    let returnTotal = 0;
    if (flightRequiredByPackage && !flightBlocked) {
      const perPersonOutbound = selectedOutboundLeg?.pricePerPerson ?? cheapestFilteredOutbound ?? (cheapestDirectLegPrice(data.outboundLegs) ?? 0);
      const perPersonReturn = selectedReturnLeg?.pricePerPerson ?? cheapestFilteredReturn ?? (cheapestDirectLegPrice(data.returnLegs) ?? 0);
      outboundTotal = perPersonOutbound * partySize;
      returnTotal = perPersonReturn * partySize;
    }
    const flightTotal = outboundTotal + returnTotal;

    const quote = computeQuote({
      costs: { ticketCostNetTotal: ticketTotal, hotelCostNetTotal: hotelTotal, flightCostNetTotal: flightTotal, hostCostNetTotal: 0 },
      orgFee: fee,
      buffer: 0,
      paymentMethodInternalCost: 0,
    });

    // Customer-facing breakdown (§ price detail) — each line is a real
    // commercial component already used above to build `quote`, so this
    // always sums exactly to quote.commercialTotal. The fee/buffer stays
    // bundled as one ordinary "gastos de gestión" line, never broken out
    // as "our margin" (computeQuote's own contract — see quote.ts).
    const breakdown: AtuAireQuote["price"]["breakdown"] = [{ label: "Entrada", amount: ticketTotal }];
    if (hotelRequired) breakdown.push({ label: "Hotel", amount: hotelTotal });
    if (flightRequiredByPackage && !flightBlocked) {
      breakdown.push({ label: "Vuelo ida", amount: outboundTotal });
      breakdown.push({ label: "Vuelo vuelta", amount: returnTotal });
    }
    breakdown.push({ label: "Gastos de gestión", amount: quote.orgFee.total + quote.buffer });

    const missing = missingSelectionLabels({
      ticketsSelected: allTicketsSelected,
      hotelRequired,
      hotelSelected: Boolean(selectedHotel),
      flightRequired: flightRequiredByPackage && !flightBlocked,
      originRequired,
      originSelected: Boolean(selection.originAirport),
      outboundFlightSelected: Boolean(selectedOutboundLeg),
      returnFlightSelected: Boolean(selectedReturnLeg),
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
        outboundFlightSelected: Boolean(selectedOutboundLeg),
        returnFlightSelected: Boolean(selectedReturnLeg),
        revalidated: data.revalidated,
      }),
      totalCommercial: quote.commercialTotal,
      perPerson: quote.commercialTotal / partySize,
      missing,
      breakdown,
    };
  }

  return {
    trip: {
      id: data.trip.id,
      slug: data.trip.slug,
      name: data.trip.name,
      subtitle: data.trip.subtitle,
      city: data.trip.city,
      maxPartySize: data.trip.maxPartySize,
      requiredTravelerFields: parseRequiredFields(data.trip.requiredTravelerFields),
    },
    events: data.events,
    flightPackageEligible,
    packageTypeOptions,
    partySizeLimits: { min: 1, max: Math.min(MAX_PARTY_SIZE, data.trip.maxPartySize) },
    ticketOptionsByEvent,
    roomMix,
    hotelOptions,
    eligibleOrigins: data.eligibleOrigins,
    flightAvailability,
    outboundPreferenceOptions,
    returnPreferenceOptions,
    outboundLegs: outboundLegViews,
    returnLegs: returnLegViews,
    price,
    additionalMatchFeeApplies: matchCount > 1,
  };
}
