/**
 * Reproduces the exact check-in/check-out window the checkout used to
 * query hotel providers (see getAtuAireCheckoutQuote in
 * src/server/actions/atu-aire-checkout.ts: checkIn = earliest match date
 * - 1 day, checkOut = latest match date + 1 day) — a pure function of the
 * trip's own Event dates, never the customer's "nights" selection, so this
 * is a faithful redisplay, not a new derivation.
 */
export function deriveHotelWindow(eventMatchDates: Date[]): { checkIn: Date; checkOut: Date } {
  const sorted = [...eventMatchDates].sort((a, b) => a.getTime() - b.getTime());
  const earliest = sorted[0];
  const latest = sorted[sorted.length - 1];
  const checkIn = new Date(earliest);
  checkIn.setDate(checkIn.getDate() - 1);
  const checkOut = new Date(latest);
  checkOut.setDate(checkOut.getDate() + 1);
  return { checkIn, checkOut };
}
