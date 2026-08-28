import { prisma } from "@/lib/db";
import { computeTicketOnlyFromPricePerPerson } from "@/lib/checkout-atu-aire/publicPrice";
import type { TravelMode } from "@prisma/client";

type TripFromPriceInput = {
  id: string;
  travelMode: TravelMode;
  price: number;
  orgFeeTicketOnlyOverride: number | null;
  orgFeeHotelTiersOverride: string;
  orgFeeHotelFlightTiersOverride: string;
  additionalMatchFeeOverride: number | null;
};

/**
 * The public "DESDE X €" figure for a card or ficha, for any trip — ticket
 * only, never hotel/flight (§7): GROUP_CDF trips already sell a single flat
 * per-person price, so that IS the figure; A_TU_AIRE trips have no fixed
 * price, so it's the cheapest real TICKET_ONLY combination, via the same
 * commercial engine the checkout uses (never hardcoded, never duplicated
 * logic — see computeTicketOnlyFromPricePerPerson). null only when an
 * A_TU_AIRE trip genuinely has no active ticket offer yet.
 *
 * Batched: fetches the shared OrganizationFeeConfig singleton once, then
 * each A_TU_AIRE trip's published Events + active TicketOffers in
 * parallel — safe to call with the whole catalog, not just one trip.
 */
export async function attachFromPrices<T extends TripFromPriceInput>(trips: T[]): Promise<Map<string, number | null>> {
  const result = new Map<string, number | null>();
  const atuAireTrips = trips.filter((t) => t.travelMode === "A_TU_AIRE");
  for (const trip of trips) {
    // A GROUP_CDF trip with no price configured yet (price <= 0) has no
    // real "desde" figure to show — treat it the same as an A_TU_AIRE trip
    // with no active offer, never as a literal "Desde 0 €" (§7).
    if (trip.travelMode !== "A_TU_AIRE") result.set(trip.id, trip.price > 0 ? trip.price : null);
  }
  if (atuAireTrips.length === 0) return result;

  const feeConfig = await prisma.organizationFeeConfig.upsert({ where: { id: "default" }, create: { id: "default" }, update: {} });

  await Promise.all(
    atuAireTrips.map(async (trip) => {
      const events = await prisma.event.findMany({
        where: { tripId: trip.id, status: "published" },
        include: { ticketOffers: { where: { active: true } } },
      });
      result.set(
        trip.id,
        computeTicketOnlyFromPricePerPerson({
          events: events.map((e) => ({ id: e.id })),
          ticketOffersByEventId: Object.fromEntries(events.map((e) => [e.id, e.ticketOffers.map((o) => ({ costNet: o.costNet }))])),
          feeConfig: {
            feeTicketOnly: feeConfig.feeTicketOnly,
            feeHotelTiers: feeConfig.feeHotelTiers,
            feeHotelFlightTiers: feeConfig.feeHotelFlightTiers,
            additionalMatchFee: feeConfig.additionalMatchFee,
          },
          tripOverrides: {
            orgFeeTicketOnlyOverride: trip.orgFeeTicketOnlyOverride,
            orgFeeHotelTiersOverride: trip.orgFeeHotelTiersOverride,
            orgFeeHotelFlightTiersOverride: trip.orgFeeHotelFlightTiersOverride,
            additionalMatchFeeOverride: trip.additionalMatchFeeOverride,
          },
        }),
      );
    }),
  );

  return result;
}

/** Single-trip convenience wrapper over attachFromPrices, for the ficha page. */
export async function computeTripFromPrice(trip: TripFromPriceInput): Promise<number | null> {
  const prices = await attachFromPrices([trip]);
  return prices.get(trip.id) ?? null;
}
