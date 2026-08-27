import type { OrganizationFeeBreakdown } from "./organizationFee";

// ---------------------------------------------------------------------
// Ticket/traveler decoupling (§24-27/§161-162): a booking can carry fewer
// tickets than travelers (hotel/flight still size to the full party), in
// which case checkout needs an explicit "¿quién va al partido?" step.
// ---------------------------------------------------------------------
export function validateTicketAssignment(ticketCount: number, partySize: number): { ok: boolean; error?: string } {
  if (!Number.isInteger(ticketCount) || ticketCount < 1) {
    return { ok: false, error: "El número de entradas debe ser al menos 1" };
  }
  if (ticketCount > partySize) {
    return { ok: false, error: "No puede haber más entradas que viajeros" };
  }
  return { ok: true };
}

export function needsTicketAssignmentStep(ticketCount: number, partySize: number): boolean {
  return ticketCount < partySize;
}

// ---------------------------------------------------------------------
// Quote composition (§77-95/§161-169): net supplier cost + our
// organization fee + a configurable buffer becomes the commercial total.
// The fee/buffer/margin breakdown is INTERNAL ONLY — the customer only
// ever sees `commercialTotal` (and, optionally, a component breakdown
// that sums exactly to it, never the underlying cost or fee).
// ---------------------------------------------------------------------
export type QuoteCostInputs = {
  ticketCostNetTotal: number;
  hotelCostNetTotal: number;
  flightCostNetTotal: number;
  hostCostNetTotal: number;
};

export type QuoteBreakdown = {
  costNetTotal: number;
  orgFee: OrganizationFeeBreakdown;
  buffer: number;
  paymentMethodInternalCost: number;
  commercialTotal: number;
  estimatedProfit: number;
};

export function computeQuote(opts: {
  costs: QuoteCostInputs;
  orgFee: OrganizationFeeBreakdown;
  buffer: number;
  /** Internal cost of the chosen payment method (flat amount, already resolved from the fee-rate config) — never surfaced to the customer as a surcharge (§81). */
  paymentMethodInternalCost: number;
}): QuoteBreakdown {
  const costNetTotal = opts.costs.ticketCostNetTotal + opts.costs.hotelCostNetTotal + opts.costs.flightCostNetTotal + opts.costs.hostCostNetTotal;
  const commercialTotal = costNetTotal + opts.orgFee.total + opts.buffer;
  const estimatedProfit = opts.orgFee.total + opts.buffer - opts.paymentMethodInternalCost;

  return {
    costNetTotal,
    orgFee: opts.orgFee,
    buffer: opts.buffer,
    paymentMethodInternalCost: opts.paymentMethodInternalCost,
    commercialTotal,
    estimatedProfit,
  };
}

export function isBelowMinimumProfit(estimatedProfit: number, minimumEstimatedProfit: number): boolean {
  return estimatedProfit < minimumEstimatedProfit;
}

// ---------------------------------------------------------------------
// Explicitly-labeled-as-estimate tax preview (§85) — never a real
// accounting/tax engine, always toggleable off.
// ---------------------------------------------------------------------
export function computeTaxEstimate(commercialTotal: number, rate: number, enabled: boolean): number | null {
  if (!enabled) return null;
  return commercialTotal * rate;
}

// ---------------------------------------------------------------------
// Final revalidation before payment (§91-93): re-quote and compare against
// what the customer last saw. Any difference (stock/price/availability
// moved under them) must surface as an explicit "price changed" UX rather
// than silently charging a different amount.
// ---------------------------------------------------------------------
export function hasQuoteChanged(previous: QuoteBreakdown, current: QuoteBreakdown): boolean {
  return previous.commercialTotal !== current.commercialTotal;
}
