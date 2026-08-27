import { describe, it, expect } from "vitest";
import {
  defaultRoomAssignment,
  resizeRoomAssignment,
  pairTravelers,
  setSoloChoice,
  isRoomAssignmentComplete,
  countSingleRooms,
  resolveTravelerRooms,
  computeRooms,
  groupBookedRooms,
} from "@/lib/checkout/rooms";

describe("defaultRoomAssignment", () => {
  it("pairs consecutive travelers and leaves an odd one out unset", () => {
    expect(defaultRoomAssignment(4)).toEqual([1, 0, 3, 2]);
    expect(defaultRoomAssignment(5)).toEqual([1, 0, 3, 2, null]);
  });

  it("leaves a solo traveler unset (must choose explicitly)", () => {
    expect(defaultRoomAssignment(1)).toEqual([null]);
  });
});

describe("resizeRoomAssignment", () => {
  it("pairs a previously-unset solo traveler with a newly added one", () => {
    // Regression: growing from 1→2 travelers must pair them, not leave both
    // "pending" (the resize used to only try pairing *new* indices with
    // each other, never with the pre-existing unset one).
    expect(resizeRoomAssignment([null], 2)).toEqual([1, 0]);
  });

  it("keeps an existing pair intact when growing further", () => {
    expect(resizeRoomAssignment([1, 0], 3)).toEqual([1, 0, null]);
  });

  it("pairs an old odd-one-out with a new arrival", () => {
    expect(resizeRoomAssignment([1, 0, null], 4)).toEqual([1, 0, 3, 2]);
  });

  it("drops travelers and clears any pair pointing past the new count", () => {
    expect(resizeRoomAssignment([1, 0, 3, 2], 2)).toEqual([1, 0]);
    expect(resizeRoomAssignment([1, 0, 3, 2], 3)).toEqual([1, 0, null]);
  });
});

describe("pairTravelers", () => {
  it("is always mutual", () => {
    const result = pairTravelers([null, null, null], 0, 2);
    expect(result[0]).toBe(2);
    expect(result[2]).toBe(0);
  });

  it("never lets one person share with two people at once", () => {
    // 0<->1 already paired; pairing 0 with 2 must release 1.
    let roomOf = pairTravelers([null, null, null], 0, 1);
    roomOf = pairTravelers(roomOf, 0, 2);
    expect(roomOf[0]).toBe(2);
    expect(roomOf[2]).toBe(0);
    expect(roomOf[1]).toBeNull(); // released, not left dangling on a phantom partner
  });
});

describe("setSoloChoice", () => {
  it("releases a previous partner when switching to individual", () => {
    const paired = pairTravelers([null, null], 0, 1);
    const solo = setSoloChoice(paired, 0, "single");
    expect(solo[0]).toBe("single");
    expect(solo[1]).toBeNull();
  });
});

describe("isRoomAssignmentComplete / countSingleRooms", () => {
  it("is incomplete while any traveler is unresolved", () => {
    expect(isRoomAssignmentComplete([1, 0, null])).toBe(false);
    expect(isRoomAssignmentComplete([1, 0, "single"])).toBe(true);
  });

  it("counts only explicit single-room choices", () => {
    expect(countSingleRooms([1, 0, "single", "share_same_sex"])).toBe(1);
  });
});

describe("resolveTravelerRooms", () => {
  const travelers = [
    { firstName: "Ana", lastName: "García" },
    { firstName: "Berto", lastName: "Ruiz" },
    { firstName: "Carla", lastName: "Soto" },
  ];

  it("maps a pair to share_with_group with the partner's name", () => {
    const resolved = resolveTravelerRooms(travelers, [1, 0, "single"]);
    expect(resolved[0]).toMatchObject({ roomPreference: "share_with_group", roomPartnerName: "Berto Ruiz" });
    expect(resolved[1]).toMatchObject({ roomPreference: "share_with_group", roomPartnerName: "Ana García" });
  });

  it("maps single/share_same_sex with no partner name", () => {
    const resolved = resolveTravelerRooms(travelers, [1, 0, "single"]);
    expect(resolved[2]).toMatchObject({ roomPreference: "single", roomPartnerName: "" });
  });
});

// Room-card UI grouping — covers the group sizes explicitly requested for
// this pass: 1, 2, 3, 4, 5, 6 travelers (checkout §55).
describe("computeRooms", () => {
  it("1 traveler: no rooms, one unpaired", () => {
    expect(computeRooms(defaultRoomAssignment(1))).toEqual({ pairs: [], unpaired: [0] });
  });

  it("2 travelers: one room, no unpaired", () => {
    expect(computeRooms(defaultRoomAssignment(2))).toEqual({ pairs: [[0, 1]], unpaired: [] });
  });

  it("3 travelers: one room + one unpaired", () => {
    expect(computeRooms(defaultRoomAssignment(3))).toEqual({ pairs: [[0, 1]], unpaired: [2] });
  });

  it("4 travelers: two rooms, no unpaired", () => {
    expect(computeRooms(defaultRoomAssignment(4))).toEqual({
      pairs: [
        [0, 1],
        [2, 3],
      ],
      unpaired: [],
    });
  });

  it("5 travelers: two rooms + one unpaired", () => {
    expect(computeRooms(defaultRoomAssignment(5))).toEqual({
      pairs: [
        [0, 1],
        [2, 3],
      ],
      unpaired: [4],
    });
  });

  it("6 travelers: three rooms, no unpaired", () => {
    expect(computeRooms(defaultRoomAssignment(6))).toEqual({
      pairs: [
        [0, 1],
        [2, 3],
        [4, 5],
      ],
      unpaired: [],
    });
  });

  it("groups single/share_same_sex choices as unpaired, never duplicated across pairs", () => {
    const roomOf = pairTravelers([null, null, null, null], 0, 1);
    const withSolo = setSoloChoice(setSoloChoice(roomOf, 2, "single"), 3, "share_same_sex");
    const { pairs, unpaired } = computeRooms(withSolo);
    expect(pairs).toEqual([[0, 1]]);
    expect(unpaired.sort()).toEqual([2, 3]);
    // every index appears exactly once across pairs+unpaired
    const seen = [...pairs.flat(), ...unpaired].sort((a, b) => a - b);
    expect(seen).toEqual([0, 1, 2, 3]);
  });
});

describe("groupBookedRooms", () => {
  it("groups a mutual pair into one room, dedupes the second traveler", () => {
    const travelers = [
      { firstName: "Ana", lastName: "García", roomPreference: "share_with_group", roomPartnerName: "Berto Ruiz" },
      { firstName: "Berto", lastName: "Ruiz", roomPreference: "share_with_group", roomPartnerName: "Ana García" },
    ];
    expect(groupBookedRooms(travelers)).toEqual({
      rooms: [["Ana García", "Berto Ruiz"]],
      needsRoommate: [],
      individual: [],
    });
  });

  it("buckets single and share_same_sex travelers correctly", () => {
    const travelers = [
      { firstName: "Ana", lastName: "García", roomPreference: "single", roomPartnerName: "" },
      { firstName: "Berto", lastName: "Ruiz", roomPreference: "share_same_sex", roomPartnerName: "" },
    ];
    expect(groupBookedRooms(travelers)).toEqual({
      rooms: [],
      needsRoommate: ["Berto Ruiz"],
      individual: ["Ana García"],
    });
  });
});
