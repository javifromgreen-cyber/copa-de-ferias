import { getAppMode, flightApiConfig } from "@/lib/env";
import type { FlightProvider } from "../types";
import { MockFlightProvider } from "./mockFlightProvider";
import { RealFlightProvider } from "./realFlightProvider";

export { MockFlightProvider, RealFlightProvider };

/**
 * Same triple-protection shape as src/lib/payments/index.ts: real flight
 * search is only reachable in APP_MODE=production, for a non-demo trip,
 * with credentials configured — a demo trip always gets the mock provider.
 */
export function getFlightProvider(opts: { tripIsDemo: boolean }): FlightProvider {
  const liveAllowed = getAppMode() === "production" && flightApiConfig.isConfigured && !opts.tripIsDemo;
  return liveAllowed ? new RealFlightProvider() : new MockFlightProvider();
}
