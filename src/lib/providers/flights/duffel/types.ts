/**
 * Duffel's own normalized domain concepts — deliberately separate from
 * NormalizedFlightLeg/FlightProvider (src/lib/providers/types.ts): those
 * model an independently-priced one-way leg for display/selection, with no
 * concept of offerId/expires_at/revalidation. These types carry what a
 * REAL booking flow needs (revalidate-before-pay, eventually an Order) —
 * RealFlightProvider (../realFlightProvider.ts) maps FlightOffer down into
 * NormalizedFlightLeg for the existing checkout-facing interface; nothing
 * outside this directory should ever see raw Duffel JSON.
 */

export type FlightSegment = {
  originIata: string;
  destinationIata: string;
  departingAt: Date;
  arrivingAt: Date;
  marketingCarrier: { iata: string; name: string };
  /** Present only when it differs from the marketing carrier. */
  operatingCarrier: { iata: string; name: string } | null;
  flightNumber: string | null;
};

export type FlightOffer = {
  provider: "duffel";
  /** Duffel's own offer id — the only thing revalidateOffer/createSandboxOrder need. */
  offerId: string;
  totalAmount: number;
  currency: string;
  /** Every segment for this one-way itinerary, in order — length 1 means direct. */
  segments: FlightSegment[];
  expiresAt: Date;
  liveMode: boolean;
  baggage: { checkedIncluded: boolean; carryOnIncluded: boolean } | null;
};

export type FlightSearchResult = {
  offerRequestId: string;
  liveMode: boolean;
  offers: FlightOffer[];
};

export type FlightRevalidationStatus = "unchanged" | "price_changed" | "expired" | "not_found";

export type FlightRevalidation = {
  status: FlightRevalidationStatus;
  offer: FlightOffer | null;
  originalTotalAmount: number;
  /** The most recent expires_at received (never assume a GET renews it — use whatever came back). */
  expiresAt: Date | null;
};

/**
 * Fase 1.5 §2/§4 — the MVP never books ida/vuelta as two independent Duffel
 * Orders (that would risk "outbound CONFIRMED, return FAILED" split
 * bookings). A round trip is modeled as ONE Offer Request with TWO slices
 * (outbound + return) -> ONE selected offer -> ONE offerId -> eventually
 * ONE Order. FlightOffer/FlightSearchResult above stay exactly as they
 * were (single-slice one-way) — they still power the existing
 * NormalizedFlightLeg-based checkout UI (RealFlightProvider) unchanged;
 * these round-trip types are a parallel, additive concept used only by the
 * future real booking path (not wired into the live checkout in this
 * phase).
 */
export type RoundTripFlightSlice = {
  /** Every segment for this direction, in order — length 1 means direct. */
  segments: FlightSegment[];
};

export type RoundTripFlightOffer = {
  provider: "duffel";
  /** Duffel's own offer id for the WHOLE round trip — the only thing a future single Order needs. */
  offerId: string;
  offerRequestId: string;
  /** Total commercial price for both directions together — never outbound + return summed separately (§7). */
  totalAmount: number;
  currency: string;
  outbound: RoundTripFlightSlice;
  return: RoundTripFlightSlice;
  expiresAt: Date;
  liveMode: boolean;
  /**
   * Duffel-assigned passenger placeholder ids from the Offer Request this
   * offer belongs to (§5) — shared by every offer under the same
   * offerRequestId. Required, unmodified, to build the future Order's
   * `passengers` array (matched to real traveler data by the caller at
   * that time). Server-side only; never sent to the client.
   */
  passengerIds: string[];
};

export type RoundTripFlightSearchResult = {
  offerRequestId: string;
  liveMode: boolean;
  offers: RoundTripFlightOffer[];
};

/** §Fase 1.5 point M — the round-trip counterpart of FlightRevalidation: revalidation still works over the SINGLE round-trip offerId, never two independent ones. */
export type RoundTripFlightRevalidation = {
  status: FlightRevalidationStatus;
  offer: RoundTripFlightOffer | null;
  originalTotalAmount: number;
  expiresAt: Date | null;
};

export type FlightOrderPassenger = {
  id: string;
  title: "mr" | "mrs" | "ms";
  gender: "m" | "f";
  givenName: string;
  familyName: string;
  bornOn: string; // yyyy-mm-dd
  email: string;
  phoneNumber: string;
};

export type FlightOrderResult = {
  orderId: string;
  liveMode: boolean;
  bookingReference: string;
  totalAmount: number;
  currency: string;
  segments: FlightSegment[];
};
