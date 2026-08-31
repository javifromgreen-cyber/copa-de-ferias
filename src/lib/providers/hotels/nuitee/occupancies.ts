import type { RoomMixEntry } from "@/lib/pricing/roomMix";

export type NuiteeOccupancy = { adults: number };

const ADULTS_BY_ROOM_TYPE: Record<RoomMixEntry["type"], number> = { single: 1, double: 2, triple: 3 };

/**
 * Direct 1:1 translation of Copa de Ferias' own room-mix decision
 * (computeRequiredRoomMix, src/lib/pricing/roomMix.ts) into Nuitee's
 * occupancies[] shape — per §4, this IS the rooming algorithm for
 * Nuitee, not a new one. One occupancy object per physical room: a
 * RoomMixEntry with count 2 becomes two separate {adults} entries,
 * because Nuitee needs one occupancy per room, not a count field.
 */
export function roomMixToOccupancies(mix: RoomMixEntry[]): NuiteeOccupancy[] {
  const occupancies: NuiteeOccupancy[] = [];
  for (const entry of mix) {
    for (let i = 0; i < entry.count; i++) {
      occupancies.push({ adults: ADULTS_BY_ROOM_TYPE[entry.type] });
    }
  }
  return occupancies;
}
