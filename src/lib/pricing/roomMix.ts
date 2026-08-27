import { MAX_PARTY_SIZE, MIN_PARTY_SIZE } from "./partySize";

export type RoomType = "single" | "double" | "triple";

export type RoomMixEntry = { type: RoomType; count: number };

// Exact room-mix table from spec §41/§157. Deliberately a fixed lookup, not
// a general bin-packing algorithm — the mix is a business decision (e.g.
// preferring one triple + doubles over three doubles at party size 7), not
// something to re-derive at runtime. Room type is never chosen by the
// customer; it's computed automatically from the party size.
const ROOM_MIX_TABLE: Record<number, RoomMixEntry[]> = {
  1: [{ type: "single", count: 1 }],
  2: [{ type: "double", count: 1 }],
  3: [{ type: "triple", count: 1 }],
  4: [{ type: "double", count: 2 }],
  5: [
    { type: "triple", count: 1 },
    { type: "double", count: 1 },
  ],
  6: [{ type: "double", count: 3 }],
  7: [
    { type: "triple", count: 1 },
    { type: "double", count: 2 },
  ],
  8: [{ type: "double", count: 4 }],
  9: [
    { type: "triple", count: 1 },
    { type: "double", count: 3 },
  ],
  10: [{ type: "double", count: 5 }],
};

export function computeRequiredRoomMix(partySize: number): RoomMixEntry[] {
  if (!Number.isInteger(partySize) || partySize < MIN_PARTY_SIZE || partySize > MAX_PARTY_SIZE) {
    throw new Error(`computeRequiredRoomMix: partySize must be an integer between ${MIN_PARTY_SIZE} and ${MAX_PARTY_SIZE}`);
  }
  return ROOM_MIX_TABLE[partySize];
}

export function roomMixCapacity(mix: RoomMixEntry[]): number {
  const capacityByType: Record<RoomType, number> = { single: 1, double: 2, triple: 3 };
  return mix.reduce((sum, entry) => sum + capacityByType[entry.type] * entry.count, 0);
}
