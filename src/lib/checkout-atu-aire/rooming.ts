import type { RoomMixEntry, RoomType } from "@/lib/pricing/roomMix";

export type RoomAssignment = {
  type: RoomType;
  // 0-based indices into the traveler list this room's occupants come from.
  travelerIndices: number[];
};

const CAPACITY_BY_TYPE: Record<RoomType, number> = { single: 1, double: 2, triple: 3 };

/**
 * Deterministically fills each room in `mix` with the next travelers in
 * list order — never a peer-pairing puzzle for the customer to solve
 * (§16: "no un diseñador de habitaciones hipercomplejo"), just a clear,
 * visible mapping of who's in which room, derived the same way the price
 * is: from computeRequiredRoomMix, never invented separately.
 */
export function assignTravelersToRooms(partySize: number, mix: RoomMixEntry[]): RoomAssignment[] {
  const assignments: RoomAssignment[] = [];
  let nextIndex = 0;
  for (const entry of mix) {
    for (let i = 0; i < entry.count; i++) {
      const capacity = CAPACITY_BY_TYPE[entry.type];
      const travelerIndices: number[] = [];
      for (let slot = 0; slot < capacity && nextIndex < partySize; slot++) {
        travelerIndices.push(nextIndex);
        nextIndex++;
      }
      assignments.push({ type: entry.type, travelerIndices });
    }
  }
  return assignments;
}
