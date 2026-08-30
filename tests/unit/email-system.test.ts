import { describe, it, expect } from "vitest";
import { buildBookingEmailVariables } from "@/lib/email/bookingVariables";
import { disparadorLabel } from "@/lib/email/disparadorLabel";
import { bookingUpdateSchema, bookingActionSchema } from "@/lib/validation/schemas";

describe("buildBookingEmailVariables", () => {
  const booking = {
    reference: "CDF-ABC123",
    accessToken: "secret-token",
    buyerFirstName: "Ana",
    totalPrice: 415,
    currency: "EUR",
    travelersCount: 2,
    partySize: 2,
  };
  const trip = { name: "Manchester", homeTeam: "Manchester City", awayTeam: "Manchester United", travelMode: "A_TU_AIRE" as const };

  it("builds matchName from home/away team, never the raw trip name, when both are set", () => {
    const vars = buildBookingEmailVariables(booking, trip);
    expect(vars.matchName).toBe("Manchester City – Manchester United");
  });

  it("falls back to the trip name when there is no real matchup", () => {
    const vars = buildBookingEmailVariables(booking, { ...trip, homeTeam: "", awayTeam: "" });
    expect(vars.matchName).toBe("Manchester");
  });

  it("labels travelMode in the same copy used across the public site", () => {
    expect(buildBookingEmailVariables(booking, trip).travelMode).toBe("A TU AIRE");
    expect(buildBookingEmailVariables(booking, { ...trip, travelMode: "GROUP_CDF" }).travelMode).toBe("GRUPO CDF");
  });

  it("falls back partySize to travelersCount for GROUP_CDF bookings (partySize null)", () => {
    const vars = buildBookingEmailVariables({ ...booking, partySize: null }, { ...trip, travelMode: "GROUP_CDF" });
    expect(vars.partySize).toBe("2");
  });

  it("builds a Mi Viaje URL from the real accessToken, never an internal id or a bare reference", () => {
    const vars = buildBookingEmailVariables(booking, trip);
    expect(vars.myTripUrl).toContain("/mi-viaje/secret-token");
    expect(vars.myTripUrl).not.toContain("CDF-ABC123");
  });

  it("never invents a variable — only the documented set is present", () => {
    const vars = buildBookingEmailVariables(booking, trip);
    expect(Object.keys(vars).sort()).toEqual(
      ["bookingReference", "customerName", "matchName", "myTripUrl", "partySize", "total", "travelMode", "tripName"].sort(),
    );
  });
});

describe("disparadorLabel", () => {
  it("labels event-triggered templates distinctly from immediate ones", () => {
    expect(disparadorLabel({ timingReference: "immediate", timingDaysOffset: null })).toBe("Inmediato");
    expect(disparadorLabel({ timingReference: "event", timingDaysOffset: null })).toBe("Evento");
  });

  it("labels the 48h reminder in hours, not days", () => {
    expect(disparadorLabel({ timingReference: "before_departure", timingDaysOffset: 2 })).toBe("48 h antes del viaje");
  });

  it("labels after_return as a plain 'después del viaje'", () => {
    expect(disparadorLabel({ timingReference: "after_return", timingDaysOffset: 1 })).toBe("Después del viaje");
  });
});

describe("bookingUpdateSchema — Cambio importante opt-in", () => {
  it("defaults notifyCustomer to false — most updates are timeline-only, never an automatic email", () => {
    const result = bookingUpdateSchema.parse({ bookingId: "b_1", title: "Tu entrada está disponible." });
    expect(result.notifyCustomer).toBe(false);
  });

  it("accepts an explicit notifyCustomer: true", () => {
    const result = bookingUpdateSchema.parse({ bookingId: "b_1", title: "Cambio de horario", notifyCustomer: true });
    expect(result.notifyCustomer).toBe(true);
  });
});

describe("bookingActionSchema — unaffected by the email changes", () => {
  it("still validates a minimal real action", () => {
    const result = bookingActionSchema.safeParse({ bookingId: "b_1", type: "other", title: "Revisar algo" });
    expect(result.success).toBe(true);
  });
});
