import { duffelRequest } from "./client";
import { normalizeSearchResult } from "./normalize";
import type { FlightOffer, FlightSearchResult } from "./types";

export type OneWaySearchParams = {
  originIata: string;
  destinationIata: string;
  /** yyyy-mm-dd */
  date: string;
  passengers: number;
  fetchImpl?: typeof fetch;
};

/**
 * A single one-way (single-slice) Duffel Offer Request — matches how the
 * rest of the app already treats outbound/return as two independent
 * queries (see NormalizedFlightLeg's own doc comment). max_connections: 0
 * asks Duffel for direct-only, but we ALSO filter client-side in
 * searchDirectOneWayOffers — never trust a single vendor parameter as the
 * only enforcement of a business rule.
 */
export async function searchOneWayOffers(params: OneWaySearchParams): Promise<FlightSearchResult> {
  const response = await duffelRequest<{ data: unknown }>(
    {
      method: "POST",
      path: "/air/offer_requests",
      query: { return_offers: "true", supplier_timeout: "15000" },
      body: {
        data: {
          slices: [{ origin: params.originIata, destination: params.destinationIata, departure_date: params.date }],
          passengers: Array.from({ length: params.passengers }, () => ({ type: "adult" })),
          cabin_class: "economy",
          max_connections: 0,
        },
      },
      timeoutMs: 15_000,
    },
    params.fetchImpl,
  );
  return normalizeSearchResult(response.data);
}

/** Direct-only (single segment), our own enforcement independent of the max_connections request parameter. */
export function filterDirectOffers(offers: FlightOffer[]): FlightOffer[] {
  return offers.filter((o) => o.segments.length === 1);
}

export async function searchDirectOneWayOffers(params: OneWaySearchParams): Promise<FlightSearchResult> {
  const result = await searchOneWayOffers(params);
  return { ...result, offers: filterDirectOffers(result.offers) };
}
