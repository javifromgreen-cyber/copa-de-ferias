import { getAppMode, getHotelProviderMode, nuiteeConfig } from "@/lib/env";
import { searchHotels } from "./search";

export { searchHotels } from "./search";
export { prebookOffer, evaluatePrebookChange } from "./prebook";
export { bookPrebook, generateClientReference } from "./book";
export { buildRoomingSnapshot } from "./roomingSnapshot";
export { roomMixToOccupancies } from "./occupancies";
export type * from "./types";

/**
 * Deliberately NOT a drop-in replacement for getHotelProviders()
 * (src/lib/providers/hotels/index.ts) — HotelProvider/NormalizedHotelOffer
 * model per-room-type nightly prices that combine for any mix; Nuitee
 * returns one priced combination for the exact occupancies requested, so
 * it can't honestly implement that interface (see this directory's
 * types.ts doc comment). This accessor exists for sandbox testing/manual
 * verification only — nothing in checkout calls it. Same env-driven
 * opt-in as getFlightProviderMode() (§14): HOTEL_PROVIDER=real, never in
 * APP_MODE=production.
 */
export function isRealHotelSearchEnabled(): boolean {
  return getAppMode() !== "production" && getHotelProviderMode() === "real" && nuiteeConfig.isConfigured;
}

export function getRealHotelSearch(): typeof searchHotels | null {
  return isRealHotelSearchEnabled() ? searchHotels : null;
}
