import type { HotelOption, HotelRate } from "@/lib/providers/hotels/nuitee/types";
import { haversineDistanceKm, type LatLng } from "@/lib/geo/distance";

/**
 * Fase 3B.2, corrected — the checkout no longer shows the customer a raw
 * Nuitee hotel list, nor makes them pick a star category first: it builds
 * a SHORTLIST of up to 3 concrete hotels, ranked primarily by proximity
 * to the STADIUM, and lets the customer pick one of those. This module is
 * the pure ranking core — no I/O, no PREBOOK/network calls (the impure
 * orchestrator that calls this lives in src/server/actions/
 * real-checkout-search.ts).
 *
 * Correction from the previous design: distance is no longer a hard
 * filter (`distanceToStadiumKm <= someRadius`) that can leave the
 * customer with zero options — it is only ever a RANKING signal. The
 * product promise is "we show you up to 3 available options, prioritizing
 * the ones closest to the stadium", never "hotels near the stadium,
 * guaranteed" — a hotel at 7km or 10km can still legitimately appear if
 * it is among the best available options for the dates.
 */

export type HotelCandidate = {
  hotel: HotelOption;
  /** The cheapest rate within this hotel that still satisfies rooming/reversibility/auto-bookability — never a cheaper non-refundable rate over a pricier refundable one. */
  rate: HotelRate;
  distanceToStadiumKm: number;
};

/** Default size of the public shortlist — "hasta 3 opciones", never more. */
export const HOTEL_SHORTLIST_SIZE = 3;

/**
 * Two distances closer together than this are treated as "practically
 * the same" for ranking purposes — price decides the order between them
 * instead. A plain exact-equality check would almost never fire on real
 * floating-point Haversine output, so this tolerance is what actually
 * implements the "si hay empate o distancia prácticamente equivalente"
 * rule.
 */
const DISTANCE_TIE_EPSILON_KM = 0.3;

/**
 * A coarse, best-effort "how good is this board" ranking, used ONLY as a
 * late tie-break and only when both sides have a recognized board
 * string — an unrecognized/missing board never wins or loses this
 * tie-break, it simply defers to the next level. Lower number = better.
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
 * SEARCH itself can reliably vouch for, never a cheaper unreliable rate
 * over a pricier reliable one. `null` when no rate in this hotel
 * qualifies at all — the whole hotel is then discarded by the caller.
 * This is also what guarantees the shortlist never contains the same
 * hotel twice: exactly one candidate (its own single best rate) is ever
 * built per hotel.
 *
 * Corrected — SEARCH-time eligibility only discards a rate on RELIABLE
 * negative evidence (Nuitee's own refundableTag says NRFN). It never
 * discards a rate merely because the exact free-cancellation deadline
 * isn't known yet: Nuitee's sandbox routinely omits cancelPolicyInfos
 * even for genuinely free-cancellation rooms (see normalize.ts's own doc
 * comment), so requiring a known deadline this early would starve the
 * shortlist over information only PREBOOK can actually confirm. The full
 * strict gate — reversibility + safe cancellation window +
 * autoBookability — still applies in full exactly where it always has:
 * right after PREBOOK (quoteRevalidation.ts) and again right before BOOK
 * (hotelFulfillment.ts). If PREBOOK later finds a shortlisted candidate
 * isn't actually safe, the existing fallback handles it (refresh the
 * shortlist, customer picks again) — never a real charge/booking against
 * an unsafe rate.
 */
function cheapestReliablyEligibleRate(hotel: HotelOption): HotelRate | null {
  let best: HotelRate | null = null;
  for (const rate of hotel.rates) {
    if (rate.rooms.length === 0) continue;
    if (rate.rooms.some((r) => !r.refundable)) continue;
    if (!best || rate.price.total < best.price.total) best = rate;
  }
  return best;
}

function compareCandidates(a: HotelCandidate, b: HotelCandidate): number {
  // 1) proximity to the stadium — the primary ranking signal.
  const distDiff = a.distanceToStadiumKm - b.distanceToStadiumKm;
  if (Math.abs(distDiff) > DISTANCE_TIE_EPSILON_KM) return distDiff;
  // 2) tie/practically-equivalent distance -> cheaper wins. Price never
  // outranks a REAL distance difference, only a practically-equal one.
  if (a.rate.price.total !== b.rate.price.total) return a.rate.price.total - b.rate.price.total;
  // 3) better rating, only when both are real comparable figures.
  const ratingA = a.hotel.rating;
  const ratingB = b.hotel.rating;
  if (ratingA !== null && ratingB !== null && ratingA !== ratingB) return ratingB - ratingA;
  // 4) better board/breakfast, only when genuinely comparable.
  const boardRankA = boardRank(rateBoard(a.rate));
  const boardRankB = boardRank(rateBoard(b.rate));
  if (boardRankA !== null && boardRankB !== null && boardRankA !== boardRankB) return boardRankA - boardRankB;
  // 5) final, stable, deterministic ordering: the same candidates always produce the same result.
  const keyA = `${a.hotel.hotelId}:${a.rate.offerId}`;
  const keyB = `${b.hotel.hotelId}:${b.rate.offerId}`;
  return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
}

export type BuildHotelShortlistParams = {
  hotels: HotelOption[];
  stadium: LatLng;
  /** Defaults to HOTEL_SHORTLIST_SIZE (3) — the public "hasta 3 opciones" cap. */
  maxResults?: number;
};

/**
 * Eligibility (before ranking, every candidate must clear this):
 *  - the hotel has at least one rate SEARCH can reliably vouch for (see
 *    cheapestReliablyEligibleRate's own doc comment — only a definitive
 *    NRFN excludes a rate here; the full reversibility/safe-window/
 *    autoBookability gate still applies in full after PREBOOK, never
 *    loosened there); the cheapest such rate is the one this hotel is
 *    represented by (never multiple cards for the same hotel);
 *  - the hotel has reliable coordinates, so a real distance can be
 *    computed — never a guessed/omitted distance.
 *
 * No star-category filter (there is no user-selected category anymore)
 * and no hard radius elimination — distance is a RANKING signal only.
 * Ranking: distanceToStadiumKm (primary) -> price (tie-break within a
 * practically-equivalent distance) -> rating -> board -> deterministic
 * id. The result is sliced to `maxResults`.
 */
export function buildHotelShortlist(params: BuildHotelShortlistParams): HotelCandidate[] {
  const maxResults = params.maxResults ?? HOTEL_SHORTLIST_SIZE;
  const candidates: HotelCandidate[] = [];

  for (const hotel of params.hotels) {
    const rate = cheapestReliablyEligibleRate(hotel);
    if (!rate) continue;
    if (!hotel.coordinates) continue; // no reliable location data, never guessed.
    const distanceToStadiumKm = haversineDistanceKm(hotel.coordinates, params.stadium);
    candidates.push({ hotel, rate, distanceToStadiumKm });
  }

  return candidates.sort(compareCandidates).slice(0, maxResults);
}
