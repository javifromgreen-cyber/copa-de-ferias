import type { RoundTripFlightOffer, RoundTripFlightSlice } from "./types";
import { sliceMatchesDaypart, type RoundTripDaypartPreference } from "./roundTripSearch";

/**
 * Fase 1.6 §2-§9 — the selection layer the future real checkout (Fase 2)
 * will build its ida/vuelta picker on top of. It is the layer that
 * guarantees the user can never end up choosing "outbound offer A" +
 * "return offer B" as two independent things: every option shown at every
 * step is derived from — and every final choice resolves back into — the
 * SAME array of RoundTripFlightOffer that came back from ONE
 * searchRoundTripOffers call (see roundTripSearch.ts). Nothing here is
 * wired into the live checkout yet (§11) — RealFlightProvider and the
 * existing one-way NormalizedFlightLeg-based UI keep working unchanged.
 */

/**
 * §5 — a stable identity for one physical flight (a slice), built from the
 * itinerary facts that actually define it: origin, destination, the exact
 * departure/arrival instants, both carriers, and the flight number for
 * every segment, in order. Deliberately NOT schedule-only (e.g. just
 * "departingAt") — two different physical flights can depart at the same
 * minute on different carriers/routes, and Duffel can also return the same
 * physical flight framed at slightly different granularity across offers;
 * anchoring on carrier + flight number + both instants + route is what
 * makes two RoundTripFlightOffers agree this is "the same slice" rather
 * than two merely-similar ones.
 *
 * A round-trip offer's slice is direct-only by construction in this MVP
 * (isDirectRoundTripOffer already discards anything else upstream), so in
 * practice this hashes a single segment — but it walks every segment so it
 * degrades safely rather than silently mis-keying if that assumption ever
 * changes.
 */
export function flightSliceKey(slice: RoundTripFlightSlice): string {
  return slice.segments
    .map((s) =>
      [
        s.originIata,
        s.destinationIata,
        s.departingAt.toISOString(),
        s.arrivingAt.toISOString(),
        s.marketingCarrier.iata,
        (s.operatingCarrier ?? s.marketingCarrier).iata,
        s.flightNumber ?? "",
      ].join("|"),
    )
    .join(">>");
}

export type FlightSliceOption = {
  key: string;
  slice: RoundTripFlightSlice;
};

/**
 * §4/§5 — the PASO IDA options: one entry per DISTINCT physical outbound
 * flight across every offer in the set, regardless of how many different
 * fares/offers contain it. §7: `preference` filters at this same step,
 * directly on the offers' own outbound slices — never a separate search.
 */
export function buildOutboundSliceOptions(offers: RoundTripFlightOffer[], preference: RoundTripDaypartPreference = "ANY"): FlightSliceOption[] {
  const byKey = new Map<string, RoundTripFlightSlice>();
  for (const offer of offers) {
    if (!sliceMatchesDaypart(offer.outbound, preference)) continue;
    const key = flightSliceKey(offer.outbound);
    if (!byKey.has(key)) byKey.set(key, offer.outbound);
  }
  return [...byKey.entries()].map(([key, slice]) => ({ key, slice }));
}

/**
 * §4/§5 — the PASO VUELTA options: one entry per distinct physical return
 * flight, but restricted to offers whose outbound matches the ALREADY
 * chosen outboundKey — this is what makes "select A, then only see returns
 * X/Y" work: Z never appears here if Z only exists paired with outbound B
 * in the source offers, because an offer whose outbound isn't A is
 * excluded before its return is even looked at.
 */
export function buildReturnSliceOptionsForOutbound(offers: RoundTripFlightOffer[], outboundKey: string, preference: RoundTripDaypartPreference = "ANY"): FlightSliceOption[] {
  const byKey = new Map<string, RoundTripFlightSlice>();
  for (const offer of offers) {
    if (flightSliceKey(offer.outbound) !== outboundKey) continue;
    if (!sliceMatchesDaypart(offer.return, preference)) continue;
    const key = flightSliceKey(offer.return);
    if (!byKey.has(key)) byKey.set(key, offer.return);
  }
  return [...byKey.entries()].map(([key, slice]) => ({ key, slice }));
}

