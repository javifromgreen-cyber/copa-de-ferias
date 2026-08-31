import { duffelRequest } from "./client";
import { normalizeOfferForRevalidation } from "./normalize";
import { ProviderError } from "@/lib/providers/errors";
import type { FlightRevalidation } from "./types";

/**
 * GET /air/offers/{id} — per §Duffel revalidación: no magic "changed"
 * boolean exists on the response, so we compute the status ourselves by
 * comparing against what the caller already showed the customer
 * (originalTotalAmount). Always uses the expires_at we just received —
 * never assumes the GET itself renewed anything.
 */
export async function revalidateOffer(offerId: string, originalTotalAmount: number, fetchImpl?: typeof fetch): Promise<FlightRevalidation> {
  try {
    const response = await duffelRequest<{ data: unknown }>({ method: "GET", path: `/air/offers/${offerId}` }, fetchImpl);
    const raw = response.data as { total_amount?: string; expires_at?: string; live_mode?: boolean };
    const offer = normalizeOfferForRevalidation(response.data as Parameters<typeof normalizeOfferForRevalidation>[0], raw.live_mode ?? false);

    if (offer.expiresAt.getTime() <= Date.now()) {
      return { status: "expired", offer, originalTotalAmount, expiresAt: offer.expiresAt };
    }
    const status = offer.totalAmount === originalTotalAmount ? "unchanged" : "price_changed";
    return { status, offer, originalTotalAmount, expiresAt: offer.expiresAt };
  } catch (err) {
    if (err instanceof ProviderError && err.code === "NO_AVAILABILITY") {
      return { status: "not_found", offer: null, originalTotalAmount, expiresAt: null };
    }
    throw err;
  }
}
