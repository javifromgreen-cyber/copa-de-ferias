/**
 * Traveler fields a trip can require during checkout (before payment),
 * configured per trip via `Trip.requiredTravelerFields` (comma-separated
 * keys) instead of being hardcoded globally — see checkout §14.
 *
 * `sex` is deliberately not in this list: it's only ever asked inline in
 * the room step, and only for a traveler who needs a same-sex roommate
 * match — never as a blanket required field.
 */
export const TRAVELER_FIELD_LABELS: Record<string, string> = {
  birthDate: "Fecha de nacimiento",
  nationality: "Nacionalidad",
  docType: "Tipo de documento",
  docNumber: "Número de documento",
  docExpiry: "Caducidad del documento",
  docCountry: "País emisor del documento",
};

export const TRAVELER_FIELD_KEYS = Object.keys(TRAVELER_FIELD_LABELS);

export function parseRequiredFields(csv: string): string[] {
  return csv
    .split(",")
    .map((s) => s.trim())
    .filter((s) => TRAVELER_FIELD_KEYS.includes(s));
}
