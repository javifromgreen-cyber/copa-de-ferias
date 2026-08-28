import type { NormalizedFlightOffer } from "@/lib/providers/types";
import { classifyDaypart, isFlightOfferWithinWindow, type StayWindowBounds } from "@/lib/pricing/flightWindow";
import type { FlightDaypartPreference, FlightPreferenceOption, FlightOfferView } from "./types";

const PREFERENCE_LABELS: Record<FlightDaypartPreference, string> = {
  ANY: "Cualquier horario",
  MORNING: "Mañana",
  AFTERNOON: "Tarde",
};

// The UI only ever offers ANY/MORNING/AFTERNOON (§12) — MIDDAY/NIGHT
// flights still exist as real classifyDaypart outcomes (reused as-is,
// never redefined here) and simply only match the ANY preference.
function matchesPreference(pref: FlightDaypartPreference, departure: Date): boolean {
  if (pref === "ANY") return true;
  return classifyDaypart(departure) === pref.toLowerCase();
}

/**
 * Every stage of the flight step runs through this one filter: direct-only
 * first (A_TU_AIRE never sells a connecting flight — §8, enforced here
 * defensively regardless of what the caller already filtered upstream),
 * then the viability window (buffers around the match/es), then the
 * outbound/return daypart preferences — independently, each leg against
 * its own preference. A preference can narrow the result to zero, but it
 * can never widen it past what the buffers or the direct-only rule allow
 * (§18) — a connecting flight can never become the cheapest option.
 */
export function filterFlightOffersForSelection(
  offers: NormalizedFlightOffer[],
  bounds: StayWindowBounds,
  outboundPreference: FlightDaypartPreference,
  returnPreference: FlightDaypartPreference,
): NormalizedFlightOffer[] {
  return offers
    .filter((o) => o.stops === 0)
    .filter((o) => isFlightOfferWithinWindow(o, bounds))
    .filter((o) => matchesPreference(outboundPreference, o.outboundDeparture))
    .filter((o) => matchesPreference(returnPreference, o.returnDeparture))
    .sort((a, b) => a.pricePerPerson - b.pricePerPerson);
}

function cheapestPrice(offers: NormalizedFlightOffer[]): number | null {
  if (offers.length === 0) return null;
  return Math.min(...offers.map((o) => o.pricePerPerson));
}

/**
 * Builds the outbound preference options — each one's "desde" price comes
 * from actually re-filtering the real offer set with that outbound value
 * held against the *current* return preference, never a stored/hardcoded
 * per-daypart price (§13/§14).
 */
export function buildOutboundPreferenceOptions(
  offers: NormalizedFlightOffer[],
  bounds: StayWindowBounds,
  currentReturnPreference: FlightDaypartPreference,
): FlightPreferenceOption[] {
  return (["ANY", "MORNING", "AFTERNOON"] as const).map((value) => {
    const priceFromPerPerson = cheapestPrice(filterFlightOffersForSelection(offers, bounds, value, currentReturnPreference));
    return { value, label: PREFERENCE_LABELS[value], priceFromPerPerson, available: priceFromPerPerson !== null };
  });
}

export function buildReturnPreferenceOptions(
  offers: NormalizedFlightOffer[],
  bounds: StayWindowBounds,
  currentOutboundPreference: FlightDaypartPreference,
): FlightPreferenceOption[] {
  return (["ANY", "MORNING", "AFTERNOON"] as const).map((value) => {
    const priceFromPerPerson = cheapestPrice(filterFlightOffersForSelection(offers, bounds, currentOutboundPreference, value));
    return { value, label: PREFERENCE_LABELS[value], priceFromPerPerson, available: priceFromPerPerson !== null };
  });
}

// resultantTotalPerPerson depends on ticket/hotel/fee context this pure
// mapping doesn't have — the caller (quoteBuilder) adds it.
export function toFlightOfferView(offer: NormalizedFlightOffer): Omit<FlightOfferView, "resultantTotalPerPerson"> {
  return {
    id: offer.id,
    provider: offer.provider,
    originAirport: offer.originAirport,
    destinationAirport: offer.destinationAirport,
    outboundDeparture: offer.outboundDeparture,
    outboundArrival: offer.outboundArrival,
    returnDeparture: offer.returnDeparture,
    returnArrival: offer.returnArrival,
    pricePerPerson: offer.pricePerPerson,
  };
}
