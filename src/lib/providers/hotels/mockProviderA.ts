import type { HotelProvider, NormalizedHotelOffer } from "../types";
import { seededInt } from "./deterministic";

/**
 * Deterministic demo fixture — a central budget-tier 4★ hotel with
 * generous single/double inventory but NO triple rooms at all (not a
 * random shortage, a permanent property fact). Any party size whose room
 * mix needs a triple (3, 5, 7, 9 travelers) makes this provider invalid
 * for that booking even though its per-night prices are the cheapest —
 * exercises the "valid-but-pricier beats invalid-though-cheaper"
 * selection rule and the multi-provider fallback (§39/§160).
 */
export class MockHotelProviderA implements HotelProvider {
  readonly kind = "mockA";

  async getOffers(params: { tripId: string; city: string }): Promise<NormalizedHotelOffer[]> {
    const seed = `${this.kind}:${params.tripId}`;
    return [
      {
        id: `${this.kind}:${params.tripId}`,
        provider: this.kind,
        name: `Hotel Central ${params.city}`,
        stars: 4,
        zone: "Centro",
        pricePerNight: {
          single: 70 + seededInt(seed + ":s", 0, 20),
          double: 45 + seededInt(seed + ":d", 0, 15),
          triple: 38 + seededInt(seed + ":t", 0, 12),
        },
        roomsAvailable: { single: 6, double: 10, triple: 0 },
        validUntil: null,
      },
    ];
  }
}
