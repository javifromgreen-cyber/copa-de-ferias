// Explicit country-of-purchase source (§4): no existing field in the data
// model captures this reliably before checkout (Traveler.docCountry is the
// issuing country of a document, collected later, in "Datos de cada
// viajero"; Traveler.nationality is self-reported nationality, also
// collected later). Never inferred from IP/browser locale/timezone. This
// is the minimal explicit question needed — asked once, up front, and
// used as the single source of truth for flight-package eligibility.
export type CountryOption = { code: string; name: string };

export const COUNTRIES: CountryOption[] = [
  { code: "ES", name: "España" },
  { code: "FR", name: "Francia" },
  { code: "IT", name: "Italia" },
  { code: "PT", name: "Portugal" },
  { code: "DE", name: "Alemania" },
  { code: "GB", name: "Reino Unido" },
  { code: "MX", name: "México" },
  { code: "AR", name: "Argentina" },
  { code: "CO", name: "Colombia" },
  { code: "CL", name: "Chile" },
  { code: "PE", name: "Perú" },
  { code: "BR", name: "Brasil" },
];

/**
 * Commercial rule (§2/§3): Copa de Ferias only sells the flight-inclusive
 * package to buyers departing from Spain. Every other market (Latin
 * America explicitly, and anywhere else) sees ticket-only / ticket+hotel
 * only — never a blocked/greyed-out flight option, the modality itself is
 * not offered (§5).
 */
export function isFlightPackageEligible(buyerCountry: string | null): boolean {
  return buyerCountry === "ES";
}
