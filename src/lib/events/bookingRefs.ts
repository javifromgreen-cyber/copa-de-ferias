import { parsePriceBreakdownSnapshot } from "@/lib/mi-viaje/atuAireSnapshots";

/**
 * Whether any real booking on this event's trip already bought a ticket
 * for this specific event — read from the frozen priceBreakdownSnapshot
 * (Booking has no FK to Event, only to Trip). Used to block a destructive
 * delete (admin-events.ts deleteEvent) and to warn Admin before editing an
 * event that customers already purchased against (§11/§37).
 */
export function eventHasBookings(eventId: string, bookings: Array<{ priceBreakdownSnapshot: string }>): boolean {
  return bookings.some((b) => {
    const snapshot = parsePriceBreakdownSnapshot(b.priceBreakdownSnapshot);
    return snapshot ? Object.keys(snapshot.ticketSelections).includes(eventId) : false;
  });
}
