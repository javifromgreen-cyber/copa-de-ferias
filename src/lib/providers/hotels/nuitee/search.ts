import { nuiteeRequest } from "./client";
import { normalizeSearchResult } from "./normalize";
import { roomMixToOccupancies } from "./occupancies";
import type { RoomMixEntry } from "@/lib/pricing/roomMix";
import type { HotelSearchResult } from "./types";

export type HotelSearchParams = {
  cityName: string;
  countryCode: string;
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
    cityName: params.cityName,
    countryCode: params.countryCode,
    checkin: params.checkin,
    checkout: params.checkout,
    currency: params.currency,
    guestNationality: params.guestNationality,
    occupancies: roomMixToOccupancies(params.mix),
  };
  if (params.starRatings && params.starRatings.length > 0) {
    body.starRating = params.starRatings;
  }

  const raw = await nuiteeRequest<unknown>({ method: "POST", host: "search", path: "/hotels/rates", body, timeoutMs: 15_000 }, params.fetchImpl);
  return normalizeSearchResult(raw);
}