export type ResolveRoundTripOfferResult =
  | { ok: true; offer: RoundTripFlightOffer }
  | { ok: false; reason: "not_found" }
  /**
   * §6 — more than one offer matches the exact same outbound+return
   * itinerary but they are NOT known to be commercially equivalent, so
   * this refuses to guess rather than silently picking one. See this
   * function's own doc comment for exactly what "commercially comparable"
   * means today.
   */
  | { ok: false; reason: "not_comparable"; candidates: RoundTripFlightOffer[] };

/**
 * §4/§6/§9 — resolves a chosen (outboundKey, returnKey) pair back to
 * exactly ONE RoundTripFlightOffer — never an outboundOfferId +
 * returnOfferId pair. RoundTripFlightOffer already carries everything a
 * future selection result needs (offerId, offerRequestId, passengerIds,
 * expiresAt, totalAmount, currency, outbound, return — §9), so no separate
 * "SelectedRoundTripFlight" type was introduced; this function's success
 * case simply returns the matched RoundTripFlightOffer as-is.
 *
 * §6/Fase 2 §9, corrected in Fase 2.5 §1/§2/§4 — when several offers
 * share the exact same itinerary (same two physical slices) but differ in
 * price, this is a genuine "which fare/brand do we sell" decision. Two
 * conditions are verified from normalized data before "cheapest wins" is
 * allowed to apply: CURRENCY, and the full `commercialProduct` — BOTH
 * directions' own cabin class, fare brand name and baggage, plus the
 * offer-level refund/change conditions (see FlightCommercialProduct in
 * types.ts, itself built only from fields Duffel's real Offers API
 * actually provides, nothing invented). Fase 2 only compared the
 * OUTBOUND slice's product and silently ignored the return's — corrected
 * here: two offers are only comparable when EVERY field of both slices'
 * products matches too, not just the outbound's. Candidates are only
 * considered comparable when every one of them shares the SAME currency
 * AND the SAME commercialProduct (structural equality); among those, the
 * cheapest wins deterministically (ties broken by offerId so the result
 * never depends on array order). A genuine mismatch on either axis — a
 * currency clash this codebase has no business converting itself, or two
 * offers that are the same flights but different products (e.g. Basic vs
 * Flex, or a mismatched baggage allowance on just the return leg) — is
 * reported as `not_comparable` rather than resolved by an invented rule:
 * automatically picking the cheaper of a non-refundable Basic fare and a
 * refundable Flex fare just because it costs less would silently sell the
 * customer a worse product than what they may have expected.
 */
export function resolveRoundTripOffer(offers: RoundTripFlightOffer[], outboundKey: string, returnKey: string): ResolveRoundTripOfferResult {
  const matches = offers.filter((o) => flightSliceKey(o.outbound) === outboundKey && flightSliceKey(o.return) === returnKey);
  if (matches.length === 0) return { ok: false, reason: "not_found" };

  const currencies = new Set(matches.map((o) => o.currency));
  const commercialProductKeys = new Set(matches.map((o) => JSON.stringify(o.commercialProduct)));
  if (currencies.size > 1 || commercialProductKeys.size > 1) return { ok: false, reason: "not_comparable", candidates: matches };

  const cheapest = [...matches].sort((a, b) => a.totalAmount - b.totalAmount || a.offerId.localeCompare(b.offerId))[0];
  return { ok: true, offer: cheapest };
}

/**
 * §10 — used by the future revalidation flow to confirm a freshly
 * revalidated offer still represents the SAME itinerary the client
 * selected (not just that the offerId still resolves). Duffel changing
 * segments/times/carriers on a revalidated offer is exactly what this
 * catches — see revalidateRoundTripOffer's own tests for a worked
 * example. This phase only prepares the detection; what to DO about a
 * mismatch (re-quote, block payment, etc.) is a Fase 2 policy decision,
 * deliberately not implemented here.
 */
export function revalidatedOfferMatchesSelectedItinerary(offer: RoundTripFlightOffer, outboundKey: string, returnKey: string): boolean {
  return flightSliceKey(offer.outbound) === outboundKey && flightSliceKey(offer.return) === returnKey;
}
