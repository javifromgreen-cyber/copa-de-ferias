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
  phone: string;
  emergencyContact: string;
  address: string;
};

export function isTravelerComplete(t: TravelerCompletenessCheck) {
  return Boolean(t.docType && t.docNumber && t.docExpiry && t.nationality && t.phone && t.emergencyContact && t.address);
}
