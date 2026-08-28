// Minimal city → destination-airport lookup, limited to the cities the
// seeded A_TU_AIRE demo products actually use. The origin airport is
// never fixed/assumed — it comes from FlightProvider.listDirectOrigins()
// and an explicit customer choice (see quoteBuilder.ts / AirportStep.tsx).
const CITY_TO_AIRPORT: Record<string, string> = {
  "Ámsterdam": "AMS",
  Milán: "MXP",
  Londres: "LHR",
  Belgrado: "BEG",
  Manchester: "MAN",
};

export function airportForCity(city: string): string {
  return CITY_TO_AIRPORT[city] ?? city.slice(0, 3).toUpperCase();
}
