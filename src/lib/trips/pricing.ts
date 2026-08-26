import type { Trip } from "@prisma/client";

export type PriceBreakdown = {
  travelersCount: number;
  singleRooms: number;
  basePrice: number;
  baseSubtotal: number;
  singleSupplementUnit: number;
  singleSupplementSubtotal: number;
  total: number;
  currency: string;
};

/**
 * Same PVP regardless of origin city in V1 (spec §31). Total = travelers ×
 * price + singleRooms × singleSupplement.
 */
export function calculateBookingPrice(
  trip: Pick<Trip, "price" | "singleSupplement" | "currency">,
  travelersCount: number,
  singleRooms: number
): PriceBreakdown {
  const baseSubtotal = trip.price * travelersCount;
  const singleSupplementSubtotal = trip.singleSupplement * singleRooms;
  return {
    travelersCount,
    singleRooms,
    basePrice: trip.price,
    baseSubtotal,
    singleSupplementUnit: trip.singleSupplement,
    singleSupplementSubtotal,
    total: baseSubtotal + singleSupplementSubtotal,
    currency: trip.currency,
  };
}
