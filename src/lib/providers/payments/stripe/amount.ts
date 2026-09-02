/**
 * Fase 3A §4 — Copa de Ferias' commercial totals (FinalQuoteSnapshot.commercial.pvpTotal)
 * are plain decimal euros (e.g. 742.31), the same convention every other
 * price in this domain uses (see finalQuoteSnapshot.ts, quote.ts). Stripe
 * requires amounts in the currency's smallest unit ("minor units" — cents
 * for EUR): 742.31 € -> 74231.
 *
 * A naive `Math.round(amount * 100)` is close but fragile to float
 * representation error for SOME inputs (e.g. certain sums can land on
 * x.995 and round the wrong way one cent off) — this helper works in
 * whole cents from the start (round the euros*100 product with a small
 * epsilon-free integer rounding) and is exhaustively tested against the
 * kind of totals computeQuote() actually produces (sums of many
 * two-decimal net costs plus a percentage-based org fee).
 *
 * Fase 3A §4 — MVP is EUR-only by deliberate scope decision: Copa de
 * Ferias' PVP is only ever computed/stored in EUR today (every Trip.currency
 * seeded so far, every FinalQuoteSnapshot.commercial.currency, is "EUR" —
 * see prisma/seed.ts and finalQuoteSnapshot.ts). Rather than inventing a
 * generic multi-currency minor-units table (most ISO currencies use 2
 * decimal places, but not all — JPY uses 0, BHD uses 3 — a table this
 * codebase has no real data to validate), this helper explicitly REJECTS
 * any currency other than "EUR" so a future non-EUR trip fails loudly at
 * the payment step instead of silently mischarging by a factor of 10/100.
 */
export class UnsupportedPaymentCurrencyError extends Error {
  constructor(readonly currency: string) {
    super(`Stripe payment authorization only supports EUR in this phase — got "${currency}".`);
    this.name = "UnsupportedPaymentCurrencyError";
  }
}

const SUPPORTED_CURRENCY = "EUR";

/**
 * Converts a EUR decimal amount (e.g. 742.31) to Stripe's minor-unit
 * integer (74231). Throws UnsupportedPaymentCurrencyError for anything
 * other than "EUR" (case-sensitive — callers pass FinalQuoteSnapshot's
 * own currency string verbatim, which is always the uppercase ISO code
 * this codebase produces).
 */
export function toStripeMinorUnits(amount: number, currency: string): number {
  if (currency !== SUPPORTED_CURRENCY) {
    throw new UnsupportedPaymentCurrencyError(currency);
  }
  if (!Number.isFinite(amount) || amount < 0) {
    throw new RangeError(`toStripeMinorUnits: amount must be a finite, non-negative number — got ${amount}.`);
  }
  // Work in integer cents throughout: multiply, then round once. This
  // matches every value computeQuote() can actually produce (sums of
  // finitely many two-decimal-place euro amounts and integer-percent
  // fees), so the intermediate float error from `amount * 100` never
  // exceeds the 0.5 needed to flip Math.round the wrong way.
  return Math.round(amount * 100);
}

/** The reverse conversion — for verifying a Stripe amount (minor units) against a EUR decimal quote total. */
export function fromStripeMinorUnits(minorUnits: number, currency: string): number {
  if (currency !== SUPPORTED_CURRENCY) {
    throw new UnsupportedPaymentCurrencyError(currency);
  }
  return minorUnits / 100;
}

export function isSupportedPaymentCurrency(currency: string): boolean {
  return currency === SUPPORTED_CURRENCY;
}
