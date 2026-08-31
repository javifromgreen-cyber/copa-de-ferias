/**
 * Nuitee/LiteAPI's own normalized domain concepts — deliberately NOT the
 * legacy HotelProvider/NormalizedHotelOffer (src/lib/providers/types.ts):
 * those model independent per-room-type (single/double/triple) nightly
 * prices that combine arbitrarily for any party size. Nuitee doesn't sell
 * that — one search returns, per hotel, a rate for the EXACT occupancy
 * combination requested, as a single offerId with a single total price
 * for the whole stay. Forcing that into the legacy shape would mean
 * inventing a per-room-type price split Nuitee never actually returns —
 * so this is a new, honest, standalone set of types instead. Nothing
 * outside this directory should ever see raw Nuitee JSON.
 */

export type TaxAndFee = {
  description: string;
  amount: number;
  currency: string;
  included: boolean;
};

export type HotelRoom = {
  roomType: string;
  maxOccupancy: number;
  adultCount: number;
  board: string | null;
};

export type HotelRate = {
  /** The value PREBOOK needs — represents the WHOLE multi-room combination for the requested occupancies, never one room at a time. */
  offerId: string;
  room: HotelRoom;
  price: { total: number; currency: string };
  includedTaxesAndFees: TaxAndFee[];
  excludedTaxesAndFees: TaxAndFee[];
  refundable: boolean;
  cancellationPolicies: { amount: number; currency: string; type: string }[];
};

export type HotelOption = {
  provider: "nuitee";
  hotelId: string;
  name: string;
  stars: number | null;
  rating: number | null;
  reviewCount: number | null;
  address: string;
  city: string;
  coordinates: { lat: number; lng: number } | null;
  photoUrl: string | null;
  /** Every rate found for this hotel at the requested occupancy — never decomposed per room type. */
  rates: HotelRate[];
};

export type HotelSearchResult = {
  hotels: HotelOption[];
};

export type HotelPrebook = {
  prebookId: string;
  hotelId: string;
  price: { total: number; currency: string };
  priceDifferencePercent: number | null;
  cancellationChanged: boolean;
  boardChanged: boolean;
  paymentTypes: string[];
  checkin: string;
  checkout: string;
};

/**
 * Structured result of comparing a SEARCH rate against its PREBOOK, per
 * §5 — never silently continue when a relevant condition changed; this is
 * what a future checkout would surface to the customer / require explicit
 * acceptance for.
 */
export type PrebookChangeEvaluation = {
  priceChanged: boolean;
  cancellationChanged: boolean;
  boardChanged: boolean;
  requiresAcceptance: boolean;
};

export type HotelBookingGuest = {
  occupancyNumber: number;
  firstName: string;
  lastName: string;
  email: string;
};

export type HotelBookingResult = {
  bookingId: string;
  supplierBookingId: string | null;
  hotelConfirmationCode: string | null;
  status: string;
  paymentStatus: string;
  currency: string;
  totalPrice: number;
  /** Conserved as opaque provider metadata only — never summed into our PVP (§10). */
  processingFee: number | null;
};

/** Our own record of who we assigned to which room — see roomingSnapshot.ts; never reconstructed from HotelBookingResult (§7). */
export type RoomingSnapshotRoom = {
  roomIndex: number;
  travelerIndices: number[];
};
export type RoomingSnapshot = { rooms: RoomingSnapshotRoom[] };
