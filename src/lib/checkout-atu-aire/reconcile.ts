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
    if (!stillValid) {
      // The previously selected hotel no longer supports the current room
      // mix (e.g. party size changed and it doesn't have enough of some
      // room type) — never leave the customer with a silently-cleared
      // choice: quote.hotelOptions is already sorted valid-first then
      // cheapest (see hotelOptions.ts), so its first valid entry IS the
      // cheapest offer that DOES support the mix. Auto-select it when one
      // exists; only fall back to null when genuinely nothing does.
      const cheapestStillValid = quote.hotelOptions.find((h) => h.valid);
      next = { ...next, hotelOfferId: cheapestStillValid?.offer.id ?? null };
    }
  }
  if (next.originAirport) {
    const stillEligible = quote.eligibleOrigins.some((o) => o.iata === next.originAirport);
    if (!stillEligible) next = { ...next, originAirport: null, outboundLegId: null, returnLegId: null };
  }
  // Outbound and return are reconciled independently (§9/§10/§11) — one
  // disappearing (e.g. a preference change) never clears the other.
  if (next.outboundLegId) {
    const stillThere = quote.outboundLegs.find((l) => l.id === next.outboundLegId);
    if (!stillThere) next = { ...next, outboundLegId: null };
  }
  if (next.returnLegId) {
    const stillThere = quote.returnLegs.find((l) => l.id === next.returnLegId);
    if (!stillThere) next = { ...next, returnLegId: null };
  }

  return next;
}
