import type { TicketCategoryOption } from "./types";

export type RawTicketOffer = { id: string; category: string; sector: string; costNet: number; restrictions: string };

/**
 * Every Event in a multi-match product gets its own ticket-category
 * selection — no Event's ticket is ever chosen silently on the
 * customer's behalf (§17/§18). Called once per Event; the UI renders one
 * of these lists under each match's own heading (§21).
 */
export function buildTicketCategoryOptionsForEvent(offers: RawTicketOffer[]): TicketCategoryOption[] {
  if (offers.length === 0) return [];

  const cheapest = Math.min(...offers.map((o) => o.costNet));

  return offers
    .map((o) => ({
      category: o.category,
      sector: o.sector,
      restrictions: o.restrictions,
      totalCostNetPerPerson: o.costNet,
      deltaFromCheapest: o.costNet - cheapest,
    }))
    .sort((a, b) => a.totalCostNetPerPerson - b.totalCostNetPerPerson);
}

export function cheapestOfferCost(offers: RawTicketOffer[]): number {
  if (offers.length === 0) return 0;
  return Math.min(...offers.map((o) => o.costNet));
}
