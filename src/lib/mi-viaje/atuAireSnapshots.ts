/**
 * Reads the frozen JSON snapshots written once, at booking time, by
 * createAtuAireBooking (see src/server/actions/atu-aire-booking.ts) — never
 * re-derived from current provider/pricing data, so what the customer sees
 * in Mi Viaje always matches exactly what they bought, even if mock offer
 * data changes later. Parsing is defensive only because these are opaque
 * strings coming out of the database, not because the shape is ever
 * expected to be wrong for a real booking.
 */
export type HotelSnapshot = {
  hotelOfferId: string;
  name: string;
  nights: number;
  perPersonPrice: number;
};

export type FlightSnapshot = {
  outboundLegId: string;
  returnLegId: string;
  originAirport: string;
  destinationAirport: string;
  outboundDeparture: string;
  returnDeparture: string;
  outboundPricePerPerson: number;
  returnPricePerPerson: number;
};

export type PriceBreakdownSnapshot = {
  perPerson: number | null;
  total: number | null;
  ticketSelections: Record<string, string>;
};

function safeParse<T>(raw: string): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function parseHotelSnapshot(raw: string): HotelSnapshot | null {
  return safeParse<HotelSnapshot>(raw);
}

export function parseFlightSnapshot(raw: string): FlightSnapshot | null {
  return safeParse<FlightSnapshot>(raw);
}

export function parsePriceBreakdownSnapshot(raw: string): PriceBreakdownSnapshot | null {
  return safeParse<PriceBreakdownSnapshot>(raw);
}
