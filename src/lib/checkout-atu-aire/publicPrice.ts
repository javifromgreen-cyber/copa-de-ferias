import { computeOrganizationFee, type OrganizationFeeGlobalConfig, type OrganizationFeeTripOverrides } from "@/lib/pricing/organizationFee";

export type TicketOnlyFromPriceInput = {
  events: { id: string }[];
  ticketOffersByEventId: Record<string, { costNet: number }[]>;
  feeConfig: OrganizationFeeGlobalConfig;
  tripOverrides: OrganizationFeeTripOverrides;
};

/**
 * The single "Desde X €/persona" figure shown on a trip's public ficha
 * (§8) — always the cheapest valid TICKET_ONLY combination (cheapest
 * TicketOffer per Event + the TICKET_ONLY organization fee), computed
 * through the same commercial engine the checkout itself uses. Never the
 * hotel- or flight-inclusive modality, and never hardcoded: null only
 * when an Event genuinely has no active TicketOffer yet.
 */
export function computeTicketOnlyFromPricePerPerson(input: TicketOnlyFromPriceInput): number | null {
  if (input.events.length === 0) return null;

  let ticketTotal = 0;
  for (const event of input.events) {
    const offers = input.ticketOffersByEventId[event.id] ?? [];
    if (offers.length === 0) return null;
    ticketTotal += Math.min(...offers.map((o) => o.costNet));
  }

  const fee = computeOrganizationFee({
    packageType: "TICKET_ONLY",
    partySize: 1,
    matchCount: input.events.length,
    global: input.feeConfig,
    overrides: input.tripOverrides,
  });

  return ticketTotal + fee.total;
}
