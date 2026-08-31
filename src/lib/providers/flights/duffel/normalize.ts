import { ProviderError } from "@/lib/providers/errors";
import type { FlightCommercialProduct, FlightOffer, FlightSearchResult, FlightSegment, FlightSliceCommercialProduct, RoundTripFlightOffer, RoundTripFlightSearchResult } from "./types";

// Minimal shape of what we read from Duffel's raw JSON — deliberately not
// a full API type; anything we don't need is never modeled, and this file
// is the only place that ever sees these field names.
type RawCarrier = { iata_code: string | null; name: string } | null;
export type RawSegment = {
  origin: { iata_code: string };
  destination: { iata_code: string };
  departing_at: string;
  arriving_at: string;
  marketing_carrier: RawCarrier;
  operating_carrier: RawCarrier;
  marketing_carrier_flight_number: string | null;
  passengers?: { cabin_class?: string | null; baggages?: { type: string; quantity: number }[] }[];
};
// Fase 2 §9 — fare_brand_name lives per-slice; conditions.*_before_departure
// live at the offer level. Both come straight from Duffel's real Offers API
// shape — nothing invented, nothing assumed present (all optional/nullable).
type RawSlice = { segments: RawSegment[]; fare_brand_name?: string | null };
type RawPenalty = { allowed: boolean; penalty_amount?: string | null; penalty_currency?: string | null } | null;
type RawConditions = { refund_before_departure?: RawPenalty; change_before_departure?: RawPenalty } | null;
type RawOffer = {
  id: string;
  total_amount: string;
  total_currency: string;
  expires_at: string;
  slices: RawSlice[];
  conditions?: RawConditions;
};
type RawPassenger = { id: string };
type RawOfferRequest = { id: string; live_mode: boolean; offers: RawOffer[]; passengers?: RawPassenger[] };

export function normalizeSegment(raw: RawSegment): FlightSegment {
  if (!raw?.origin?.iata_code || !raw?.destination?.iata_code || !raw?.departing_at || !raw?.arriving_at || !raw?.marketing_carrier) {
    throw new ProviderError("INVALID_PROVIDER_RESPONSE", "duffel", "Duffel segment is missing required fields.");
  }
  const marketing = { iata: raw.marketing_carrier.iata_code ?? "", name: raw.marketing_carrier.name };
  const operating = raw.operating_carrier && raw.operating_carrier.iata_code !== raw.marketing_carrier.iata_code ? { iata: raw.operating_carrier.iata_code ?? "", name: raw.operating_carrier.name } : null;
  return {
    originIata: raw.origin.iata_code,
    destinationIata: raw.destination.iata_code,
    departingAt: new Date(raw.departing_at),
    arrivingAt: new Date(raw.arriving_at),
    marketingCarrier: marketing,
    operatingCarrier: operating,
    flightNumber: raw.marketing_carrier_flight_number ?? null,
  };
}

function normalizeBaggage(raw: RawSegment[]): FlightOffer["baggage"] {
  const bags = raw.flatMap((s) => s.passengers?.flatMap((p) => p.baggages ?? []) ?? []);
  if (bags.length === 0) return null;
  return {
    checkedIncluded: bags.some((b) => b.type === "checked" && b.quantity > 0),
    carryOnIncluded: bags.some((b) => b.type === "carry_on" && b.quantity > 0),
  };
}

function normalizePenalty(raw: RawPenalty): FlightCommercialProduct["refundBeforeDeparture"] {
  if (!raw) return null;
  const amount = raw.penalty_amount !== null && raw.penalty_amount !== undefined ? Number(raw.penalty_amount) : null;
  return {
    allowed: Boolean(raw.allowed),
    penaltyAmount: amount !== null && Number.isFinite(amount) ? amount : null,
    penaltyCurrency: raw.penalty_currency ?? null,
  };
}

/** Fase 2.5 §1/§2/§3 — one slice's own commercial product, from that slice's own segments/fare_brand_name only — never borrowed from the other direction. */
function normalizeSliceCommercialProduct(slice: RawSlice): FlightSliceCommercialProduct {
  return {
    cabinClass: slice.segments[0]?.passengers?.[0]?.cabin_class ?? null,
    fareBrandName: slice.fare_brand_name ?? null,
    baggage: normalizeBaggage(slice.segments),
  };
}

/**
 * Fase 2.5 §1/§2 — corrects Fase 2's outbound-only simplification: both
 * slices get their own commercial product (see
 * normalizeSliceCommercialProduct), while refund/change conditions stay
 * offer-level (Duffel doesn't expose those per-slice). Every field is
 * `null` rather than guessed when Duffel doesn't provide it.
 */
function normalizeCommercialProduct(raw: RawOffer, outboundSlice: RawSlice, returnSlice: RawSlice): FlightCommercialProduct {
  return {
    outbound: normalizeSliceCommercialProduct(outboundSlice),
    return: normalizeSliceCommercialProduct(returnSlice),
    refundBeforeDeparture: normalizePenalty(raw.conditions?.refund_before_departure ?? null),
    changeBeforeDeparture: normalizePenalty(raw.conditions?.change_before_departure ?? null),
  };
}

/**
 * One offer here = ONE one-way itinerary (a single-slice offer_request —
 * see search.ts). A multi-slice offer would mean a round trip bundled in
 * one offer, which we never request (outbound/return are independent
 * one-way searches, matching how NormalizedFlightLeg already models a
 * leg) — reject it rather than silently picking a slice.
 */
