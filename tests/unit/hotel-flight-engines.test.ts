import { describe, it, expect } from "vitest";
import { isHotelOfferValidForMix, computeHotelOfferTotalPrice, selectHotelOffer } from "@/lib/pricing/hotelSelection";
import { computeRequiredRoomMix } from "@/lib/pricing/roomMix";
import {
  classifyDaypart,
  computeStayWindowBounds,
  isOutboundLegWithinWindow,
  isReturnLegWithinWindow,
  areFlightsBlockedByProvisionalSchedule,
  deriveEventKickoffWindow,
  CONSERVATIVE_EARLIEST_KICKOFF_HOUR,
  CONSERVATIVE_LATEST_KICKOFF_HOUR,
} from "@/lib/pricing/flightWindow";
import type { NormalizedHotelOffer, NormalizedFlightLeg } from "@/lib/providers/types";

function hotel(overrides: Partial<NormalizedHotelOffer>): NormalizedHotelOffer {
  return {
    id: "h1",
    provider: "mockA",
    name: "Test Hotel",
    stars: 4,
    zone: "Centro",
    pricePerNight: { single: 80, double: 50, triple: 40 },
    roomsAvailable: { single: 5, double: 5, triple: 5 },
    validUntil: null,
    ...overrides,
  };
}

describe("isHotelOfferValidForMix (§42-43/§158-159)", () => {
  it("rejects a hotel that can't supply the exact simultaneous room mix — no stretching", () => {
    // 6 travelers need 3 real doubles; a hotel with only 2 doubles is invalid.
    const mix = computeRequiredRoomMix(6);
    const offer = hotel({ roomsAvailable: { single: 5, double: 2, triple: 5 } });
    expect(isHotelOfferValidForMix(offer, mix)).toBe(false);
  });

  it("rejects a hotel with no triples for a party that needs one — never auto-substitutes double+single", () => {
    const mix = computeRequiredRoomMix(3); // 1 triple
    const offer = hotel({ roomsAvailable: { single: 5, double: 5, triple: 0 } });
    expect(isHotelOfferValidForMix(offer, mix)).toBe(false);
  });

  it("accepts a hotel with enough of every required room type", () => {
    const mix = computeRequiredRoomMix(7); // 1 triple + 2 double
    const offer = hotel({ roomsAvailable: { single: 0, double: 2, triple: 1 } });
    expect(isHotelOfferValidForMix(offer, mix)).toBe(true);
  });
});

