/**
 * Fase 2.5 §8 — Nuitee's hotel SEARCH needs a real ISO country code
 * (`countryCode`), but Trip.country is a free-text display name (seed
 * values: "Serbia", "Reino Unido", "Portugal", "Países Bajos", "Italia",
 * "Inglaterra" — see prisma/seed.ts). This is the minimal explicit map
 * from those known display names to their ISO 3166-1 alpha-2 code —
 * covering exactly the countries this catalog actually uses today, never
 * guessed for one it doesn't. "Inglaterra" maps to the same GB code as
 * "Reino Unido" (Nuitee has no separate England code) — a display-copy
 * distinction, not a different country for search purposes.
 */
const TRIP_COUNTRY_TO_ISO: Record<string, string> = {
  Serbia: "RS",
  "Reino Unido": "GB",
  Inglaterra: "GB",
  Portugal: "PT",
  "Países Bajos": "NL",
  Italia: "IT",
  España: "ES",
  Francia: "FR",
  Alemania: "DE",
};

/** Returns null (never a guessed code) when the trip's country name isn't in the known map — callers must handle "hotel search unavailable" rather than search with an invented code. */
export function isoCountryCodeForTripCountry(tripCountry: string): string | null {
  return TRIP_COUNTRY_TO_ISO[tripCountry] ?? null;
}
