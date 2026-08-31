import { getAppMode, getFlightProviderMode, duffelConfig } from "@/lib/env";
import type { FlightProvider } from "../types";
import { MockFlightProvider } from "./mockFlightProvider";
import { RealFlightProvider } from "./realFlightProvider";

export { MockFlightProvider, RealFlightProvider };

/**
 * Two independent ways to reach RealFlightProvider (Duffel), same
 * triple-protection shape as src/lib/payments/index.ts for the production
 * path:
 *   1. Sandbox-real, for local/dev testing (§14): APP_MODE is NOT
 *      "production", FLIGHT_PROVIDER=real is explicitly set, and Duffel
 *      credentials are configured. Demo trips are allowed here on
 *      purpose — that's the whole point of testing against Duffel TEST.
 *   2. Production-real: APP_MODE=production, credentials configured, and
 *      the trip itself isn't marked demo.
 * Anything else (the default) gets the mock provider.
 */
export function getFlightProvider(opts: { tripIsDemo: boolean }): FlightProvider {
  const sandboxReal = getAppMode() !== "production" && getFlightProviderMode() === "real" && duffelConfig.isConfigured;
  const productionReal = getAppMode() === "production" && duffelConfig.isConfigured && !opts.tripIsDemo;
  return sandboxReal || productionReal ? new RealFlightProvider() : new MockFlightProvider();
}
