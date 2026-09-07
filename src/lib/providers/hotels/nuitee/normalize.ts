import { ProviderError } from "@/lib/providers/errors";
import type { HotelOption, HotelRate, HotelRoom, HotelSearchResult, TaxAndFee } from "./types";

/**
 * Field names/shapes below match the REAL sandbox payloads captured by
 * the user's own manual Nuitee runs (not an approximation):
 *
 * SEARCH: { data: [{ hotelId, roomTypes: [{ offerId, rates: [...],
 *   offerRetailRate }] }], hotels: [{ id, name, address, city_name,
 *   latitude, longitude, stars, rating, review_count, main_photo }],
 *   sandbox }. Commercial data lives in data[], descriptive hotel content
 *   lives in hotels[] — joined by data[].hotelId === hotels[].id.
 *   offerId is on roomTypes[], never on an individual rate — one offerId
 *   IS the whole multi-room combination.
 *
 * retailRate.total is an ARRAY of {amount, currency} in SEARCH/PREBOOK,
 * but an OBJECT ({amount, currency}) in BOOK's bookedRooms — see book.ts,
 * which never reuses this file's array-only parser. Never duck-type
 * between the two: each parser here asserts its expected shape and
 * throws INVALID_PROVIDER_RESPONSE rather than silently accepting the
 * other shape.
 */
type RawAmount = { amount: number; currency: string };
type RawTaxAndFee = { included: boolean; description: string; amount: number; currency: string };
type RawRetailRate = { total: RawAmount[]; taxesAndFees?: RawTaxAndFee[] };
/**
 * Fase 3B.2 §4 — `cancelPolicyInfos` is Nuitee's own time-based fee
 * schedule (each entry: "cancelling on/after `cancelTime` costs `amount`").
 * Real sandbox captures seen so far always returned this as `[]`, even for
 * an NRFN room — so this codebase has never actually observed a populated
 * schedule. Parsed defensively here regardless: see
 * computeFreeCancellationUntil below for exactly how a genuine free-window
 * deadline is derived from it, and its own doc comment for why an empty
 * array is treated as "no evidence" rather than "free forever".
 */
type RawCancelPolicyInfo = { cancelTime: string; amount: number };
export type RawRate = {
  occupancyNumber: number;
  name?: string;
  maxOccupancy?: number;
  adultCount: number;
  boardType?: string | null;
  boardName?: string | null;
  retailRate: RawRetailRate;
  cancellationPolicies?: { refundableTag: "RFN" | "NRFN"; cancelPolicyInfos?: RawCancelPolicyInfo[] };
};
type RawRoomType = {
  offerId: string;
  rates: RawRate[];
  offerRetailRate: RawAmount;
};
type RawDataHotel = { hotelId: string; roomTypes: RawRoomType[] };
type RawHotelContent = {
  id: string;
  name: string;
  address?: string;
  city_name?: string;
  stars?: number | null;
  rating?: number | null;
  review_count?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  main_photo?: string | null;
};
type RawSearchResponse = { data: RawDataHotel[]; hotels: RawHotelContent[] };

/** SEARCH/PREBOOK only — retailRate.total is always an array here. Throws rather than guessing if it isn't. */
function extractAmountFromArray(total: unknown, provider: "nuitee"): { amount: number; currency: string } {
  if (!Array.isArray(total) || total.length === 0 || typeof total[0]?.amount !== "number" || typeof total[0]?.currency !== "string") {
    throw new ProviderError("INVALID_PROVIDER_RESPONSE", provider, "Expected retailRate.total to be a non-empty array of {amount, currency} (SEARCH/PREBOOK shape).");
  }
  return { amount: total[0].amount, currency: total[0].currency };
}

export function normalizeTaxesAndFees(raw: RawTaxAndFee[] | undefined): { included: TaxAndFee[]; excluded: TaxAndFee[] } {
  const included: TaxAndFee[] = [];
  const excluded: TaxAndFee[] = [];
  for (const t of raw ?? []) {
    const entry: TaxAndFee = { description: t.description, amount: t.amount, currency: t.currency, included: t.included };
    (t.included ? included : excluded).push(entry);
  }
  return { included, excluded };
}

/**
 * Fase 3B.2 §4 — the real, evidence-based free-cancellation deadline for
 * one room, NEVER inferred from `refundableTag` alone ("No asumir: RFN ==
 * siempre gratis"). Only ever non-null when the schedule itself proves a
 * free window: NRFN rooms never get one, and an RFN room with an empty or
 * missing `cancelPolicyInfos` (the only shape this codebase has ever
 * actually observed in a real sandbox capture) stays null too — "we don't
 * know" is a distinct, honest outcome from "not refundable", never
 * collapsed into it. When populated, the earliest-dated entry describes
 * the boundary a fee schedule starts from; if that boundary itself already
 * carries a nonzero fee, cancellation is not free even right now, so this
 * still returns null rather than a fabricated "free until" instant.
 */
