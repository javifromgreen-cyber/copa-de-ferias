import type { Daypart, NormalizedFlightOffer } from "@/lib/providers/types";
import type { ScheduleStatus } from "@prisma/client";

export function classifyDaypart(date: Date): Daypart {
  const h = date.getHours();
  if (h >= 6 && h < 12) return "morning"; // mañana
  if (h >= 12 && h < 15) return "midday"; // mediodía
  if (h >= 15 && h < 20) return "afternoon"; // tarde
  return "night"; // noche
}

// A reasonable range of kickoff hours for a football match when the exact
// time hasn't been fixed yet (day known, hour TBD) — wide enough to cover
// realistic early and late kickoffs, used to build a flight-viability
// window that stays safe no matter which hour within it the match ends up
// at (§15-18). Not meant to be exact — just conservative.
export const CONSERVATIVE_EARLIEST_KICKOFF_HOUR = 12;
export const CONSERVATIVE_LATEST_KICKOFF_HOUR = 21;

export type EventKickoffWindow = {
  /** The earliest instant this Event could realistically kick off at. */
  earliestPossibleKickoff: Date;
  /** The latest instant this Event could realistically kick off at. */
  latestPossibleKickoff: Date;
};

/**
 * The window of possible kickoff instants for one Event — never a single
 * assumed instant when the real kickoff isn't known yet:
 *  - confirmed: the exact kickoff (falls back to matchDate only if kickoff
 *    itself was never entered) — both bounds equal that one instant.
 *  - time_provisional: the day is certain (matchDate) but the hour isn't —
 *    bounded to a conservative reasonable-kickoff-hour range on that day,
 *    so a flight only needs to be safe against the day's realistic
 *    extremes, not against every theoretical hour.
 *  - date_provisional: not even the day is certain — no safe window can be
 *    derived at all, so this returns null and the caller must block flight
 *    selection explicitly rather than guess.
 */
export function deriveEventKickoffWindow(event: { matchDate: Date; kickoff: Date | null; scheduleStatus: ScheduleStatus }): EventKickoffWindow | null {
  if (event.scheduleStatus === "date_provisional") return null;

  if (event.scheduleStatus === "confirmed") {
    const instant = event.kickoff ?? event.matchDate;
    return { earliestPossibleKickoff: instant, latestPossibleKickoff: instant };
  }

  // time_provisional
  const earliestPossibleKickoff = new Date(event.matchDate);
  earliestPossibleKickoff.setHours(CONSERVATIVE_EARLIEST_KICKOFF_HOUR, 0, 0, 0);
  const latestPossibleKickoff = new Date(event.matchDate);
  latestPossibleKickoff.setHours(CONSERVATIVE_LATEST_KICKOFF_HOUR, 0, 0, 0);
  return { earliestPossibleKickoff, latestPossibleKickoff };
}

export type StayWindowBounds = {
  /** Outbound flight must arrive at or before this instant. */
  latestArrival: Date;
  /** Return flight must depart at or after this instant. */
  earliestReturn: Date;
};

/**
 * Multi-match products use the earliest/latest possible kickoff across all
 * their Events as the constraint bounds (§56) — each Event contributes its
 * own window (a single instant when confirmed, a conservative range when
 * only the day is confirmed), so one still-provisional kickoff time on a
 * known day never has to block the whole product, it just widens its own
 * corner of the combined window. Selecting Host CDF tightens the arrival
 * side further via `extraArrivalBufferMinutes` (§63/§171) — 0 when no Host
 * is selected.
 */
export function computeStayWindowBounds(opts: {
  eventWindows: EventKickoffWindow[];
  minimumArrivalBufferBeforeKickoffMinutes: number;
  minimumReturnBufferAfterEventMinutes: number;
  extraArrivalBufferMinutes?: number;
}): StayWindowBounds {
  if (opts.eventWindows.length === 0) {
    throw new Error("computeStayWindowBounds requires at least one event window");
  }
  const earliest = new Date(Math.min(...opts.eventWindows.map((w) => w.earliestPossibleKickoff.getTime())));
  const latest = new Date(Math.max(...opts.eventWindows.map((w) => w.latestPossibleKickoff.getTime())));

  const arrivalBufferMs = (opts.minimumArrivalBufferBeforeKickoffMinutes + (opts.extraArrivalBufferMinutes ?? 0)) * 60_000;
  const returnBufferMs = opts.minimumReturnBufferAfterEventMinutes * 60_000;

  return {
    latestArrival: new Date(earliest.getTime() - arrivalBufferMs),
    earliestReturn: new Date(latest.getTime() + returnBufferMs),
  };
}

export function isFlightOfferWithinWindow(offer: NormalizedFlightOffer, bounds: StayWindowBounds): boolean {
  return offer.outboundArrival.getTime() <= bounds.latestArrival.getTime() && offer.returnDeparture.getTime() >= bounds.earliestReturn.getTime();
}

export function filterFlightOffersByWindow(offers: NormalizedFlightOffer[], bounds: StayWindowBounds): NormalizedFlightOffer[] {
  return offers.filter((o) => isFlightOfferWithinWindow(o, bounds));
}

export function matchesDaypartPreference(offer: NormalizedFlightOffer, outboundDaypart?: Daypart, returnDaypart?: Daypart): boolean {
  if (outboundDaypart && classifyDaypart(offer.outboundDeparture) !== outboundDaypart) return false;
  if (returnDaypart && classifyDaypart(offer.returnDeparture) !== returnDaypart) return false;
  return true;
}

/**
 * TICKET_HOTEL_FLIGHT is blocked outright only when a trip Event's match
 * DAY itself is still uncertain (date_provisional) — no safe window can be
 * built at all in that case. A confirmed day with only the kickoff HOUR
 * still pending (time_provisional) never blocks; deriveEventKickoffWindow
 * instead widens that Event's contribution to a conservative range, so
 * flight selection stays open with a genuinely-safe subset of offers
 * (§15/§16/§19) — unless Admin has explicitly overridden the guard for
 * this product (§20/§172).
 */
export function areFlightsBlockedByProvisionalSchedule(eventScheduleStatuses: ScheduleStatus[], adminOverride: boolean): boolean {
  const hasDateProvisional = eventScheduleStatuses.some((s) => s === "date_provisional");
  return hasDateProvisional && !adminOverride;
}
