import type { NormalizedHotelOffer } from "@/lib/providers/types";
import type { RoomMixEntry } from "@/lib/pricing/roomMix";
import { isHotelOfferValidForMix, computeHotelOfferTotalPrice } from "@/lib/pricing/hotelSelection";
import type { HotelOptionView } from "./types";

/**
 * Every offer is returned (never silently hidden) so the customer can see
 * *why* a cheap hotel isn't an option for their group — but invalid ones
 * are marked non-selectable and always sorted after valid ones, so a
 * cheap-but-invalid offer can never look like the front-running choice
 * (§11: valid-but-pricier must never lose to invalid-though-cheaper).
 *
 * `otherComponentsPerPerson` is everything else already fixed in the
 * current selection (tickets + the applicable organization fee, and the
 * flight component when the package requires one) — added to each hotel's
 * own per-person cost so the card can show the *resultant* trip total per
 * person with that hotel chosen, never the hotel's cost in isolation
 * (§11/§12).
 */
export function buildHotelOptions(
  offers: NormalizedHotelOffer[],
  mix: RoomMixEntry[],
  nights: number,
  partySize: number,
  otherComponentsPerPerson: number,
): HotelOptionView[] {
  return offers
    .map((offer) => {
      const valid = isHotelOfferValidForMix(offer, mix);
      const totalPrice = computeHotelOfferTotalPrice(offer, mix, nights);
      const perPersonPrice = totalPrice / partySize;
      return {
        offer,
        totalPrice,
        perPersonPrice,
        resultantTotalPerPerson: otherComponentsPerPerson + perPersonPrice,
        valid,
        invalidReason: valid ? undefined : "No tiene habitaciones suficientes para alojar a todo el grupo en las fechas elegidas.",
      };
    })
    .sort((a, b) => Number(b.valid) - Number(a.valid) || a.totalPrice - b.totalPrice);
}

export function cheapestValidHotelPerPerson(options: HotelOptionView[]): number | null {
  const valid = options.filter((o) => o.valid);
  if (valid.length === 0) return null;
  return Math.min(...valid.map((o) => o.perPersonPrice));
}
