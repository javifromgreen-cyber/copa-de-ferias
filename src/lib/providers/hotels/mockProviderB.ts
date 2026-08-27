import type { HotelProvider, NormalizedHotelOffer } from "../types";
import { seededInt } from "./deterministic";

/**
 * Deterministic demo fixture — a pricier hotel with full inventory across
 * all room types. Exists so selection logic has a valid-but-more-expensive
 * fallback whenever Provider A can't cover the required room mix.
 */
export class MockHotelProviderB implements HotelProvider {
  readonly kind = "mockB";

  async getOffers(params: { tripId: string; city: string }): Promise<NormalizedHotelOffer[]> {
    const seed = `${this.kind}:${params.tripId}`;
    return [
      {
        id: `${this.kind}:${params.tripId}`,
        provider: this.kind,
        name: `Hotel Plaza ${params.city}`,
        stars: 4,
        zone: "Centro",
        pricePerNight: {
          single: 90 + seededInt(seed + ":s", 0, 20),
          double: 60 + seededInt(seed + ":d", 0, 15),
          triple: 52 + seededInt(seed + ":t", 0, 12),
        },
        roomsAvailable: { single: 8, double: 8, triple: 4 },
        validUntil: null,
      },
    ];
  }
}
