import { duffelRequest } from "./client";
import { normalizeRoundTripSearchResult } from "./normalize";
import type { RoundTripFlightOffer, RoundTripFlightSearchResult, RoundTripFlightSlice } from "./types";

/**
 * Fase 1.5 §2/§3 — the MVP's real-booking search: ONE Duffel Offer Request
 * with TWO slices (outbound + return), so every offer Duffel returns is
 * already a complete, single-Order-reservable round trip (§2/§4). This is
 * additive and parallel to searchOneWayOffers in search.ts — that function
 * and everything built on it (RealFlightProvider, the live checkout UI)
 * stays untouched; this is only used by the future real-booking path.
 */
export type RoundTripSearchParams = {
  originIata: string;
  destinationIata: string;
  /** yyyy-mm-dd */
  outboundDate: string;
  /** yyyy-mm-dd */
  returnDate: string;
  passengers: number;
  fetchImpl?: typeof fetch;
};

export async function searchRoundTripOffers(params: RoundTripSearchParams): Promise<RoundTripFlightSearchResult> {
  const response = await duffelRequest<{ data: unknown }>(
    {
      method: "POST",
      path: "/air/offer_requests",
      query: { return_offers: "true", supplier_timeout: "15000" },
      body: {
        data: {
          slices: [
            { origin: params.originIata, destination: params.destinationIata, departure_date: params.outboundDate },
            { origin: params.destinationIata, destination: params.originIata, departure_date: params.returnDate },
          ],
          passengers: Array.from({ length: params.passengers }, () => ({ type: "adult" })),
          cabin_class: "economy",
          max_connections: 0,
        },
      },
      timeoutMs: 15_000,
    },
    params.fetchImpl,
  );
  return normalizeRoundTripSearchResult(response.data);
}

/** §6 — a round-trip offer is direct only when BOTH slices are direct; either requiring a connection discards the whole offer, never a partial/mixed acceptance. */
export function isDirectRoundTripOffer(offer: RoundTripFlightOffer): boolean {
  return offer.outbound.segments.length === 1 && offer.return.segments.length === 1;
}

export function filterDirectRoundTripOffers(offers: RoundTripFlightOffer[]): RoundTripFlightOffer[] {
  return offers.filter(isDirectRoundTripOffer);
}

/** max_connections: 0 asks Duffel for direct-only on both slices already, but — same discipline as searchDirectOneWayOffers — we never trust a single vendor parameter as the only enforcement of a business rule. */
export async function searchDirectRoundTripOffers(params: RoundTripSearchParams): Promise<RoundTripFlightSearchResult> {
  const result = await searchRoundTripOffers(params);
  return { ...result, offers: filterDirectRoundTripOffers(result.offers) };
}

/**
 * §3 — the UX-facing daypart preference vocabulary (ANY/MORNING/AFTERNOON,
 * matching src/lib/checkout-atu-aire/types.ts's FlightDaypartPreference)
 * redeclared locally rather than imported: the provider layer must not
 * depend on the checkout-domain layer (see NormalizedFlightLeg's own doc
 * comment on layering). Structurally identical on purpose, so wiring this
 * into the real checkout later is a value mapping, not a type change.
 */
export type RoundTripDaypartPreference = "ANY" | "MORNING" | "AFTERNOON";

function classifySliceDaypart(departingAt: Date): "morning" | "midday" | "afternoon" | "night" {
  const h = departingAt.getHours();
  if (h >= 6 && h < 12) return "morning";
  if (h >= 12 && h < 15) return "midday";
  if (h >= 15 && h < 20) return "afternoon";
  return "night";
}

function sliceMatchesDaypart(slice: RoundTripFlightSlice, preference: RoundTripDaypartPreference): boolean {
  if (preference === "ANY") return true;
  return classifySliceDaypart(slice.segments[0].departingAt) === preference.toLowerCase();
}

/**
 * §3 — outbound and return preferences are checked independently against
 * each slice's OWN departure time, exactly like the existing
 * NormalizedFlightLeg-based filters in flightOptions.ts do for the live
 * one-way UI — choosing "ida mañana" never constrains what "vuelta" is
 * allowed to be, and vice versa.
 */
export function offerMatchesDaypartPreferences(offer: RoundTripFlightOffer, outboundPreference: RoundTripDaypartPreference, returnPreference: RoundTripDaypartPreference): boolean {
  return sliceMatchesDaypart(offer.outbound, outboundPreference) && sliceMatchesDaypart(offer.return, returnPreference);
}

export function filterRoundTripOffersByDaypart(offers: RoundTripFlightOffer[], outboundPreference: RoundTripDaypartPreference, returnPreference: RoundTripDaypartPreference): RoundTripFlightOffer[] {
  return offers.filter((o) => offerMatchesDaypartPreferences(o, outboundPreference, returnPreference));
}