describe("selectHotelOffer (§39/§160)", () => {
  it("prefers a valid-but-pricier offer over an invalid-though-cheaper one", () => {
    const mix = computeRequiredRoomMix(6); // 3 doubles
    const cheapButInvalid = hotel({ id: "cheap", provider: "mockA", pricePerNight: { single: 50, double: 30, triple: 25 }, roomsAvailable: { single: 5, double: 2, triple: 5 } });
    const pricierButValid = hotel({ id: "pricier", provider: "mockB", pricePerNight: { single: 90, double: 60, triple: 50 }, roomsAvailable: { single: 5, double: 5, triple: 5 } });

    const result = selectHotelOffer({ offers: [cheapButInvalid, pricierButValid], mix, nights: 2, strategy: "CHEAPEST_VALID" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.offer.id).toBe("pricier");
  });

  it("returns no_valid_offer when nothing can supply the room mix", () => {
    const mix = computeRequiredRoomMix(3);
    const offer = hotel({ roomsAvailable: { single: 5, double: 5, triple: 0 } });
    const result = selectHotelOffer({ offers: [offer], mix, nights: 2, strategy: "CHEAPEST_VALID" });
    expect(result.ok).toBe(false);
  });

  it("PREFERRED_PROVIDER_FIRST falls back to cheapest valid when the preferred provider has no valid offer", () => {
    const mix = computeRequiredRoomMix(3); // 1 triple
    const preferredButInvalid = hotel({ id: "a", provider: "mockA", roomsAvailable: { single: 5, double: 5, triple: 0 } });
    const fallbackValid = hotel({ id: "b", provider: "mockB", roomsAvailable: { single: 5, double: 5, triple: 3 } });
    const result = selectHotelOffer({ offers: [preferredButInvalid, fallbackValid], mix, nights: 1, strategy: "PREFERRED_PROVIDER_FIRST", preferredProviderKind: "mockA" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.offer.id).toBe("b");
  });

  it("MANUAL_OVERRIDE fails cleanly when the chosen offer isn't actually valid", () => {
    const mix = computeRequiredRoomMix(3);
    const invalid = hotel({ id: "picked", roomsAvailable: { single: 5, double: 5, triple: 0 } });
    const result = selectHotelOffer({ offers: [invalid], mix, nights: 1, strategy: "MANUAL_OVERRIDE", manualOverrideOfferId: "picked" });
    expect(result.ok).toBe(false);
  });

  it("computeHotelOfferTotalPrice multiplies by nights across the whole mix", () => {
    const mix = computeRequiredRoomMix(5); // 1 triple + 1 double
    const offer = hotel({ pricePerNight: { single: 80, double: 50, triple: 40 } });
    expect(computeHotelOfferTotalPrice(offer, mix, 2)).toBe((40 + 50) * 2);
  });
});

describe("flight window (§48-56/§171-172)", () => {
  it("classifies dayparts as mañana/mediodía/tarde/noche", () => {
    expect(classifyDaypart(new Date(2026, 0, 1, 8))).toBe("morning");
    expect(classifyDaypart(new Date(2026, 0, 1, 13))).toBe("midday");
    expect(classifyDaypart(new Date(2026, 0, 1, 17))).toBe("afternoon");
    expect(classifyDaypart(new Date(2026, 0, 1, 22))).toBe("night");
  });

  it("multi-match bounds span the earliest to latest Event, buffered on both sides", () => {
    const bounds = computeStayWindowBounds({
      eventWindows: [
        { earliestPossibleKickoff: new Date(2026, 5, 10, 20), latestPossibleKickoff: new Date(2026, 5, 10, 20) },
        { earliestPossibleKickoff: new Date(2026, 5, 15, 21), latestPossibleKickoff: new Date(2026, 5, 15, 21) },
      ],
      minimumArrivalBufferBeforeKickoffMinutes: 180,
      minimumReturnBufferAfterEventMinutes: 120,
    });
    expect(bounds.latestArrival.getTime()).toBe(new Date(2026, 5, 10, 17).getTime());
    expect(bounds.earliestReturn.getTime()).toBe(new Date(2026, 5, 15, 23).getTime());
  });

  it("Host CDF selection tightens the arrival buffer further (§63/§171)", () => {
    const window = { earliestPossibleKickoff: new Date(2026, 5, 10, 20), latestPossibleKickoff: new Date(2026, 5, 10, 20) };
    const withoutHost = computeStayWindowBounds({
      eventWindows: [window],
      minimumArrivalBufferBeforeKickoffMinutes: 180,
      minimumReturnBufferAfterEventMinutes: 120,
    });
    const withHost = computeStayWindowBounds({
      eventWindows: [window],
      minimumArrivalBufferBeforeKickoffMinutes: 180,
      minimumReturnBufferAfterEventMinutes: 120,
      extraArrivalBufferMinutes: 60,
    });
    expect(withHost.latestArrival.getTime()).toBeLessThan(withoutHost.latestArrival.getTime());
  });

  it("filters out an outbound leg that arrives after the latest allowed arrival", () => {
    const bounds = computeStayWindowBounds({
      eventWindows: [{ earliestPossibleKickoff: new Date(2026, 5, 10, 20), latestPossibleKickoff: new Date(2026, 5, 10, 20) }],
      minimumArrivalBufferBeforeKickoffMinutes: 180,
      minimumReturnBufferAfterEventMinutes: 120,
    });
    const tooLate: NormalizedFlightLeg = {
      id: "f1",
      provider: "mock",
      originAirport: "BCN",
      destinationAirport: "BEG",
      departure: new Date(2026, 5, 10, 15),
      arrival: new Date(2026, 5, 10, 18), // after 17:00 latest arrival
      pricePerPerson: 100,
      stops: 0,
    };
    expect(isOutboundLegWithinWindow(tooLate, bounds)).toBe(false);
  });

  it("filters out a return leg that departs before the earliest allowed return", () => {
    const bounds = computeStayWindowBounds({
      eventWindows: [{ earliestPossibleKickoff: new Date(2026, 5, 10, 20), latestPossibleKickoff: new Date(2026, 5, 10, 20) }],
      minimumArrivalBufferBeforeKickoffMinutes: 180,
      minimumReturnBufferAfterEventMinutes: 120,
    });
    const tooEarly: NormalizedFlightLeg = {
      id: "f2",
      provider: "mock",
      originAirport: "BEG",
      destinationAirport: "BCN",
      departure: new Date(2026, 5, 10, 21), // before the 22:00 earliest return
      arrival: new Date(2026, 5, 11, 0),
      pricePerPerson: 90,
      stops: 0,
    };
    expect(isReturnLegWithinWindow(tooEarly, bounds)).toBe(false);
  });

  it("blocks flights by default only when a match DAY is still uncertain (date_provisional), unless Admin overrides", () => {
    expect(areFlightsBlockedByProvisionalSchedule(["confirmed", "date_provisional"], false)).toBe(true);
    expect(areFlightsBlockedByProvisionalSchedule(["confirmed", "date_provisional"], true)).toBe(false);
    expect(areFlightsBlockedByProvisionalSchedule(["confirmed", "confirmed"], false)).toBe(false);
  });

  it("a known day with only the kickoff hour pending (time_provisional) never blocks by itself", () => {
    expect(areFlightsBlockedByProvisionalSchedule(["confirmed", "time_provisional"], false)).toBe(false);
    expect(areFlightsBlockedByProvisionalSchedule(["time_provisional"], false)).toBe(false);
  });

  describe("deriveEventKickoffWindow (§15-19)", () => {
    it("confirmed: both bounds equal the exact kickoff", () => {
      const kickoff = new Date(2026, 5, 10, 17, 30);
      const w = deriveEventKickoffWindow({ matchDate: new Date(2026, 5, 10, 21), kickoff, scheduleStatus: "confirmed" });
      expect(w).not.toBeNull();
      expect(w!.earliestPossibleKickoff.getTime()).toBe(kickoff.getTime());
      expect(w!.latestPossibleKickoff.getTime()).toBe(kickoff.getTime());
    });

    it("confirmed without an entered kickoff falls back to matchDate", () => {
      const matchDate = new Date(2026, 5, 10, 21);
      const w = deriveEventKickoffWindow({ matchDate, kickoff: null, scheduleStatus: "confirmed" });
      expect(w!.earliestPossibleKickoff.getTime()).toBe(matchDate.getTime());
      expect(w!.latestPossibleKickoff.getTime()).toBe(matchDate.getTime());
    });

    it("time_provisional: bounded to a conservative kickoff-hour range on the known day, never a single instant", () => {
      const matchDate = new Date(2026, 5, 13, 0, 0);
      const w = deriveEventKickoffWindow({ matchDate, kickoff: null, scheduleStatus: "time_provisional" });
      expect(w).not.toBeNull();
      expect(w!.earliestPossibleKickoff.getHours()).toBe(CONSERVATIVE_EARLIEST_KICKOFF_HOUR);
      expect(w!.latestPossibleKickoff.getHours()).toBe(CONSERVATIVE_LATEST_KICKOFF_HOUR);
      expect(w!.earliestPossibleKickoff.getDate()).toBe(matchDate.getDate());
      expect(w!.latestPossibleKickoff.getDate()).toBe(matchDate.getDate());
      expect(w!.earliestPossibleKickoff.getTime()).toBeLessThan(w!.latestPossibleKickoff.getTime());
    });

    it("date_provisional: no safe window can be derived at all", () => {
      const w = deriveEventKickoffWindow({ matchDate: new Date(2026, 5, 13), kickoff: null, scheduleStatus: "date_provisional" });
      expect(w).toBeNull();
    });
  });
});
