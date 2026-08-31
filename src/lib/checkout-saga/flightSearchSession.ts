import type { RoundTripFlightOffer } from "@/lib/providers/flights/duffel/types";

/**
 * Fase 2.6 §2 — the shape a FlightSearchSession row's `offersJson` (and
 * `real-checkout-search.ts`'s browser-facing responses) actually store:
 * everything needed to render the ida/vuelta/fare pickers and to let
 * prepareCheckoutAttempt verify a client-selected offerId genuinely came
 * from a real search, WITHOUT ever including passengerIds — those live
 * once at the session level (FlightSearchSession.passengerIds), never
 * duplicated per offer, never serialized to the browser.
 *
 * Lives here (lib/checkout-saga), not in the server action file, so
 * prepareCheckoutAttempt.ts (also lib/checkout-saga) can depend on it
 * without an inverted server/actions -> lib import; real-checkout-search.ts
 * imports it back out, same direction every other server action already
 * uses for lib types.
 */
export type RealFlightSegmentDTO = { originIata: string; destinationIata: string; departingAt: string; arrivingAt: string; carrierIata: string; carrierName: string; flightNumber: string | null };
export type RealFlightSliceDTO = { segments: RealFlightSegmentDTO[] };
export type RealCommercialProductDTO = {
  outbound: { cabinClass: string | null; fareBrandName: string | null; baggage: { checkedIncluded: boolean; carryOnIncluded: boolean } | null };
  return: { cabinClass: string | null; fareBrandName: string | null; baggage: { checkedIncluded: boolean; carryOnIncluded: boolean } | null };
  refundBeforeDeparture: { allowed: boolean; penaltyAmount: number | null; penaltyCurrency: string | null } | null;
  changeBeforeDeparture: { allowed: boolean; penaltyAmount: number | null; penaltyCurrency: string | null } | null;
};
export type StoredFlightOffer = {
  offerId: string;
  totalAmount: number;
  currency: string;
  expiresAt: string;
  outbound: RealFlightSliceDTO;
  return: RealFlightSliceDTO;
  commercialProduct: RealCommercialProductDTO;
};

export function toStoredFlightOffer(o: RoundTripFlightOffer): StoredFlightOffer {
  return {
    offerId: o.offerId,
    totalAmount: o.totalAmount,
    currency: o.currency,
    expiresAt: o.expiresAt.toISOString(),
    outbound: { segments: o.outbound.segments.map((s) => ({ originIata: s.originIata, destinationIata: s.destinationIata, departingAt: s.departingAt.toISOString(), arrivingAt: s.arrivingAt.toISOString(), carrierIata: s.marketingCarrier.iata, carrierName: s.marketingCarrier.name, flightNumber: s.flightNumber })) },
    return: { segments: o.return.segments.map((s) => ({ originIata: s.originIata, destinationIata: s.destinationIata, departingAt: s.departingAt.toISOString(), arrivingAt: s.arrivingAt.toISOString(), carrierIata: s.marketingCarrier.iata, carrierName: s.marketingCarrier.name, flightNumber: s.flightNumber })) },
    commercialProduct: o.commercialProduct,
  };
}

/**
 * Fase 2.6 §6 — the same six-field slice-key composition as
 * src/lib/providers/flights/duffel/roundTripSelection.ts's own
 * `flightSliceKey` (origin, destination, both instants, marketing
 * carrier, flight number — deliberately no separate operating-carrier
 * field, see that function's own doc comment for why) AND
 * src/components/checkout-real/flightSelectionClient.ts's own `sliceKey`
 * (duplicated there client-side — that file must never import anything
 * that pulls in duffel/client.ts). All three must agree field-for-field:
 * this one is used server-side, at CONTINUAR, to verify the outbound/
 * return slice keys the client claims actually match the stored offer it
 * selected from its own FlightSearchSession row — never trusted as-is.
 */
export function dtoSliceKey(slice: RealFlightSliceDTO): string {
  return slice.segments.map((s) => [s.originIata, s.destinationIata, s.departingAt, s.arrivingAt, s.carrierIata, s.flightNumber ?? ""].join("|")).join(">>");
}
