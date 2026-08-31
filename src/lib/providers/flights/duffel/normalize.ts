import { ProviderError } from "@/lib/providers/errors";
import type { FlightOffer, FlightSearchResult, FlightSegment } from "./types";

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
  passengers?: { baggages?: { type: string; quantity: number }[] }[];
};
type RawSlice = { segments: RawSegment[] };
type RawOffer = {
  id: string;
  total_amount: string;
  total_currency: string;
  expires_at: string;
  slices: RawSlice[];
};
type RawOfferRequest = { id: string; live_mode: boolean; offers: RawOffer[] };

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