export function computeFreeCancellationUntil(refundableTag: "RFN" | "NRFN" | undefined, infos: RawCancelPolicyInfo[] | undefined): string | null {
  if (refundableTag !== "RFN" || !infos || infos.length === 0) return null;
  const sorted = [...infos].sort((a, b) => new Date(a.cancelTime).getTime() - new Date(b.cancelTime).getTime());
  if (sorted[0].amount !== 0) return null;
  return sorted[0].cancelTime;
}

/** Shared by SEARCH (roomTypes[].rates[]) and PREBOOK (same nested shape, leaner — no name/maxOccupancy guaranteed). */
export function normalizeRoom(raw: RawRate): HotelRoom {
  if (typeof raw?.occupancyNumber !== "number" || !raw?.retailRate) {
    throw new ProviderError("INVALID_PROVIDER_RESPONSE", "nuitee", "Nuitee rate is missing occupancyNumber/retailRate.");
  }
  const amount = extractAmountFromArray(raw.retailRate.total, "nuitee");
  const { included, excluded } = normalizeTaxesAndFees(raw.retailRate.taxesAndFees);
  return {
    occupancyNumber: raw.occupancyNumber,
    roomName: raw.name ?? "",
    maxOccupancy: raw.maxOccupancy ?? raw.adultCount,
    adultCount: raw.adultCount,
    board: raw.boardName ?? raw.boardType ?? null,
    price: { total: amount.amount, currency: amount.currency },
    includedTaxesAndFees: included,
    excludedTaxesAndFees: excluded,
    refundable: raw.cancellationPolicies?.refundableTag === "RFN",
    freeCancellationUntil: computeFreeCancellationUntil(raw.cancellationPolicies?.refundableTag, raw.cancellationPolicies?.cancelPolicyInfos),
  };
}

function normalizeRoomType(raw: RawRoomType): HotelRate {
  if (!raw?.offerId || !Array.isArray(raw.rates) || raw.rates.length === 0 || !raw.offerRetailRate) {
    throw new ProviderError("INVALID_PROVIDER_RESPONSE", "nuitee", "Nuitee roomType is missing offerId/rates/offerRetailRate.");
  }
  const rooms: HotelRoom[] = [];
  for (const rawRate of raw.rates) {
    try {
      rooms.push(normalizeRoom(rawRate));
    } catch {
      // Skip a single malformed room rather than dropping the whole combination.
    }
  }
  if (rooms.length === 0) {
    throw new ProviderError("INVALID_PROVIDER_RESPONSE", "nuitee", "Nuitee roomType had no valid rooms after normalization.");
  }
  return {
    offerId: raw.offerId,
    rooms,
    price: { total: raw.offerRetailRate.amount, currency: raw.offerRetailRate.currency },
  };
}

function normalizeHotel(rawData: RawDataHotel, content: RawHotelContent): HotelOption {
  if (!rawData?.hotelId || !Array.isArray(rawData.roomTypes) || !content?.name) {
    throw new ProviderError("INVALID_PROVIDER_RESPONSE", "nuitee", "Nuitee hotel is missing hotelId/roomTypes/content.name.");
  }
  const rates: HotelRate[] = [];
  for (const roomType of rawData.roomTypes) {
    try {
      rates.push(normalizeRoomType(roomType));
    } catch {
      // Skip a single malformed offer (roomType) rather than dropping the whole hotel.
    }
  }
  return {
    provider: "nuitee",
    hotelId: rawData.hotelId,
    name: content.name,
    stars: content.stars ?? null,
    rating: content.rating ?? null,
    reviewCount: content.review_count ?? null,
    address: content.address ?? "",
    city: content.city_name ?? "",
    coordinates: content.latitude != null && content.longitude != null ? { lat: content.latitude, lng: content.longitude } : null,
    photoUrl: content.main_photo ?? null,
    rates,
  };
}

/**
 * data[] carries commercial data (hotelId, rates); hotels[] carries
 * descriptive content (name, address, stars...) — joined by
 * data[].hotelId === hotels[].id. A data[] entry with no matching
 * hotels[] content can't produce a usable HotelOption (no name/address)
 * and is skipped, same as any other malformed entry.
 */
export function normalizeSearchResult(input: unknown): HotelSearchResult {
  const raw = input as RawSearchResponse;
  if (!Array.isArray(raw?.data) || !Array.isArray(raw?.hotels)) {
    throw new ProviderError("INVALID_PROVIDER_RESPONSE", "nuitee", "Nuitee search response is missing the data[]/hotels[] arrays.");
  }
  const contentById = new Map(raw.hotels.map((h) => [h.id, h]));
  const hotels: HotelOption[] = [];
  for (const rawHotel of raw.data) {
    const content = contentById.get(rawHotel.hotelId);
    if (!content) continue;
    try {
      hotels.push(normalizeHotel(rawHotel, content));
    } catch {
      // Skip a single malformed hotel rather than failing the whole search.
    }
  }
  return { hotels };
}