export function normalizeOffer(raw: RawOffer, liveMode: boolean): FlightOffer {
  if (!raw?.id || !raw?.total_amount || !raw?.total_currency || !raw?.expires_at || !Array.isArray(raw.slices) || raw.slices.length !== 1) {
    throw new ProviderError("INVALID_PROVIDER_RESPONSE", "duffel", "Duffel offer is missing required fields or is not a single-slice (one-way) offer.");
  }
  const segments = raw.slices[0].segments.map(normalizeSegment);
  if (segments.length === 0) {
    throw new ProviderError("INVALID_PROVIDER_RESPONSE", "duffel", "Duffel offer has a slice with no segments.");
  }
  const totalAmount = Number(raw.total_amount);
  if (!Number.isFinite(totalAmount)) {
    throw new ProviderError("INVALID_PROVIDER_RESPONSE", "duffel", "Duffel offer total_amount is not a valid number.");
  }
  return {
    provider: "duffel",
    offerId: raw.id,
    totalAmount,
    currency: raw.total_currency,
    segments,
    expiresAt: new Date(raw.expires_at),
    liveMode,
    baggage: normalizeBaggage(raw.slices[0].segments),
  };
}

export function normalizeSearchResult(input: unknown): FlightSearchResult {
  const raw = input as RawOfferRequest;
  if (!raw?.id || !Array.isArray(raw.offers)) {
    throw new ProviderError("INVALID_PROVIDER_RESPONSE", "duffel", "Duffel offer_request response is missing required fields.");
  }
  const offers: FlightOffer[] = [];
  for (const rawOffer of raw.offers) {
    try {
      offers.push(normalizeOffer(rawOffer, raw.live_mode));
    } catch {
      // Skip a single malformed/multi-slice offer rather than failing the
      // whole search — the rest of the batch is still usable.
    }
  }
  return { offerRequestId: raw.id, liveMode: raw.live_mode, offers };
}

export function normalizeOfferForRevalidation(raw: RawOffer, liveMode: boolean): FlightOffer {
  return normalizeOffer(raw, liveMode);
}

/**
 * Fase 1.5 §2/§4/§6 — the round-trip counterpart of normalizeOffer: here a
 * TWO-slice offer (outbound + return) is the expected, required shape —
 * the inverse of normalizeOffer's own rule (`slices.length !== 1` ->
 * reject). One offer = one commercially-reservable round trip, ONE
 * offerId, ONE total_amount for both directions (§7) — never two
 * independently-priced legs summed together.
 */
export function normalizeRoundTripOffer(raw: RawOffer, liveMode: boolean, offerRequestId: string, passengerIds: string[]): RoundTripFlightOffer {
  if (!raw?.id || !raw?.total_amount || !raw?.total_currency || !raw?.expires_at || !Array.isArray(raw.slices) || raw.slices.length !== 2) {
    throw new ProviderError("INVALID_PROVIDER_RESPONSE", "duffel", "Duffel offer is missing required fields or is not a two-slice (round-trip) offer.");
  }
  const outboundSegments = raw.slices[0].segments.map(normalizeSegment);
  const returnSegments = raw.slices[1].segments.map(normalizeSegment);
  if (outboundSegments.length === 0 || returnSegments.length === 0) {
    throw new ProviderError("INVALID_PROVIDER_RESPONSE", "duffel", "Duffel round-trip offer has a slice with no segments.");
  }
  const totalAmount = Number(raw.total_amount);
  if (!Number.isFinite(totalAmount)) {
    throw new ProviderError("INVALID_PROVIDER_RESPONSE", "duffel", "Duffel offer total_amount is not a valid number.");
  }
  return {
    provider: "duffel",
    offerId: raw.id,
    offerRequestId,
    totalAmount,
    currency: raw.total_currency,
    outbound: { segments: outboundSegments },
    return: { segments: returnSegments },
    expiresAt: new Date(raw.expires_at),
    liveMode,
    passengerIds,
    commercialProduct: normalizeCommercialProduct(raw, raw.slices[0], raw.slices[1]),
  };
}

/**
 * Normalizes a two-slice Offer Request response into round-trip offers.
 * Carries `passengers` (Duffel-assigned ids, shared by every offer under
 * this offer_request — §5) through to each offer so they survive down to
 * whatever later builds the real Order. Skips a single malformed/wrong-
 * slice-count offer rather than failing the whole batch, same convention
 * as normalizeSearchResult.
 */
export function normalizeRoundTripSearchResult(input: unknown): RoundTripFlightSearchResult {
  const raw = input as RawOfferRequest;
  if (!raw?.id || !Array.isArray(raw.offers)) {
    throw new ProviderError("INVALID_PROVIDER_RESPONSE", "duffel", "Duffel offer_request response is missing required fields.");
  }
  const passengerIds = Array.isArray(raw.passengers) ? raw.passengers.map((p) => p.id).filter((id): id is string => Boolean(id)) : [];
  const offers: RoundTripFlightOffer[] = [];
  for (const rawOffer of raw.offers) {
    try {
      offers.push(normalizeRoundTripOffer(rawOffer, raw.live_mode, raw.id, passengerIds));
    } catch {
      // Skip a single malformed/non-round-trip offer rather than failing
      // the whole batch — the rest is still usable.
    }
  }
  return { offerRequestId: raw.id, liveMode: raw.live_mode, offers };
}
