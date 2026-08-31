import { nuiteeRequest } from "./client";
import { ProviderError } from "@/lib/providers/errors";
import type { HotelPrebook, PrebookChangeEvaluation } from "./types";

type RawPrebook = {
  prebookId: string;
  hotelId: string;
  price: number;
  currency: string;
  priceDifferencePercent?: number | null;
  cancellationChanged?: boolean;
  boardChanged?: boolean;
  paymentTypes?: string[];
  checkin: string;
  checkout: string;
};

function normalizePrebook(raw: RawPrebook): HotelPrebook {
  if (!raw?.prebookId || !raw?.hotelId || !raw?.price || !raw?.currency || !raw?.checkin || !raw?.checkout) {
    throw new ProviderError("INVALID_PROVIDER_RESPONSE", "nuitee", "Nuitee prebook response is missing required fields.");
  }
  return {
    prebookId: raw.prebookId,
    hotelId: raw.hotelId,
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
