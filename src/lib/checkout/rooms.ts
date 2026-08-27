/**
 * Room-pairing logic for the checkout "Habitaciones" step.
 *
 * `roomOf[i]` describes how traveler i is housed:
 *   - a number j            → paired with traveler j (always mutual: roomOf[j] === i)
 *   - "single"               → individual room, pays the supplement
 *   - "share_same_sex"       → shares with an unknown/compatible participant, no supplement
 *   - null                   → not yet decided (blocks moving past the step)
 *
 * Pairing is always kept mutual and exclusive here, at the state-update
 * level, so the UI can never produce "person shares with two people at
 * once" — pairTraveler() unpairs any previous partner on both sides
 * before creating the new pair.
 */

export type RoomChoice = number | "single" | "share_same_sex" | null;

export type ResolvedRoom = {
  roomPreference: "share_with_group" | "share_same_sex" | "single";
  roomPartnerName: string;
};

/** Pairs consecutive travelers (0&1, 2&3, ...); an odd one out is left unset. */
export function defaultRoomAssignment(count: number): RoomChoice[] {
  const roomOf: RoomChoice[] = new Array(count).fill(null);
  for (let i = 0; i + 1 < count; i += 2) {
    roomOf[i] = i + 1;
    roomOf[i + 1] = i;
  }
  return roomOf;
}

/** Resizes an existing assignment to a new traveler count, keeping valid pairs. */
export function resizeRoomAssignment(roomOf: RoomChoice[], count: number): RoomChoice[] {
  if (count === roomOf.length) return roomOf;
  if (count < roomOf.length) {
    return roomOf.slice(0, count).map((r) => (typeof r === "number" && r >= count ? null : r));
  }
  const grown: RoomChoice[] = [...roomOf, ...new Array(count - roomOf.length).fill(null)];
  // Auto-pair every still-unset traveler (old odd-one-out included, not just
  // the newly added ones) consecutively, two at a time.
  const nullIndices: number[] = [];
  grown.forEach((r, i) => {
    if (r === null) nullIndices.push(i);
  });
  for (let k = 0; k + 1 < nullIndices.length; k += 2) {
    const a = nullIndices[k];
    const b = nullIndices[k + 1];
    grown[a] = b;
    grown[b] = a;
  }
  return grown;
}

export function pairTravelers(roomOf: RoomChoice[], i: number, j: number): RoomChoice[] {
  if (i === j) return roomOf;
  const next = [...roomOf];
  const prevI = next[i];
  if (typeof prevI === "number") next[prevI] = null;
  const prevJ = next[j];
  if (typeof prevJ === "number") next[prevJ] = null;
  next[i] = j;
  next[j] = i;
  return next;
}

export function setSoloChoice(roomOf: RoomChoice[], i: number, choice: "single" | "share_same_sex"): RoomChoice[] {
  const next = [...roomOf];
  const prevI = next[i];
  if (typeof prevI === "number") next[prevI] = null;
  next[i] = choice;
  return next;
}

export function isRoomAssignmentComplete(roomOf: RoomChoice[]): boolean {
  return roomOf.length > 0 && roomOf.every((r) => r !== null);
}

export function countSingleRooms(roomOf: RoomChoice[]): number {
  return roomOf.filter((r) => r === "single").length;
}

/**
 * Groups already-persisted travelers (Mi Viaje / Admin) into rooms —
 * "Habitación N" pairs, travelers still needing a same-sex/group roommate
 * match, and travelers with an individual room — deduping each pair to a
 * single entry. Never leaks the internal `share_same_sex` enum value to
 * the UI; callers render `needsRoommate` with their own human copy.
 */
export function groupBookedRooms<
  T extends { firstName: string; lastName: string; roomPreference: string; roomPartnerName: string },
>(travelers: T[]): { rooms: string[][]; needsRoommate: string[]; individual: string[] } {
  const shown = new Set<string>();
  const rooms: string[][] = [];
  const needsRoommate: string[] = [];
  const individual: string[] = [];

  for (const t of travelers) {
    const fullName = `${t.firstName} ${t.lastName}`.trim();
    if (shown.has(fullName)) continue;
    shown.add(fullName);

    if (t.roomPreference === "share_with_group" && t.roomPartnerName) {
      shown.add(t.roomPartnerName);
      rooms.push([fullName, t.roomPartnerName]);
    } else if (t.roomPreference === "single") {
      individual.push(fullName);
    } else {
      needsRoommate.push(fullName);
    }
  }

  return { rooms, needsRoommate, individual };
}

/** Unique room pairs and still-unpaired traveler indices, for the checkout room-card UI. */
export function computeRooms(roomOf: RoomChoice[]): { pairs: [number, number][]; unpaired: number[] } {
  const seen = new Set<number>();
  const pairs: [number, number][] = [];
  const unpaired: number[] = [];

  roomOf.forEach((r, i) => {
    if (seen.has(i)) return;
    seen.add(i);
    if (typeof r === "number") {
      seen.add(r);
      pairs.push(i < r ? [i, r] : [r, i]);
    } else {
      unpaired.push(i);
    }
  });

  return { pairs, unpaired };
}

export function resolveTravelerRooms<T extends { firstName: string; lastName: string }>(
  travelers: T[],
  roomOf: RoomChoice[]
): Array<T & ResolvedRoom> {
  return travelers.map((t, i) => {
    const r = roomOf[i];
    if (typeof r === "number" && travelers[r]) {
      const partner = travelers[r];
      return {
        ...t,
        roomPreference: "share_with_group",
        roomPartnerName: `${partner.firstName} ${partner.lastName}`.trim(),
      };
    }
    return {
      ...t,
      roomPreference: r === "single" ? "single" : "share_same_sex",
      roomPartnerName: "",
    };
  });
}
