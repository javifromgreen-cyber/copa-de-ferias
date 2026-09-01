/**
 * Fase 2.6 (closure) §6 — the ONE pure identity function for "is this the
 * same physical flight slice", used identically server-side (see
 * roundTripSelection.ts's flightSliceKey) and client-side (see
 * src/components/checkout-real/flightSelectionClient.ts's sliceKey). No
 * Duffel HTTP client, no server-only env, no secrets — safe to import
 * from a Client Component. Previously this logic was duplicated with two
 * DIFFERENT field compositions (server included a duplicated operating-
 * carrier fallback field the client's DTO never carried), which made the
 * server-side security check introduced in Fase 2.6 reject genuine
 * client selections. Fixing that by DROPPING operating carrier from the
 * identity was the wrong direction — it made two genuinely different
 * physical flights (same marketing code, different operator — a real
 * codeshare case) collapse into the same key. The real fix is this: one
 * shared function, one shape, both sides carry operating carrier when
 * Duffel provides it.
 */
export type FlightSliceIdentitySegment = {
  originIata: string;
  destinationIata: string;
  /** ISO 8601 instant. */
  departingAt: string;
  /** ISO 8601 instant. */
  arrivingAt: string;
  marketingCarrierIata: string;
  /** null when Duffel doesn't report a distinct operating carrier (the common case — operated by the same airline that markets it). */
  operatingCarrierIata: string | null;
  flightNumber: string | null;
};

/**
 * A stable identity for one physical flight (a slice = one or more
 * segments, in order): route, exact departure/arrival instants, marketing
 * carrier, operating carrier (when Duffel reports one distinct from the
 * marketing carrier), and flight number. Two segments that agree on
 * every one of these fields are the same physical flight; a codeshare
 * where only the operating carrier differs is deliberately treated as a
 * DIFFERENT slice — see the codeshare test in
 * tests/unit/flight-slice-identity.test.ts.
 */
export function flightSliceIdentityKey(segments: FlightSliceIdentitySegment[]): string {
  return segments
    .map((s) => [s.originIata, s.destinationIata, s.departingAt, s.arrivingAt, s.marketingCarrierIata, s.operatingCarrierIata ?? "", s.flightNumber ?? ""].join("|"))
    .join(">>");
}
