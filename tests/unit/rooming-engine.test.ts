import { describe, it, expect } from "vitest";
import { computeRequiredRoomMix } from "@/lib/pricing/roomMix";
import { assignTravelersToRooms } from "@/lib/checkout-atu-aire/rooming";

function totalAssigned(assignments: ReturnType<typeof assignTravelersToRooms>): number {
  return assignments.reduce((sum, room) => sum + room.travelerIndices.length, 0);
}

const CAPACITY_BY_TYPE = { single: 1, double: 2, triple: 3 } as const;

describe("computeRequiredRoomMix — exact table for every allowed party size (1-6, product cap)", () => {
  it("1 traveler -> 1 single", () => {
    expect(computeRequiredRoomMix(1)).toEqual([{ type: "single", count: 1 }]);
  });
  it("2 travelers -> 1 double", () => {
    expect(computeRequiredRoomMix(2)).toEqual([{ type: "double", count: 1 }]);
  });
  it("3 travelers -> 1 triple", () => {
    expect(computeRequiredRoomMix(3)).toEqual([{ type: "triple", count: 1 }]);
  });
  it("4 travelers -> 2 doubles (regression — must keep working exactly as before)", () => {
    expect(computeRequiredRoomMix(4)).toEqual([{ type: "double", count: 2 }]);
  });
  it("5 travelers -> 1 double + 1 triple (canonical order: double first, occupancyNumber 1 in Nuitee terms)", () => {
    expect(computeRequiredRoomMix(5)).toEqual([
      { type: "double", count: 1 },
      { type: "triple", count: 1 },
    ]);
  });
  it("6 travelers -> 3 doubles", () => {
    expect(computeRequiredRoomMix(6)).toEqual([{ type: "double", count: 3 }]);
  });
});

describe("assignTravelersToRooms — every allowed party size (1-6) assigns everyone, no over-capacity room", () => {
  for (const partySize of [1, 2, 3, 4, 5, 6]) {
    it(`partySize=${partySize}: every traveler is assigned exactly once, no room exceeds its capacity`, () => {
      const mix = computeRequiredRoomMix(partySize);
      const assignments = assignTravelersToRooms(partySize, mix);

      // Total assigned travelers matches partySize exactly (§10 test requirement).
      expect(totalAssigned(assignments)).toBe(partySize);

      // No room exceeds its type's real capacity.
      for (const room of assignments) {
        expect(room.travelerIndices.length).toBeLessThanOrEqual(CAPACITY_BY_TYPE[room.type]);
        expect(room.travelerIndices.length).toBeGreaterThan(0);
      }

      // Every traveler index 0..partySize-1 appears in exactly one room — nobody
      // is left unassigned, nobody is double-booked.
      const allIndices = assignments.flatMap((r) => r.travelerIndices);
      expect(allIndices.slice().sort((a, b) => a - b)).toEqual(Array.from({ length: partySize }, (_, i) => i));
    });
  }

  it("partySize=4 keeps producing exactly 2 double rooms of 2 travelers each (regression, was already correct — not touched)", () => {
    const mix = computeRequiredRoomMix(4);
    const assignments = assignTravelersToRooms(4, mix);
    expect(assignments).toEqual([
      { type: "double", travelerIndices: [0, 1] },
      { type: "double", travelerIndices: [2, 3] },
    ]);
  });

  it("partySize=5 produces 1 double + 1 triple, in room-mix order, with all 5 travelers placed", () => {
    const mix = computeRequiredRoomMix(5);
    const assignments = assignTravelersToRooms(5, mix);
    expect(assignments).toEqual([
      { type: "double", travelerIndices: [0, 1] },
      { type: "triple", travelerIndices: [2, 3, 4] },
    ]);
  });

  it("partySize=6 produces exactly 3 double rooms with all 6 travelers placed", () => {
    const mix = computeRequiredRoomMix(6);
    const assignments = assignTravelersToRooms(6, mix);
    expect(assignments).toEqual([
      { type: "double", travelerIndices: [0, 1] },
      { type: "double", travelerIndices: [2, 3] },
      { type: "double", travelerIndices: [4, 5] },
    ]);
  });

  it("never invents a room type or count beyond what computeRequiredRoomMix returned — the mix passed in is reflected exactly, room-for-room", () => {
    const mix = computeRequiredRoomMix(5);
    const assignments = assignTravelersToRooms(5, mix);
    const producedMix = assignments.map((r) => r.type);
    const expectedMix = mix.flatMap((entry) => Array(entry.count).fill(entry.type));
    expect(producedMix).toEqual(expectedMix);
  });
});
