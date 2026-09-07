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

/**
 * One physical room within a rate combination, identified by
 * occupancyNumber (1, 2, 3...) — this is the same numbering Copa de
 * Ferias' own occupancies[] request used to ask for it (see
 * occupancies.ts), and later what BOOK expects per-guest. Per-room price
 * and taxesAndFees are kept here too since Nuitee nests them per-room,
 * not only at the combination level.
 */
export type HotelRoom = {
  occupancyNumber: number;
  roomName: string;
  maxOccupancy: number;
  adultCount: number;
  board: string | null;
  price: { total: number; currency: string };
  includedTaxesAndFees: TaxAndFee[];
  excludedTaxesAndFees: TaxAndFee[];
  refundable: boolean;
  /**
   * Fase 3B.2 §4 — the real, provider-stated instant free cancellation
   * ends for THIS room, derived from cancellationPolicies.cancelPolicyInfos
   * (see normalize.ts) — never assumed from `refundable` alone ("RFN ==
   * siempre gratis" is explicitly forbidden). Null whenever the schedule
   * itself doesn't give us that evidence (not just when refundable is
   * false) — e.g. `refundable: true` with an empty/missing
   * cancelPolicyInfos is null here, not a guessed date.
   */
  freeCancellationUntil: string | null;
};

export type HotelRate = {
  /**
   * From roomTypes[].offerId — NOT one per room. Represents the WHOLE
   * multi-room combination for the requested occupancies; this is the
   * single value PREBOOK needs. Never generate one offer per room.
   */
  offerId: string;
  /** Every physical room in this combination, one per occupancyNumber. */
  rooms: HotelRoom[];
  /** The combined total for the whole offer (roomTypes[].offerRetailRate) — not a sum we compute ourselves. */
  price: { total: number; currency: string };
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
  offerId: string;
  hotelId: string;
  /** roomTypes[].rates[] — same per-room shape SEARCH returns, from the SAME nested structure. */
  rooms: HotelRoom[];
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

/**
 * Fase 3B.2 §15, corrected against LiteAPI's verified docs — the resolved
 * outcome of a cancellation, once cancelHotelBooking() has finished its
 * own PUT + (if needed) GET-reconciliation. `status` is Nuitee's own raw
 * string ("CANCELLED" / "CANCELLED_WITH_CHARGES") — deliberately never
 * narrowed to a closed union here; hotelFulfillment.ts still decides what
 * each means for the CheckoutAttempt (only a confirmed CANCELLED with no
 * positive `charges` counts as a clean compensation).
 */
export type HotelCancelResult = { bookingId: string; status: string; charges: number | null; currency: string | null };

/**
 * cancelHotelBooking()'s own return type — "resolved" means the PUT
 * itself, or a GET performed after a 204/empty body or a PUT failure,
 * produced a real, nameable status; "unknown" means neither could
 * determine the real outcome, so the caller must never treat this as
 * compensated (§15's "nunca considerar cancelación compensada... si el
 * resultado económico es ambiguo").
 */
export type HotelCancelOutcome = { outcome: "resolved"; result: HotelCancelResult } | { outcome: "unknown"; reason: string };

/** Our own record of who we assigned to which room — see roomingSnapshot.ts; never reconstructed from HotelBookingResult (§7). */
export type RoomingSnapshotRoom = {
  roomIndex: number;
  travelerIndices: number[];
};
export type RoomingSnapshot = { rooms: RoomingSnapshotRoom[] };
