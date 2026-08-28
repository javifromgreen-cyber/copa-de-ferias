import { flightApiConfig } from "@/lib/env";
import type { FlightProvider, NormalizedFlightOffer, OriginOption } from "../types";

/**
 * Stub for a real flight-search integration. Must NEVER fire a real
 * request without credentials configured (see src/lib/env.ts,
 * flightApiConfig) — mirrors the payments-provider triple-gate pattern.
 * No vendor SDK, endpoint or credential format is implemented here; wiring
 * a specific provider is explicitly out of scope for this V1 pass.
 */
export class RealFlightProvider implements FlightProvider {
  readonly kind = "real";

  async listDirectOrigins(): Promise<OriginOption[]> {
    if (!flightApiConfig.isConfigured) {
      return [];
    }
    throw new Error("RealFlightProvider is not implemented — no live flight-search integration exists in this app yet.");
  }

  async getOffers(): Promise<NormalizedFlightOffer[]> {
    if (!flightApiConfig.isConfigured) {
      return [];
    }
    throw new Error("RealFlightProvider is not implemented — no live flight-search integration exists in this app yet.");
  }
}
