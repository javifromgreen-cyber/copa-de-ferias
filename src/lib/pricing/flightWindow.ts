import type { Daypart, NormalizedFlightOffer } from "@/lib/providers/types";

export function classifyDaypart(date: Date): Daypart {
  const h = date.getHours();
  if (h >= 6 && h < 12) return "morning"; // mañana
  if (h >= 12 && h < 15) return "midday"; // mediodía
  if (h >= 15 && h < 20) return "afternoon"; // tarde
  return "night"; // noche
}

export type StayWindowBounds = {
  /** Outbound flight must arrive at or before this instant. */
  latestArrival: Date;
  /** Return flight must depart at or after this instant. */
  earliestReturn: Date;
};

/**
 * Multi-match products use the earliest/latest Event as the constraint
 * bounds (§56). Selecting Host CDF tightens the arrival side further via
 * `extraArrivalBufferMinutes` (§63/§171) — 0 when no Host is selected.
 */
export function computeStayWindowBounds(opts: {
  eventDates: Date[];
  minimumArrivalBufferBeforeKickoffMinutes: number;
  minimumReturnBufferAfterEventMinutes: number;
  extraArrivalBufferMinutes?: number;
}): StayWindowBounds {
  if (opts.eventDates.length === 0) {
    throw new Error("computeStayWindowBounds requires at least one event date");
  }
  const times = opts.eventDates.map((d) => d.getTime());
  const earliest = new Date(Math.min(...times));
  const latest = new Date(Math.max(...times));

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
 * TICKET_HOTEL_FLIGHT is blocked by default whenever any of the trip's
 * Events still has scheduleStatus "provisional" — a kickoff that can still
 * move shouldn't let a customer lock in flights against it — unless Admin
 * has explicitly overridden that guard for this product (§20/§172).
 */
export function areFlightsBlockedByProvisionalSchedule(eventScheduleStatuses: Array<"confirmed" | "provisional">, adminOverride: boolean): boolean {
  const hasProvisional = eventScheduleStatuses.some((s) => s === "provisional");
  return hasProvisional && !adminOverride;
}
