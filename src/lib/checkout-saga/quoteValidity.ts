/**
 * Fase 2 §22 — `latestSafePaymentAt` ("quoteValidUntil"): the latest
 * instant this attempt's quote is still safe to pay against, derived
 * CONSERVATIVELY from real, known bounds only — never an invented fixed
 * number.
 *
 * Known bounds today:
 *   - the TicketHold's own `expiresAt` (always present — a hold is only
 *     ever acquired with one). Since TicketHold.expiresAt is honored by
 *     releaseExpiredTicketHolds() even while the attempt is READY_TO_PAY
 *     (see EXPIRABLE_ATTEMPT_STATUSES in ticketHold.ts), this is a real,
 *     enforced constraint, not a cosmetic one.
 *   - the Duffel round-trip offer's own `expiresAt`, when a flight is
 *     part of the quote.
 *
 * Nuitee's PREBOOK response does NOT provide an explicit expiration (see
 * HotelPrebook in providers/hotels/nuitee/types.ts — no expiresAt field),
 * so it contributes nothing here — inventing one would be exactly the
 * kind of fabricated number this function must not produce. This means a
 * TICKET_HOTEL (no flight) attempt's latestSafePaymentAt is bounded ONLY
 * by our own TicketHold — a real limitation: nothing here can promise the
 * hotel price/availability is still valid right up to that instant. A
 * future PAGAR click (Fase 3) must still explicitly re-validate the hotel
 * prebook before charging, regardless of this timestamp.
 */
export function computeLatestSafePaymentAt(bounds: { ticketHoldExpiresAt: Date; flightExpiresAt?: Date | null }): Date {
  const candidates = [bounds.ticketHoldExpiresAt];
  if (bounds.flightExpiresAt) candidates.push(bounds.flightExpiresAt);
  return new Date(Math.min(...candidates.map((d) => d.getTime())));
}
