import { nuiteeRequest } from "./client";
import { normalizeSearchResult } from "./normalize";
import { roomMixToOccupancies } from "./occupancies";
import type { RoomMixEntry } from "@/lib/pricing/roomMix";
import type { HotelSearchResult } from "./types";

export type HotelSearchParams = {
  /** Location by city name — the legacy path, still supported for callers with no coordinates. Ignored when latitude/longitude/radiusMeters are given (see below). */
  cityName?: string;
  countryCode?: string;
  /**
   * Fase 3B.2 correction — LiteAPI/Nuitee's own official geographic SEARCH
   * (`POST /v3.0/hotels/rates` with `latitude`/`longitude`/`radius`),
   * preferred whenever available: the automatic hotel resolution always
   * has the Event's stadium coordinates, so it asks Nuitee to filter
   * geographically server-side rather than fetching a whole city's hotels
   * by `cityName` and reducing locally. When present, these three take
   * priority over `cityName`/`countryCode` and that pair is omitted from
   * the request entirely — never both location styles in one call.
   */
  latitude?: number;
  longitude?: number;
  /** Meters — Nuitee's own unit for `radius`. Convert from km at the call site. */
  radiusMeters?: number;
  /** yyyy-mm-dd */
  checkin: string;
  /** yyyy-mm-dd */
  checkout: string;
  currency: string;
  guestNationality: string;
  mix: RoomMixEntry[];
  /** e.g. [3, 4] — the product's "hotel 3 or 4 estrellas" selection (§11). Passed straight through to Nuitee when provided. */
  starRatings?: number[];
  fetchImpl?: typeof fetch;
};

export async function searchHotels(params: HotelSearchParams): Promise<HotelSearchResult> {
  const body: Record<string, unknown> = {
    checkin: params.checkin,
    checkout: params.checkout,
    currency: params.currency,
    guestNationality: params.guestNationality,
    occupancies: roomMixToOccupancies(params.mix),
  };
  if (params.latitude != null && params.longitude != null && params.radiusMeters != null) {
    body.latitude = params.latitude;
    body.longitude = params.longitude;
    body.radius = params.radiusMeters;
  } else {
    body.cityName = params.cityName;
    body.countryCode = params.countryCode;
  }
  if (params.starRatings && params.starRatings.length > 0) {
    body.starRating = params.starRatings;
  }

  const raw = await nuiteeRequest<unknown>({ method: "POST", host: "search", path: "/hotels/rates", body, timeoutMs: 15_000 }, params.fetchImpl);
  return normalizeSearchResult(raw);
}
