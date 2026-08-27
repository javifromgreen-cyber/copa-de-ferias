/**
 * Traveler fields a trip can require during checkout (before payment),
 * configured per trip via `Trip.requiredTravelerFields` (comma-separated
 * keys) instead of being hardcoded globally — see checkout §14.
 *
 * `sex` is deliberately not in this list: it's only ever asked inline in
 * the room step, and only for a traveler who needs a same-sex roommate
 * match — never as a blanket required field.
 *
 * `emergencyContact` is one config key but asks for two sub-fields (name
 * + phone) together, kept as a single checkbox in Admin for simplicity —
 * see checkout §3.
 */
export const TRAVELER_FIELD_LABELS: Record<string, string> = {
  birthDate: "Fecha de nacimiento",
  nationality: "Nacionalidad",
  docType: "Tipo de documento",
  docNumber: "Número de documento",
  docExpiry: "Caducidad del documento",
  docCountry: "País emisor del documento",
  phone: "Teléfono del viajero",
  emergencyContact: "Contacto de emergencia",
};

export const TRAVELER_FIELD_KEYS = Object.keys(TRAVELER_FIELD_LABELS);

/** Visual grouping for the "Datos de cada viajero" checkout step — see checkout §6. */
export const TRAVELER_FIELD_GROUPS: Record<string, "personal" | "documentacion" | "contacto"> = {
  birthDate: "personal",
  nationality: "personal",
  docType: "documentacion",
  docNumber: "documentacion",
  docExpiry: "documentacion",
  docCountry: "documentacion",
  phone: "contacto",
  emergencyContact: "contacto",
};

export function parseRequiredFields(csv: string): string[] {
  return csv
    .split(",")
    .map((s) => s.trim())
    .filter((s) => TRAVELER_FIELD_KEYS.includes(s));
}
