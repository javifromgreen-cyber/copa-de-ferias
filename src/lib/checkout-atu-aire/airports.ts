// Minimal city → destination-airport lookup, limited to the cities the
// seeded A_TU_AIRE demo products actually use. No origin-selection UI
// exists yet in this block — every booking departs from the same default
// Spanish origin airport; letting the customer pick their own origin is
// explicitly out of scope here (see the checkout block's own notes).
const CITY_TO_AIRPORT: Record<string, string> = {
  "Ámsterdam": "AMS",
  Milán: "MXP",
  Londres: "LHR",
  Belgrado: "BEG",
};

export const DEFAULT_ORIGIN_AIRPORT = "MAD";

export function airportForCity(city: string): string {
  return CITY_TO_AIRPORT[city] ?? city.slice(0, 3).toUpperCase();
}
