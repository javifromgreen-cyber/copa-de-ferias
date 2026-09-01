import type { OriginOption } from "@/lib/providers/types";

/**
 * Fase 2.6 (closure) §4 — the Spanish airports this checkout is currently
 * willing to search as a flight-package origin. Deliberately a small,
 * explicit domain config, kept separate from the search algorithm itself
 * (searchViableFlightOrigins in real-checkout-search.ts, and the legacy
 * RealFlightProvider.listEligibleDirectOriginsForTrip) so growing this
 * list is a one-line data change, never a change to how viability is
 * decided.
 *
 * THIS IS MVP COVERAGE, NOT THE UNIVERSE OF SPANISH AIRPORTS. Duffel has
 * no "list direct origins" endpoint — every candidate here costs one real
 * round-trip Offer Request, so the list stays intentionally short (the 4
 * largest/most-connected Spanish airports) rather than guessing at every
 * airport in Spain and burning a search on each. The UI only ever shows
 * the subset of this list that turns out to have a real, viable direct
 * round trip for the trip's actual dates — an airport appearing here is
 * a candidate to check, never a promise it will be offered.
 */
export const SUPPORTED_SPANISH_FLIGHT_ORIGINS: OriginOption[] = [
  { iata: "MAD", city: "Madrid", airportName: "Adolfo Suárez Madrid-Barajas" },
  { iata: "BCN", city: "Barcelona", airportName: "Josep Tarradellas Barcelona-El Prat" },
  { iata: "AGP", city: "Málaga", airportName: "Málaga-Costa del Sol" },
  { iata: "SVQ", city: "Sevilla", airportName: "Sevilla" },
];
