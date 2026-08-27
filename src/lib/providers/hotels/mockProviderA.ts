import type { HotelProvider, NormalizedHotelOffer } from "../types";
import { seededInt } from "./deterministic";

/**
 * Deterministic demo fixture — a central 4★ hotel with generous double
 * inventory but deliberately scarce triples, so a 3-traveler booking on a
 * given trip can legitimately hit "no valid offer from this provider" and
 * exercise the multi-provider fallback (§39/§160).
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
        roomsAvailable: { single: 6, double: 10, triple: 1 },
        validUntil: null,
      },
    ];
  }
}
