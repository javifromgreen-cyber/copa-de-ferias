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
