import { ProviderError } from "@/lib/providers/errors";
import type { HotelOption, HotelRate, HotelSearchResult, TaxAndFee } from "./types";

/**
 * Field names below match what was actually observed in the manual
 * sandbox PoC for POST /hotels/rates (this session's own record, not a
 * captured raw payload) — hotelId/name/address/city/stars/rating/
 * reviewCount/roomType/maxOccupancy/adultCount/board/offerId/
 * taxesAndFees[]{included,description,amount,currency}/
 * cancellationPolicies/refundableTag/paymentTypes. Spot-check against a
 * live response before this is ever wired past this directory —
 * `suggestedSellingPrice` is deliberately never read here (§9).
 */
type RawTaxAndFee = { included: boolean; description: string; amount: number; currency: string };
type RawCancellationPolicy = { amount: number; currency: string; type: string };
type RawRate = {
  offerId: string;
  roomType: string;
  maxOccupancy: number;
  adultCount: number;
  board: string | null;
  retailRate: { total: number; currency: string };
  taxesAndFees?: RawTaxAndFee[];
  refundableTag: "RFN" | "NRFN";
  cancellationPolicies?: RawCancellationPolicy[];
};
type RawHotel = {
  hotelId: string;
  name: string;
  address: string;
  city: string;
  stars?: number | null;
  rating?: number | null;
  reviewCount?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  photo?: string | null;
  rates: RawRate[];
};

export function normalizeTaxesAndFees(raw: RawTaxAndFee[] | undefined): { included: TaxAndFee[]; excluded: TaxAndFee[] } {
  const included: TaxAndFee[] = [];
  const excluded: TaxAndFee[] = [];
  for (const t of raw ?? []) {
    const entry: TaxAndFee = { description: t.description, amount: t.amount, currency: t.currency, included: t.included };
    (t.included ? included : excluded).push(entry);
  }
  return { included, excluded };
}

function normalizeRate(raw: RawRate): HotelRate {
  if (!raw?.offerId || !raw?.retailRate?.total || !raw?.retailRate?.currency) {
    throw new ProviderError("INVALID_PROVIDER_RESPONSE", "nuitee", "Nuitee rate is missing required fields.");
  }
  const { included, excluded } = normalizeTaxesAndFees(raw.taxesAndFees);
  return {
    offerId: raw.offerId,
    room: { roomType: raw.roomType, maxOccupancy: raw.maxOccupancy, adultCount: raw.adultCount, board: raw.board ?? null },
    // retailRate.total is the provider's stay total for this rate — NOT
    // asserted here to already include every fee (§8): includedTaxesAndFees
    // vs excludedTaxesAndFees is what tells the caller what's actually
    // covered by this number.
    price: { total: raw.retailRate.total, currency: raw.retailRate.currency },
    includedTaxesAndFees: included,
    excludedTaxesAndFees: excluded,
    refundable: raw.refundableTag === "RFN",
    cancellationPolicies: (raw.cancellationPolicies ?? []).map((c) => ({ amount: c.amount, currency: c.currency, type: c.type })),
  };
}

function normalizeHotel(raw: RawHotel): HotelOption {
  if (!raw?.hotelId || !raw?.name || !Array.isArray(raw.rates)) {
    throw new ProviderError("INVALID_PROVIDER_RESPONSE", "nuitee", "Nuitee hotel is missing required fields.");
  }
  const rates: HotelRate[] = [];
  for (const rawRate of raw.rates) {
    try {
      rates.push(normalizeRate(rawRate));
    } catch {
      // Skip a single malformed rate rather than dropping the whole hotel.
    }
  }
  return {
    provider: "nuitee",
    hotelId: raw.hotelId,
    name: raw.name,
    stars: raw.stars ?? null,
    rating: raw.rating ?? null,
    reviewCount: raw.reviewCount ?? null,
    address: raw.address ?? "",
    city: raw.city ?? "",
    coordinates: raw.latitude != null && raw.longitude != null ? { lat: raw.latitude, lng: raw.longitude } : null,
    photoUrl: raw.photo ?? null,
    rates,
  };
}

export function normalizeSearchResult(input: unknown): HotelSearchResult {
  const raw = input as { data?: RawHotel[] } | RawHotel[];
  const rawHotels = Array.isArray(raw) ? raw : raw?.data;
  if (!Array.isArray(rawHotels)) {
    throw new ProviderError("INVALID_PROVIDER_RESPONSE", "nuitee", "Nuitee search response is missing the hotels array.");
  }
  const hotels: HotelOption[] = [];
  for (const rawHotel of rawHotels) {
    try {
      hotels.push(normalizeHotel(rawHotel));
    } catch {
      // Skip a single malformed hotel rather than failing the whole search.
    }
  }
  return { hotels };
}
