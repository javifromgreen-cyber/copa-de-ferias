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
 *
 * Ordered smallest room first (single, then double, then triple) — this
 * is Copa de Ferias' own occupancyNumber convention for Nuitee, kept
 * local to this translation. computeRequiredRoomMix's own entry order
 * (e.g. triple before double for a party of 5) is a business-rule detail
 * for traveler-room assignment elsewhere (assignTravelersToRooms) and is
 * left untouched — this function never reorders or mutates the mix
 * itself, only the occupancies it emits.
 */
export function roomMixToOccupancies(mix: RoomMixEntry[]): NuiteeOccupancy[] {
  const sorted = [...mix].sort((a, b) => ADULTS_BY_ROOM_TYPE[a.type] - ADULTS_BY_ROOM_TYPE[b.type]);
  const occupancies: NuiteeOccupancy[] = [];
  for (const entry of sorted) {
    for (let i = 0; i < entry.count; i++) {
      occupancies.push({ adults: ADULTS_BY_ROOM_TYPE[entry.type] });
    }
  }
  return occupancies;
}
