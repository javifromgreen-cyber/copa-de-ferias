import type { TicketCategoryOption } from "./types";

type RawTicketOffer = { id: string; category: string; sector: string; costNet: number; restrictions: string };

/**
 * Ticket categories are shown for the product's primary Event only —
 * every other Event (a second match on the same trip) automatically uses
 * its own cheapest active offer, so the customer makes exactly one
 * "Entrada" decision (matches the spec's single-step flow) while every
 * match still gets a real ticket costed into the total.
 */
export function buildTicketCategoryOptions(primaryEventOffers: RawTicketOffer[], otherEventsCheapestCostSum: number): TicketCategoryOption[] {
  if (primaryEventOffers.length === 0) return [];

  const withTotals = primaryEventOffers.map((o) => ({
    category: o.category,
    sector: o.sector,
    restrictions: o.restrictions,
    totalCostNetPerPerson: o.costNet + otherEventsCheapestCostSum,
  }));

  const cheapest = Math.min(...withTotals.map((o) => o.totalCostNetPerPerson));

  return withTotals
    .map((o) => ({ ...o, deltaFromCheapest: o.totalCostNetPerPerson - cheapest }))
    .sort((a, b) => a.totalCostNetPerPerson - b.totalCostNetPerPerson);
}

export function cheapestOfferCost(offers: RawTicketOffer[]): number {
  if (offers.length === 0) return 0;
  return Math.min(...offers.map((o) => o.costNet));
}
