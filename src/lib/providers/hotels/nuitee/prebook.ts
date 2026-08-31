import { nuiteeRequest } from "./client";
import { normalizeRoom, type RawRate } from "./normalize";
import { ProviderError } from "@/lib/providers/errors";
import type { HotelPrebook, HotelRoom, PrebookChangeEvaluation } from "./types";

/**
 * Real PREBOOK shape: { data: { prebookId, offerId, hotelId, currency,
 * roomTypes: [{ rates: [...] }], price, priceDifferencePercent,
 * cancellationChanged, boardChanged, paymentTypes, checkin, checkout,
 * sellingPriceToUser }, sandbox }. `price` here is a plain number — NOT
 * the array-shaped retailRate.total (that only appears nested inside
 * roomTypes[].rates[].retailRate, same array shape as SEARCH, normalized
 * via the shared normalizeRoom()).
 */
type RawPrebook = {
  prebookId: string;
  offerId: string;
  hotelId: string;
  currency: string;
  roomTypes?: { rates: RawRate[] }[];
  price: number;
  priceDifferencePercent?: number | null;
  cancellationChanged?: boolean;
  boardChanged?: boolean;
  paymentTypes?: string[];
  checkin: string;
  checkout: string;
};

function normalizePrebook(raw: RawPrebook): HotelPrebook {
  if (!raw?.prebookId || !raw?.offerId || !raw?.hotelId || typeof raw?.price !== "number" || !raw?.currency || !raw?.checkin || !raw?.checkout) {
    throw new ProviderError("INVALID_PROVIDER_RESPONSE", "nuitee", "Nuitee prebook response is missing required fields.");
  }
  const rooms: HotelRoom[] = [];
  for (const roomType of raw.roomTypes ?? []) {
    for (const rawRate of roomType.rates ?? []) {
      try {
        rooms.push(normalizeRoom(rawRate));
      } catch {
        // Skip a single malformed room rather than failing the whole prebook.
      }
    }
  }
  return {
    prebookId: raw.prebookId,
    offerId: raw.offerId,
    hotelId: raw.hotelId,
    rooms,
    price: { total: raw.price, currency: raw.currency },
    priceDifferencePercent: raw.priceDifferencePercent ?? null,
    cancellationChanged: Boolean(raw.cancellationChanged),
    boardChanged: Boolean(raw.boardChanged),
    paymentTypes: raw.paymentTypes ?? [],
    checkin: raw.checkin,
    checkout: raw.checkout,
  };
}

export async function prebookOffer(offerId: string, fetchImpl?: typeof fetch): Promise<HotelPrebook> {
  const response = await nuiteeRequest<{ data: RawPrebook }>({ method: "POST", host: "book", path: "/rates/prebook", body: { offerId }, timeoutMs: 12_000 }, fetchImpl);
  return normalizePrebook(response.data);
}

/**
 * Per §5: never assume PREBOOK price == SEARCH price, and never continue
 * silently past a changed cancellation/board policy. `requiresAcceptance`
 * is true whenever ANYTHING relevant changed — a future checkout is
 * expected to surface this structured result to the customer rather than
 * just re-showing the new number.
 */
export function evaluatePrebookChange(searchPriceTotal: number, prebook: HotelPrebook): PrebookChangeEvaluation {
  const priceChanged = prebook.price.total !== searchPriceTotal;
  return {
    priceChanged,
    cancellationChanged: prebook.cancellationChanged,
    boardChanged: prebook.boardChanged,
    requiresAcceptance: priceChanged || prebook.cancellationChanged || prebook.boardChanged,
  };
}
