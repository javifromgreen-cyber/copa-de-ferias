import type { AtuAireQuote, AtuAireSelection } from "./types";

/**
 * Reconciles a selection against a freshly-fetched quote: a choice that
 * depended on something that changed (party size invalidating a hotel, an
 * origin/preference change dropping a concrete flight offer) is cleared —
 * every other selection survives untouched (§15/§21). Returns the same
 * object reference when nothing needs to change, so callers can skip a
 * refetch.
 */
export function reconcileSelection(selection: AtuAireSelection, quote: AtuAireQuote): AtuAireSelection {
  let next = selection;

  if (next.hotelOfferId) {
    const stillValid = quote.hotelOptions.find((h) => h.offer.id === next.hotelOfferId && h.valid);
    if (!stillValid) next = { ...next, hotelOfferId: null };
  }
  if (next.originAirport) {
    const stillEligible = quote.eligibleOrigins.some((o) => o.iata === next.originAirport);
    if (!stillEligible) next = { ...next, originAirport: null, flightOfferId: null };
  }
  if (next.flightOfferId) {
    const stillThere = quote.flightOffers.find((f) => f.id === next.flightOfferId);
    if (!stillThere) next = { ...next, flightOfferId: null };
  }

  return next;
}
