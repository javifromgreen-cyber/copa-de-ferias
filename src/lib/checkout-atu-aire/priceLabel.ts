import type { PriceLabel } from "./types";

/**
 * Honesty about precision (§6): "Desde" before we even know the party
 * size; "Total estimado" from the moment we know more but a required
 * component (ticket/hotel/flight) is still unpicked; "Total" only once
 * every required component is selected AND the quote has been
 * revalidated against fresh offers.
 */
export function derivePriceLabel(opts: {
  hasPartySize: boolean;
  ticketSelected: boolean;
  hotelRequired: boolean;
  hotelSelected: boolean;
  flightRequired: boolean;
  flightSelected: boolean;
  revalidated: boolean;
}): PriceLabel {
  if (!opts.hasPartySize) return "from";

  const allRequiredSelected = opts.ticketSelected && (!opts.hotelRequired || opts.hotelSelected) && (!opts.flightRequired || opts.flightSelected);

  if (allRequiredSelected && opts.revalidated) return "total";
  return "estimated";
}

export function missingSelectionLabels(opts: {
  ticketSelected: boolean;
  hotelRequired: boolean;
  hotelSelected: boolean;
  flightRequired: boolean;
  flightSelected: boolean;
}): string[] {
  const missing: string[] = [];
  if (!opts.ticketSelected) missing.push("categoría de entrada");
  if (opts.hotelRequired && !opts.hotelSelected) missing.push("hotel");
  if (opts.flightRequired && !opts.flightSelected) missing.push("vuelo");
  return missing;
}
