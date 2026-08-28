import type { PriceLabel } from "./types";

/**
 * Honesty about precision (§6): "Desde" before we even know the party
 * size; "Total estimado" from the moment we know more but a required
 * component (tickets/hotel/origin airport/flight) is still unpicked;
 * "Total" only once every required component is selected AND the quote
 * has been revalidated against fresh offers.
 */
export function derivePriceLabel(opts: {
  hasPartySize: boolean;
  ticketsSelected: boolean;
  hotelRequired: boolean;
  hotelSelected: boolean;
  flightRequired: boolean; // pass false when flights are provisional-blocked — that's surfaced separately
  originRequired: boolean;
  originSelected: boolean;
  // Ida and vuelta are independent selections (§9/§10) — both must be made
  // before the price can be a real "total", never just one leg.
  outboundFlightSelected: boolean;
  returnFlightSelected: boolean;
  revalidated: boolean;
}): PriceLabel {
  if (!opts.hasPartySize) return "from";

  const allRequiredSelected =
    opts.ticketsSelected &&
    (!opts.hotelRequired || opts.hotelSelected) &&
    (!opts.flightRequired || (opts.originRequired ? opts.originSelected : true)) &&
    (!opts.flightRequired || (opts.outboundFlightSelected && opts.returnFlightSelected));

  if (allRequiredSelected && opts.revalidated) return "total";
  return "estimated";
}

export function missingSelectionLabels(opts: {
  ticketsSelected: boolean;
  hotelRequired: boolean;
  hotelSelected: boolean;
  flightRequired: boolean; // pass false when blocked — caller adds its own explicit reason
  originRequired: boolean;
  originSelected: boolean;
  outboundFlightSelected: boolean;
  returnFlightSelected: boolean;
}): string[] {
  const missing: string[] = [];
  if (!opts.ticketsSelected) missing.push("entradas");
  if (opts.hotelRequired && !opts.hotelSelected) missing.push("hotel");
  if (opts.originRequired && !opts.originSelected) missing.push("aeropuerto de salida");
  if (opts.flightRequired && opts.originSelected && !opts.outboundFlightSelected) missing.push("vuelo de ida");
  if (opts.flightRequired && opts.originSelected && !opts.returnFlightSelected) missing.push("vuelo de vuelta");
  return missing;
}
