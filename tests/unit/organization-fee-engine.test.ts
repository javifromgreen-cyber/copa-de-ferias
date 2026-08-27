import { describe, it, expect } from "vitest";
import { isValidPartySize, MIN_PARTY_SIZE, MAX_PARTY_SIZE } from "@/lib/pricing/partySize";
import { computeRequiredRoomMix, roomMixCapacity } from "@/lib/pricing/roomMix";
import { computeOrganizationFee, NO_OVERRIDES, type OrganizationFeeGlobalConfig } from "@/lib/pricing/organizationFee";

describe("partySize", () => {
  it("accepts 1 through 10", () => {
    for (let n = MIN_PARTY_SIZE; n <= MAX_PARTY_SIZE; n++) expect(isValidPartySize(n)).toBe(true);
  });

  it("rejects 0 and 11+", () => {
    expect(isValidPartySize(0)).toBe(false);
    expect(isValidPartySize(11)).toBe(false);
    expect(isValidPartySize(-1)).toBe(false);
    expect(isValidPartySize(2.5)).toBe(false);
  });
});

describe("computeRequiredRoomMix", () => {
  it("matches the exact spec table (§41/§157)", () => {
    expect(computeRequiredRoomMix(1)).toEqual([{ type: "single", count: 1 }]);
    expect(computeRequiredRoomMix(2)).toEqual([{ type: "double", count: 1 }]);
    expect(computeRequiredRoomMix(3)).toEqual([{ type: "triple", count: 1 }]);
    expect(computeRequiredRoomMix(4)).toEqual([{ type: "double", count: 2 }]);
    expect(computeRequiredRoomMix(5)).toEqual([
      { type: "triple", count: 1 },
      { type: "double", count: 1 },
    ]);
    expect(computeRequiredRoomMix(6)).toEqual([{ type: "double", count: 3 }]);
    expect(computeRequiredRoomMix(7)).toEqual([
      { type: "triple", count: 1 },
      { type: "double", count: 2 },
    ]);
    expect(computeRequiredRoomMix(8)).toEqual([{ type: "double", count: 4 }]);
    expect(computeRequiredRoomMix(9)).toEqual([
      { type: "triple", count: 1 },
      { type: "double", count: 3 },
    ]);
    expect(computeRequiredRoomMix(10)).toEqual([{ type: "double", count: 5 }]);
  });

  it("every mix has exactly enough capacity for the party size, never more", () => {
    for (let n = 1; n <= 10; n++) {
      expect(roomMixCapacity(computeRequiredRoomMix(n))).toBe(n);
    }
  });

  it("rejects out-of-range party sizes", () => {
    expect(() => computeRequiredRoomMix(0)).toThrow();
    expect(() => computeRequiredRoomMix(11)).toThrow();
  });
});

describe("computeOrganizationFee", () => {
  const global: OrganizationFeeGlobalConfig = {
    feeTicketOnly: 49,
    feeHotelTiers: JSON.stringify([
      { minParty: 1, maxParty: 2, feePerTraveler: 99 },
      { minParty: 3, maxParty: 4, feePerTraveler: 94 },
      { minParty: 5, maxParty: 6, feePerTraveler: 89 },
      { minParty: 7, maxParty: 10, feePerTraveler: 84 },
    ]),
    feeHotelFlightTiers: JSON.stringify([
      { minParty: 1, maxParty: 2, feePerTraveler: 159 },
      { minParty: 3, maxParty: 4, feePerTraveler: 149 },
      { minParty: 5, maxParty: 6, feePerTraveler: 139 },
      { minParty: 7, maxParty: 10, feePerTraveler: 129 },
    ]),
    additionalMatchFee: 25,
  };

  it("TICKET_ONLY is a flat 49€/traveler regardless of party size (§71/§163)", () => {
    for (const partySize of [1, 4, 10]) {
      const result = computeOrganizationFee({ packageType: "TICKET_ONLY", partySize, matchCount: 1, global, overrides: NO_OVERRIDES });
      expect(result.feePerTraveler).toBe(49);
      expect(result.total).toBe(49 * partySize);
    }
  });

  it("TICKET_HOTEL follows the party-size tiers (§72/§164)", () => {
    expect(computeOrganizationFee({ packageType: "TICKET_HOTEL", partySize: 2, matchCount: 1, global, overrides: NO_OVERRIDES }).feePerTraveler).toBe(99);
    expect(computeOrganizationFee({ packageType: "TICKET_HOTEL", partySize: 4, matchCount: 1, global, overrides: NO_OVERRIDES }).feePerTraveler).toBe(94);
    expect(computeOrganizationFee({ packageType: "TICKET_HOTEL", partySize: 6, matchCount: 1, global, overrides: NO_OVERRIDES }).feePerTraveler).toBe(89);
    expect(computeOrganizationFee({ packageType: "TICKET_HOTEL", partySize: 10, matchCount: 1, global, overrides: NO_OVERRIDES }).feePerTraveler).toBe(84);
  });

  it("TICKET_HOTEL_FLIGHT, 4 travelers, 2 matches totals exactly 696€ (§74/§166 worked example)", () => {
    const result = computeOrganizationFee({ packageType: "TICKET_HOTEL_FLIGHT", partySize: 4, matchCount: 2, global, overrides: NO_OVERRIDES });
    expect(result.baseFeeTotal).toBe(149 * 4);
    expect(result.additionalMatchFeeTotal).toBe(25 * 4);
    expect(result.total).toBe(696);
  });

  it("a single-match booking never adds an additional-match fee", () => {
    const result = computeOrganizationFee({ packageType: "TICKET_HOTEL_FLIGHT", partySize: 4, matchCount: 1, global, overrides: NO_OVERRIDES });
    expect(result.additionalMatchFeeTotal).toBe(0);
    expect(result.total).toBe(result.baseFeeTotal);
  });

  it("a product-level override always wins over the global default (§88/§167)", () => {
    const result = computeOrganizationFee({
      packageType: "TICKET_ONLY",
      partySize: 3,
      matchCount: 1,
      global,
      overrides: { ...NO_OVERRIDES, orgFeeTicketOnlyOverride: 39 },
    });
    expect(result.feePerTraveler).toBe(39);
  });
});
