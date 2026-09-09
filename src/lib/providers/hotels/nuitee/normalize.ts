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
 * Fase 3B.2 §4, corrected after the first real Vercel TICKET_HOTEL run —
 * `cancelPolicyInfos` is Nuitee/LiteAPI's own time-based fee schedule:
 * each entry means "cancelling on/after `cancelTime` costs `amount`".
 * Real Production PREBOOK responses DO populate this (contrary to this
 * codebase's earlier sandbox captures, which only ever saw `[]`) — see
 * computeFreeCancellationUntil below for exactly how a genuine
 * free-window deadline is derived from it. `cancelTime` is LiteAPI's own
 * offset-less "YYYY-MM-DD HH:mm:ss" format (never assume ISO-with-Z), so
 * `timezone` (LiteAPI's documented default: "GMT") must be interpreted
 * explicitly rather than handed to `new Date()` as-is — see
 * parseNuiteeCancelTime.
 */
type RawCancelPolicyInfo = { cancelTime: string; amount: number; currency?: string; type?: string; timezone?: string };
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
 * Nuitee/LiteAPI's `cancelTime` has no UTC offset of its own
 * ("YYYY-MM-DD HH:mm:ss") — handing that straight to `new Date()` is
 * implementation-defined (V8 treats it as the RUNTIME's local time, not
 * necessarily UTC), which is exactly the kind of environment-dependent
 * bug this codebase must never risk on a real cancellation deadline.
 * Only an explicitly-recognized timezone is resolved (LiteAPI's own
 * documented default and the only value observed so far: "GMT"/"UTC");
 * anything else is left unparsed — `null` — rather than guessed at. A
 * `cancelTime` that already carries its own offset/`Z` (defensive, in
 * case a future response shape includes one) is parsed directly, since
 * that's unambiguous regardless of `timezone`.
 */
function parseNuiteeCancelTime(cancelTime: string, timezone: string | undefined): Date | null {
  const trimmed = cancelTime.trim();
  if (/Z$|[+-]\d{2}:?\d{2}$/.test(trimmed)) {
    const direct = new Date(trimmed);
    return Number.isNaN(direct.getTime()) ? null : direct;
  }
  const tz = (timezone ?? "GMT").trim().toUpperCase();
  if (tz !== "GMT" && tz !== "UTC") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(trimmed);
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match;
  const asUtc = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}Z`);
  return Number.isNaN(asUtc.getTime()) ? null : asUtc;
}

/**
 * Fase 3B.2 §4, corrected — the real, evidence-based free-cancellation
 * deadline for one room, NEVER inferred from `refundableTag` alone ("No
 * asumir: RFN == siempre gratis"). NRFN rooms never get one, and an RFN
 * room with an empty/missing `cancelPolicyInfos` stays null too — "we
 * don't know" is a distinct, honest outcome from "not refundable", never
 * collapsed into it.
 *
 * A `cancelPolicyInfo` entry means "cancelling on/after `cancelTime`
 * costs `amount`" — so the free-cancellation deadline is the EARLIEST
 * entry that actually carries a fee (`amount > 0`), never simply the
 * earliest cancelTime regardless of amount (the previous version of this
 * function had that inverted — see the real Vercel diagnostic that
 * caught it: every genuine candidate came back
 * CANCELLATION_POLICY_AMBIGUOUS despite having exactly the evidence
 * needed). An `amount === 0` entry carries no financial penalty and is
 * skipped in favor of the next chargeable one, per LiteAPI's own
 * schedule semantics; entries are sorted chronologically first since the
 * provider never guarantees array order. If NO entry ever carries a fee,
 * this still returns null rather than inventing "free forever" — the
 * schedule genuinely doesn't prove a deadline either way. Only a
 * cancelTime this module can actually parse (see parseNuiteeCancelTime)
 * counts; an unparseable one is skipped, never guessed at.
 */
export function computeFreeCancellationUntil(refundableTag: "RFN" | "NRFN" | undefined, infos: RawCancelPolicyInfo[] | undefined): string | null {
  if (refundableTag !== "RFN" || !infos || infos.length === 0) return null;
  const parsed = infos
    .map((info) => ({ info, at: parseNuiteeCancelTime(info.cancelTime, info.timezone) }))
    .filter((p): p is { info: RawCancelPolicyInfo; at: Date } => p.at !== null)
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  const firstChargeable = parsed.find((p) => p.info.amount > 0);
  return firstChargeable ? firstChargeable.at.toISOString() : null;
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
    cancelPolicyInfos: (raw.cancellationPolicies?.cancelPolicyInfos ?? []).map((i) => ({
      cancelTime: i.cancelTime,
      amount: i.amount,
      currency: i.currency ?? null,
      type: i.type ?? null,
      timezone: i.timezone ?? null,
    })),
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
