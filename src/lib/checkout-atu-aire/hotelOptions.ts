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
 */
export function buildHotelOptions(offers: NormalizedHotelOffer[], mix: RoomMixEntry[], nights: number, partySize: number): HotelOptionView[] {
  return offers
    .map((offer) => {
      const valid = isHotelOfferValidForMix(offer, mix);
      const totalPrice = computeHotelOfferTotalPrice(offer, mix, nights);
      return {
        offer,
        totalPrice,
        perPersonPrice: totalPrice / partySize,
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
