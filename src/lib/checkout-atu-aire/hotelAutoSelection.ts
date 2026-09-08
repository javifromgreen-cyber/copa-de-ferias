import type { HotelOption, HotelRate } from "@/lib/providers/hotels/nuitee/types";
import { classifyHotelAutoBookability } from "@/lib/checkout-saga/reversibility";
import { haversineDistanceKm, type LatLng } from "@/lib/geo/distance";

/**
 * Fase 3B.2 — the checkout no longer shows the customer a raw Nuitee hotel
 * list to pick from: it resolves ONE specific hotel automatically. This
 * module is the pure ranking core of that resolution — no I/O, no
 * PREBOOK/network calls (the impure orchestrator that calls this lives in
 * src/server/actions/real-checkout-search.ts).
 *
 * The rule, exactly as specified: proximity to the STADIUM is a FILTER
 * that builds a set of "close enough" candidates; PRICE is the primary
 * selection criterion strictly WITHIN that filtered set. Never sort
 * everything by distance, and never let a cheap-but-too-far hotel win —
 * both are only achievable by filtering location first and comparing
 * price only afterward, which is exactly what rankHotelCandidates does.
 */

export type HotelCandidate = {
  hotel: HotelOption;
  /** The cheapest rate within this hotel that still satisfies rooming/reversibility/auto-bookability — never a cheaper non-refundable rate over a pricier refundable one. */
  rate: HotelRate;
  distanceToStadiumKm: number;
};

/**
 * A coarse, best-effort "how good is this board" ranking, used ONLY as a
 * late tie-break (§ tie-break level 3) and only when both sides have a
 * recognized board string — an unrecognized/missing board never wins or
 * loses this tie-break, it simply defers to the next level. Lower number
 * = better.
 */
const BOARD_RANK: { pattern: RegExp; rank: number }[] = [
  { pattern: /all[\s-]?inclusive/i, rank: 0 },
  { pattern: /full\s?board/i, rank: 1 },
  { pattern: /half\s?board/i, rank: 2 },
  { pattern: /(breakfast|bed\s?&?\s?breakfast)/i, rank: 3 },
  { pattern: /room\s?only/i, rank: 4 },
];

function boardRank(board: string | null): number | null {
  if (!board) return null;
  const match = BOARD_RANK.find((b) => b.pattern.test(board));
  return match ? match.rank : null;
}

function rateBoard(rate: HotelRate): string | null {
  return rate.rooms[0]?.board ?? null;
}

/**
 * §"múltiples tarifas dentro de un mismo hotel" — the cheapest rate that
 * still passes auto-bookability (reversibility + safe cancellation
 * window), never a cheaper but non-auto-bookable rate over a pricier
 * auto-bookable one. `null` when no rate in this hotel qualifies at all —
 * the whole hotel is then discarded by the caller.
 */
function cheapestAutoBookableRate(hotel: HotelOption, now: Date): HotelRate | null {
  let best: HotelRate | null = null;
  for (const rate of hotel.rates) {
    if (!classifyHotelAutoBookability(rate.rooms, now).autoBookable) continue;
    if (!best || rate.price.total < best.price.total) best = rate;
  }
  return best;
}

function compareCandidates(a: HotelCandidate, b: HotelCandidate): number {
  // 1) price — the primary criterion, strictly within the already
  // location-filtered set (never a pure distance sort).
  if (a.rate.price.total !== b.rate.price.total) return a.rate.price.total - b.rate.price.total;
  // tie-break 1 — closer to the stadium wins.
  if (a.distanceToStadiumKm !== b.distanceToStadiumKm) return a.distanceToStadiumKm - b.distanceToStadiumKm;
  // tie-break 2 — better rating, only when both are real comparable figures.
  const ratingA = a.hotel.rating;
  const ratingB = b.hotel.rating;
  if (ratingA !== null && ratingB !== null && ratingA !== ratingB) return ratingB - ratingA;
  // tie-break 3 — better board/breakfast, only when genuinely comparable.
  const boardRankA = boardRank(rateBoard(a.rate));
  const boardRankB = boardRank(rateBoard(b.rate));
  if (boardRankA !== null && boardRankB !== null && boardRankA !== boardRankB) return boardRankA - boardRankB;
  // tie-break 4 — final, stable, deterministic ordering: the same
  // candidates must always produce the same result.
  const keyA = `${a.hotel.hotelId}:${a.rate.offerId}`;
  const keyB = `${b.hotel.hotelId}:${b.rate.offerId}`;
  return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
}

export type RankHotelCandidatesParams = {
  hotels: HotelOption[];
  /** The exact category the customer selected — 3 or 4. Never a range. */
  starCategory: number;
  stadium: LatLng;
  stadiumHotelRadiusKm: number;
  now?: Date;
};

/**
 * A-F, in order:
 *  A. `hotels` are the raw Nuitee SEARCH candidates.
 *  B. exact star category filter (defensive — SEARCH is already asked for
 *     this exact category, but a provider mismatch is never trusted).
 *  C. Fase 3B.2 technical/commercial rules — per hotel, the cheapest
 *     auto-bookable rate (cheapestAutoBookableRate); hotels with none
 *     qualifying are dropped entirely.
 *  D. distance to stadium — hotels without reliable coordinates are
 *     dropped (never a guessed location).
 *  E. hotels farther than `stadiumHotelRadiusKm` are dropped.
 *  F. among ALL remaining in-zone candidates, sorted so the cheapest
 *     valid rate wins — see compareCandidates for the full tie-break order.
 */
export function rankHotelCandidates(params: RankHotelCandidatesParams): HotelCandidate[] {
  const now = params.now ?? new Date();
  const candidates: HotelCandidate[] = [];

  for (const hotel of params.hotels) {
    if (hotel.stars !== params.starCategory) continue; // B
    const rate = cheapestAutoBookableRate(hotel, now); // C
    if (!rate) continue;
    if (!hotel.coordinates) continue; // D — no reliable location data, never guessed.
    const distanceToStadiumKm = haversineDistanceKm(hotel.coordinates, params.stadium);
    if (distanceToStadiumKm > params.stadiumHotelRadiusKm) continue; // E
    candidates.push({ hotel, rate, distanceToStadiumKm });
  }

  return candidates.sort(compareCandidates); // F
}
