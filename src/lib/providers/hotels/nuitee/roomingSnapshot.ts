import type { RoomAssignment } from "@/lib/checkout-atu-aire/rooming";
import type { RoomingSnapshot } from "./types";

/**
 * §7 — Nuitee's BOOK response has been observed to return inconsistent
 * per-room fields (e.g. bookedRooms[].adults/occupancy_number stuck at 1
 * for every room, a repeated first-room guest) even though the booking's
 * own top-level adult count and room count are correct. We must never
 * reconstruct "who's in which room" from that response — Copa de Ferias
 * already knows the answer (assignTravelersToRooms, already used for the
 * mock/GROUP_CDF flow) at the moment of booking, so this just freezes
 * THAT as our own record. Nuitee's booking result stays the reference for
 * bookingId/supplier status/hotel confirmation/price/cancellation only —
 * never for rooming.
 */
export function buildRoomingSnapshot(assignments: RoomAssignment[]): RoomingSnapshot {
  return {
    rooms: assignments.map((a, index) => ({ roomIndex: index, travelerIndices: a.travelerIndices })),
  };
}
