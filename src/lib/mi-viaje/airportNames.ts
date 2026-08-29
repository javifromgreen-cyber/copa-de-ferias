/**
 * Display-only IATA -> city lookup for Mi Viaje's flight cards, covering
 * only the airports the mock flight data actually uses. Deliberately its
 * own tiny table rather than importing from the checkout's provider
 * module — this block never touches checkout/provider code, and this is
 * pure display copy, not routing/eligibility logic.
 */
const AIRPORT_CITY: Record<string, string> = {
  MAD: "Madrid",
  BCN: "Barcelona",
  AGP: "Málaga",
  SVQ: "Sevilla",
  OVD: "Asturias",
  MAN: "Manchester",
  LHR: "Londres",
  AMS: "Ámsterdam",
  MXP: "Milán",
  BEG: "Belgrado",
};

export function airportLabel(iata: string): string {
  const city = AIRPORT_CITY[iata];
  return city ? `${city} (${iata})` : iata;
}
