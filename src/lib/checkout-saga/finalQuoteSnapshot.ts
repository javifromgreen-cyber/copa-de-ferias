import type { RoomMixEntry } from "@/lib/pricing/roomMix";
import type { RoomAssignment } from "@/lib/checkout-atu-aire/rooming";

/**
 * What the customer accepted before paying — the single source of truth
 * for what to charge/reserve once REVALIDATING succeeds. Same JSON-string
 * storage convention as Booking's existing *Snapshot columns
 * (hotelSelectionSnapshot/flightSelectionSnapshot/priceBreakdownSnapshot)
 * — generic/normalized fields, never a provider-specific raw shape, and
 * never Duffel/Nuitee's own normalized types directly (this needs to work
 * the same way whether the underlying data came from a mock provider or
 * a real one).
 *
 * Deliberately holds NO traveler PII (§6 of the architecture addenda) —
 * only ticket/hotel/flight/commercial facts and a room-mix count. Buyer
 * and per-traveler data is supplied separately, directly to
 * finalizeConfirmedCheckoutAttempt(), by whatever collected/validated it
 * earlier in the saga — a Fase 2 concern, not stored here.
 */
export type FinalQuoteSnapshotTicketLine = {
  eventId: string;
  ticketOfferId: string;
  category: string;
  quantity: number;
  costNetPerUnit: number;
  currency: string;
};

export type FinalQuoteSnapshotHotel = {
  provider: string;
  hotelId: string;
  name: string;
  offerId: string;
  prebookId: string;
  checkIn: string; // yyyy-mm-dd
  checkOut: string; // yyyy-mm-dd
  roomMix: RoomMixEntry[];
  roomingIntent: RoomAssignment[];
  price: { total: number; currency: string };
  includedTaxesAndFees: { description: string; amount: number; currency: string }[];
  excludedTaxesAndFees: { description: string; amount: number; currency: string }[];
  refundable: boolean;
};

export type FinalQuoteSnapshotFlightLeg = {
  offerId: string;
  originAirport: string;
  destinationAirport: string;
  departure: string; // ISO
  arrival: string; // ISO
  carrier: string;
  pricePerPerson: number;
  currency: string;
  expiresAt: string; // ISO
};

export type FinalQuoteSnapshotFlight = {
  provider: string;
  outbound: FinalQuoteSnapshotFlightLeg;
  return: FinalQuoteSnapshotFlightLeg;
};

export type FinalQuoteSnapshotCommercial = {
  costTicketNet: number;
  costHotelNet: number;
  costFlightNet: number;
  orgFee: number;
  buffer: number;
  pvpTotal: number;
  pvpPerPerson: number;
  currency: string;
};

export type FinalQuoteSnapshot = {
  ticket: FinalQuoteSnapshotTicketLine[];
  hotel: FinalQuoteSnapshotHotel | null;
  flight: FinalQuoteSnapshotFlight | null;
  commercial: FinalQuoteSnapshotCommercial;
  travelersCount: number;
  createdAt: string; // ISO
  expiresAt: string; // ISO — the earliest of its components' own vigencia; see §21 of the addenda
};

export function serializeFinalQuoteSnapshot(snapshot: FinalQuoteSnapshot): string {
  return JSON.stringify(snapshot);
}

export function parseFinalQuoteSnapshot(raw: string): FinalQuoteSnapshot | null {
  if (!raw) return null;
  return JSON.parse(raw) as FinalQuoteSnapshot;
}
