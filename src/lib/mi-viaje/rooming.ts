import { computeRequiredRoomMix } from "@/lib/pricing/roomMix";
import { assignTravelersToRooms, type RoomAssignment } from "@/lib/checkout-atu-aire/rooming";

/**
 * Mi Viaje never recalculates the room mix or re-decides who shares a
 * room — it reruns the exact same pure computation the checkout used
 * (computeRequiredRoomMix + assignTravelersToRooms, both deterministic
 * functions of partySize alone), fed with travelers in the same order
 * Traveler.order preserved from checkout. Same inputs, same deterministic
 * function, same output — this is a faithful redisplay, not a new
 * decision.
 */
export function reconstructRoomAssignments(partySize: number): RoomAssignment[] {
  const mix = computeRequiredRoomMix(partySize);
  return assignTravelersToRooms(partySize, mix);
}
