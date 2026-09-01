import { duffelConfig } from "@/lib/env";
import type { FlightProvider, NormalizedFlightLeg, OriginOption } from "../types";
import { searchDirectOneWayOffers } from "./duffel/search";
import type { FlightOffer } from "./duffel/types";
import { SUPPORTED_SPANISH_FLIGHT_ORIGINS } from "@/lib/checkout-atu-aire/spanishFlightOrigins";

/** @deprecated use SUPPORTED_SPANISH_FLIGHT_ORIGINS (src/lib/checkout-atu-aire/spanishFlightOrigins.ts) directly — kept as a re-export so existing imports don't break. */
export const CANDIDATE_SPANISH_ORIGINS = SUPPORTED_SPANISH_FLIGHT_ORIGINS;

const SINGLE_ADULT = 1;

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function toNormalizedLeg(offer: FlightOffer, originAirport: string, destinationAirport: string): NormalizedFlightLeg {
  const segment = offer.segments[0];
  return {
    id: `duffel:${offer.offerId}`,
    provider: "duffel",
    originAirport,
    destinationAirport,
    departure: segment.departingAt,
    arrival: segment.arrivingAt,
    pricePerPerson: offer.totalAmount / SINGLE_ADULT,
    stops: 0,
  };
}

/**
 * Duffel-backed implementation of FlightProvider — see
 * src/lib/providers/flights/duffel/ for the real search/revalidate/order
 * adapter and its own normalized types (FlightOffer, FlightSearchResult,
 * FlightRevalidation). This class exists to translate that into
 * NormalizedFlightLeg, the shape the existing checkout engine
 * (src/lib/checkout-atu-aire/flightOptions.ts and flightWindow.ts)
 * already filters/sorts/displays — nothing about that engine changes.
 *
 * Per the FlightProvider contract, both methods never throw: any Duffel
 * failure (missing credentials, timeout, malformed response, genuinely no
 * route) degrades to [] just like "no route exists" already did for the
 * mock, and is logged server-side for diagnosis.
 */
export class RealFlightProvider implements FlightProvider {
  readonly kind = "duffel";

  async listEligibleDirectOriginsForTrip(params: { destinationAirport: string; outboundDate: Date; returnDate: Date }): Promise<OriginOption[]> {
    if (!duffelConfig.isConfigured) return [];
    const eligible: OriginOption[] = [];
    for (const origin of SUPPORTED_SPANISH_FLIGHT_ORIGINS) {
      try {
        const [outbound, inbound] = await Promise.all([
          searchDirectOneWayOffers({ originIata: origin.iata, destinationIata: params.destinationAirport, date: toIsoDate(params.outboundDate), passengers: SINGLE_ADULT }),
          searchDirectOneWayOffers({ originIata: params.destinationAirport, destinationIata: origin.iata, date: toIsoDate(params.returnDate), passengers: SINGLE_ADULT }),
        ]);
        if (outbound.offers.length > 0 && inbound.offers.length > 0) eligible.push(origin);
      } catch (err) {
        console.error(`[duffel] listEligibleDirectOriginsForTrip failed for origin ${origin.iata}:`, err instanceof Error ? err.message : err);
      }
    }
    return eligible;
  }

  async getLegs(params: { originAirport: string; destinationAirport: string; date: Date }): Promise<NormalizedFlightLeg[]> {
    if (!duffelConfig.isConfigured) return [];
    try {
      const result = await searchDirectOneWayOffers({ originIata: params.originAirport, destinationIata: params.destinationAirport, date: toIsoDate(params.date), passengers: SINGLE_ADULT });
      return result.offers.map((offer) => toNormalizedLeg(offer, params.originAirport, params.destinationAirport));
    } catch (err) {
      console.error(`[duffel] getLegs failed for ${params.originAirport}->${params.destinationAirport}:`, err instanceof Error ? err.message : err);
      return [];
    }
  }
}
