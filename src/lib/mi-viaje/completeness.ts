/**
 * Plain, server-safe module (no "use client") so both the Mi Viaje server
 * page and the client-side traveler form can call this without crossing
 * the client/server boundary — a function exported from a "use client"
 * file cannot be called directly from server code in a production build.
 */
export type TravelerCompletenessCheck = {
  docType: string;
  docNumber: string;
  docExpiry: string | Date | null;
  nationality: string;
};

/**
 * Whether a traveler's document data is filled in — used only for the
 * small per-row "Completo" badge in Mi Viaje. Deliberately does NOT
 * include phone/emergencyContact/address: those are genuinely optional
 * extras, not requirements, so they never make a traveler read as
 * "incomplete". Document fields are normally already filled at checkout
 * for trips that require them; this just reflects that state honestly.
 */
export function isTravelerComplete(t: TravelerCompletenessCheck) {
  return Boolean(t.docType && t.docNumber && t.docExpiry && t.nationality);
}
