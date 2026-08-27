import type { HotelProvider } from "../types";
import { MockHotelProviderA } from "./mockProviderA";
import { MockHotelProviderB } from "./mockProviderB";

export { MockHotelProviderA, MockHotelProviderB };

/** All hotel providers to quote against — a real provider is added here once one exists. */
export function getHotelProviders(): HotelProvider[] {
  return [new MockHotelProviderA(), new MockHotelProviderB()];
}
