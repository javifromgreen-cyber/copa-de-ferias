import type { NormalizedFlightLeg } from "@/lib/providers/types";
import { classifyDaypart, isOutboundLegWithinWindow, isReturnLegWithinWindow, type StayWindowBounds } from "@/lib/pricing/flightWindow";
import type { FlightDaypartPreference, FlightPreferenceOption, FlightLegView } from "./types";

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
 * Direct-only, then the viability window, then this direction's own
 * daypart preference — outbound and return are filtered completely
 * independently of one another (§10/§11): neither list, nor the
 * preference options built from it below, ever depends on the OTHER
 * direction's leg list or preference. Changing one can never narrow or
 * confuse the other.
 */
export function filterOutboundLegsForSelection(legs: NormalizedFlightLeg[], bounds: StayWindowBounds, preference: FlightDaypartPreference): NormalizedFlightLeg[] {
  return legs
    .filter((l) => l.stops === 0)
    .filter((l) => isOutboundLegWithinWindow(l, bounds))
    .filter((l) => matchesPreference(preference, l.departure))
    .sort((a, b) => a.pricePerPerson - b.pricePerPerson);
}

export function filterReturnLegsForSelection(legs: NormalizedFlightLeg[], bounds: StayWindowBounds, preference: FlightDaypartPreference): NormalizedFlightLeg[] {
  return legs
    .filter((l) => l.stops === 0)
    .filter((l) => isReturnLegWithinWindow(l, bounds))
    .filter((l) => matchesPreference(preference, l.departure))
    .sort((a, b) => a.pricePerPerson - b.pricePerPerson);
}

function cheapestPrice(legs: NormalizedFlightLeg[]): number | null {
  if (legs.length === 0) return null;
  return Math.min(...legs.map((l) => l.pricePerPerson));
}

/**
 * Preference options for one direction, built purely from that
 * direction's own direct+window-filtered leg list — never re-filters
 * using the other direction's preference (§11, replaces the old
 * cross-coupled outbound/return builders).
 */
function buildPreferenceOptions(directWindowedLegs: NormalizedFlightLeg[]): FlightPreferenceOption[] {
  return (["ANY", "MORNING", "AFTERNOON"] as const).map((value) => {
    const priceFromPerPerson = cheapestPrice(directWindowedLegs.filter((l) => matchesPreference(value, l.departure)));
    return { value, label: PREFERENCE_LABELS[value], priceFromPerPerson, available: priceFromPerPerson !== null };
  });
}

export function buildOutboundPreferenceOptions(legs: NormalizedFlightLeg[], bounds: StayWindowBounds): FlightPreferenceOption[] {
  return buildPreferenceOptions(legs.filter((l) => l.stops === 0).filter((l) => isOutboundLegWithinWindow(l, bounds)));
}

export function buildReturnPreferenceOptions(legs: NormalizedFlightLeg[], bounds: StayWindowBounds): FlightPreferenceOption[] {
  return buildPreferenceOptions(legs.filter((l) => l.stops === 0).filter((l) => isReturnLegWithinWindow(l, bounds)));
}

// Pure field mapping — a leg view only ever carries its own price (§9),
// there is no "resultant" variant of this for flights.
export function toFlightLegView(leg: NormalizedFlightLeg): FlightLegView {
  return {
    id: leg.id,
    provider: leg.provider,
    originAirport: leg.originAirport,
    destinationAirport: leg.destinationAirport,
    departure: leg.departure,
    arrival: leg.arrival,
    pricePerPerson: leg.pricePerPerson,
  };
}
