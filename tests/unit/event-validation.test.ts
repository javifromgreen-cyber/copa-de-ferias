import { describe, it, expect } from "vitest";
import { validateEventPublishable, validateTripPublishable } from "@/lib/events/validation";
import { parseAvailablePackageTypes, ALL_PACKAGE_TYPES } from "@/lib/pricing/packageTypes";

describe("parseAvailablePackageTypes", () => {
  it("parses a full CSV into all three package types", () => {
    expect(parseAvailablePackageTypes("TICKET_ONLY,TICKET_HOTEL,TICKET_HOTEL_FLIGHT")).toEqual(ALL_PACKAGE_TYPES);
  });

  it("ignores unknown values and trims whitespace", () => {
    expect(parseAvailablePackageTypes(" TICKET_ONLY , made_up , TICKET_HOTEL")).toEqual(["TICKET_ONLY", "TICKET_HOTEL"]);
  });

  it("returns an empty list for an empty string", () => {
    expect(parseAvailablePackageTypes("")).toEqual([]);
  });
});

describe("validateEventPublishable", () => {
  const base = { competitionId: "comp_1", homeTeam: "Ajax", awayTeam: "Feyenoord", stadium: "Johan Cruyff ArenA" };

  it("accepts a fully classified event", () => {
    expect(validateEventPublishable(base)).toEqual({ ok: true });
  });

  it("rejects an event with no competition assigned", () => {
    const result = validateEventPublishable({ ...base, competitionId: null });
    expect(result.ok).toBe(false);
  });

  it("rejects missing teams or stadium", () => {
    expect(validateEventPublishable({ ...base, homeTeam: "" }).ok).toBe(false);
    expect(validateEventPublishable({ ...base, stadium: "" }).ok).toBe(false);
  });
});

describe("validateTripPublishable", () => {
  it("never blocks a GROUP_CDF trip — unchanged legacy behavior", () => {
    const result = validateTripPublishable({ travelMode: "GROUP_CDF", eventsCount: 0, availablePackageTypes: "" });
    expect(result).toEqual({ ok: true });
  });

  it("blocks an A_TU_AIRE product with no events", () => {
    const result = validateTripPublishable({ travelMode: "A_TU_AIRE", eventsCount: 0, availablePackageTypes: "TICKET_ONLY" });
    expect(result.ok).toBe(false);
  });

  it("blocks an A_TU_AIRE product with no available package types", () => {
    const result = validateTripPublishable({ travelMode: "A_TU_AIRE", eventsCount: 1, availablePackageTypes: "" });
    expect(result.ok).toBe(false);
  });

  it("accepts a fully configured A_TU_AIRE product", () => {
    const result = validateTripPublishable({ travelMode: "A_TU_AIRE", eventsCount: 1, availablePackageTypes: "TICKET_ONLY" });
    expect(result).toEqual({ ok: true });
  });
});
