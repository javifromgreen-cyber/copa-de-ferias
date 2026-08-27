import type { NormalizedHotelOffer } from "@/lib/providers/types";
import type { RoomMixEntry } from "./roomMix";

export type HotelSelectionStrategy = "CHEAPEST_VALID" | "PREFERRED_PROVIDER_FIRST" | "MANUAL_OVERRIDE";

function mixCount(mix: RoomMixEntry[], type: "single" | "double" | "triple"): number {
  return mix.find((m) => m.type === type)?.count ?? 0;
}

/**
 * A hotel offer is valid for a party's room mix only if it can supply the
 * exact real rooms needed, simultaneously, right now — never "stretched"
 * (e.g. splitting one double across two singles) or substituted (e.g. a
 * double+single standing in for an unavailable triple). See §42-43/§158-159.
 */
export function isHotelOfferValidForMix(offer: NormalizedHotelOffer, mix: RoomMixEntry[]): boolean {
  return (
    offer.roomsAvailable.single >= mixCount(mix, "single") &&
    offer.roomsAvailable.double >= mixCount(mix, "double") &&
    offer.roomsAvailable.triple >= mixCount(mix, "triple")
  );
}

export function computeHotelOfferTotalPrice(offer: NormalizedHotelOffer, mix: RoomMixEntry[], nights: number): number {
  const total =
    mixCount(mix, "single") * offer.pricePerNight.single +
    mixCount(mix, "double") * offer.pricePerNight.double +
    mixCount(mix, "triple") * offer.pricePerNight.triple;
  return total * nights;
}

export type HotelSelectionResult =
  | { ok: true; offer: NormalizedHotelOffer; totalPrice: number }
  | { ok: false; reason: "no_valid_offer" | "preferred_provider_invalid" | "manual_override_invalid" };

/**
 * Selects which hotel offer to book, per §39/§160: a valid-but-pricier
 * offer always beats an invalid-though-cheaper one — invalid offers are
 * filtered out before any price comparison happens.
 */
export function selectHotelOffer(opts: {
  offers: NormalizedHotelOffer[];
  mix: RoomMixEntry[];
  nights: number;
  strategy: HotelSelectionStrategy;
  preferredProviderKind?: string;
  manualOverrideOfferId?: string;
}): HotelSelectionResult {
  const { offers, mix, nights, strategy, preferredProviderKind, manualOverrideOfferId } = opts;

  const valid = offers.filter((o) => isHotelOfferValidForMix(o, mix));
  if (valid.length === 0) return { ok: false, reason: "no_valid_offer" };

  const priced = valid.map((offer) => ({ offer, totalPrice: computeHotelOfferTotalPrice(offer, mix, nights) }));
  const cheapest = priced.reduce((best, current) => (current.totalPrice < best.totalPrice ? current : best));

  if (strategy === "CHEAPEST_VALID") {
    return { ok: true, offer: cheapest.offer, totalPrice: cheapest.totalPrice };
  }

  if (strategy === "PREFERRED_PROVIDER_FIRST") {
    const preferred = priced.find((p) => p.offer.provider === preferredProviderKind);
    if (preferred) return { ok: true, offer: preferred.offer, totalPrice: preferred.totalPrice };
    // Preferred provider has no valid offer for this mix — fall back to
    // cheapest valid rather than failing the whole quote outright.
    return { ok: true, offer: cheapest.offer, totalPrice: cheapest.totalPrice };
  }

  // MANUAL_OVERRIDE
  const manual = priced.find((p) => p.offer.id === manualOverrideOfferId);
  if (!manual) return { ok: false, reason: "manual_override_invalid" };
  return { ok: true, offer: manual.offer, totalPrice: manual.totalPrice };
}
