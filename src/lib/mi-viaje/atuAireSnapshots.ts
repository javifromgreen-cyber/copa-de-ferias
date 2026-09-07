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
  // Added by the correction microblock — a booking created before this
  // change won't have these, so callers must fall back gracefully (see
  // buildAtuAireView.ts) rather than assume they're always present.
  checkIn?: string;
  checkOut?: string;
  // Fase 3B.2 §21/§22 — richer facts frozen from a real Nuitee SANDBOX
  // BOOK (see finalize.ts), all optional: a legacy/demo/mock booking, or
  // one from before this phase, simply won't have them. Never provider
  // cost/margin/clientReference (§22's own "no exponer" rule) — only what
  // a traveler may see.
  address?: string;
  board?: string | null;
  roomTypes?: string[];
  /** Guest-facing hotel confirmation code — never Nuitee's own internal bookingId. */
  confirmationCode?: string | null;
  refundable?: boolean;
  bookingStatus?: string;
  excludedTaxesAndFees?: { description: string; amount: number; currency: string }[];
};

export type RoomingSnapshotEntry = { type: "single" | "double" | "triple"; travelerIndices: number[] };

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

export function parseRoomingSnapshot(raw: string): RoomingSnapshotEntry[] | null {
  return safeParse<RoomingSnapshotEntry[]>(raw);
}
