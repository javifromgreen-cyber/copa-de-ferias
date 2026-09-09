import { classifyHotelAutoBookability, HOTEL_AUTO_BOOK_SAFETY_BUFFER_MS } from "@/lib/checkout-saga/reversibility";
import { ProviderError } from "@/lib/providers/errors";
import type { HotelPrebook, HotelRoom } from "@/lib/providers/hotels/nuitee/types";

/**
 * Diagnostic-only classification of WHY a hotel shortlist candidate was
 * rejected during resolveValidatedHotelShortlist — never changes what
 * counts as valid/invalid (that's still classifyHotelAutoBookability
 * alone, untouched here). Built after the first real Vercel run
 * exhausted the whole PREBOOK attempt budget without validating a
 * single candidate, with no visibility into why each one failed.
 *
 * RATE_CHANGED, ROOMING_MISMATCH, PREBOOK_PRICE_INVALID and
 * PREBOOK_CURRENCY_MISMATCH are reserved for a future correction that
 * actually wires them into a rejection decision — nothing in the
 * current resolution logic produces them yet, since this task is
 * diagnostics only, never a validation change.
 */
export type HotelRejectionReason =
  | "PREBOOK_HTTP_ERROR"
  | "PREBOOK_PROVIDER_ERROR"
  | "PREBOOK_TIMEOUT"
  | "PREBOOK_PRICE_INVALID"
  | "PREBOOK_CURRENCY_MISMATCH"
  | "PREBOOK_HOTEL_MISMATCH"
  | "NRFN"
  | "CANCELLATION_POLICY_MISSING"
  | "CANCELLATION_POLICY_AMBIGUOUS"
  | "CANCELLATION_WINDOW_EXPIRED"
  | "CANCELLATION_WINDOW_TOO_SHORT"
  | "AUTOBOOKABILITY_UNKNOWN"
  | "AUTOBOOKABILITY_IRREVERSIBLE"
  | "RATE_CHANGED"
  | "ROOMING_MISMATCH"
  | "OTHER_VALIDATION_FAILURE";

/** Sanitized, safe-to-log detail for exactly one rejected candidate — never a price/cost figure, never anything from headers/PII/buyer data. */
export type CandidateRejectionLog = {
  hotelId: string;
  hotelName: string;
  offerId: string;
  distanceToStadiumKm: number;
  reason: HotelRejectionReason;
  refundableTag: "RFN" | "NRFN" | "MIXED" | "UNKNOWN";
  cancellationPolicyCount: number | null;
  cancellationDeadline: string | null;
  safeCancellationUntil: string | null;
  autoBookability: string;
  providerErrorCode: string | null;
};

/**
 * Classifies a thrown PREBOOK call itself (no response ever evaluated) —
 * reads only ProviderError.detail, which is already documented
 * (errors.ts) as sanitized/safe to log; never the raw error/response, no
 * headers, no NUITEE_API_KEY.
 */
export function classifyPrebookError(err: unknown): { reason: HotelRejectionReason; providerErrorCode: string | null } {
  if (err instanceof ProviderError) {
    const providerErrorCode = err.detail.providerErrorCode ?? null;
    if (err.code === "NETWORK_ERROR") {
      return { reason: err.message.toLowerCase().includes("timed out") ? "PREBOOK_TIMEOUT" : "PREBOOK_HTTP_ERROR", providerErrorCode };
    }
    if (err.code === "INVALID_PROVIDER_RESPONSE") {
      return { reason: "PREBOOK_PROVIDER_ERROR", providerErrorCode };
    }
    // RATE_LIMITED / AUTHENTICATION_FAILED / PERMISSION_DENIED /
    // NO_AVAILABILITY / PROVIDER_UNAVAILABLE — all confirmed
    // HTTP-status-driven failures.
    return { reason: "PREBOOK_HTTP_ERROR", providerErrorCode };
  }
  return { reason: "OTHER_VALIDATION_FAILURE", providerErrorCode: null };
}

function earliestFreeCancellationDeadline(rooms: HotelRoom[]): string | null {
  let earliest: string | null = null;
  for (const r of rooms) {
    if (!r.freeCancellationUntil) continue;
    if (!earliest || new Date(r.freeCancellationUntil).getTime() < new Date(earliest).getTime()) earliest = r.freeCancellationUntil;
  }
  return earliest;
}

function minCancelPolicyInfoCount(rooms: HotelRoom[]): number | null {
  const counts = rooms.map((r) => r.cancelPolicyInfoCount).filter((c): c is number => typeof c === "number");
  if (counts.length === 0) return null;
  return Math.min(...counts);
}

export function refundableTagOf(rooms: HotelRoom[]): "RFN" | "NRFN" | "MIXED" | "UNKNOWN" {
  if (rooms.length === 0) return "UNKNOWN";
  const refundableCount = rooms.filter((r) => r.refundable).length;
  if (refundableCount === rooms.length) return "RFN";
  if (refundableCount === 0) return "NRFN";
  return "MIXED";
}

/**
 * Classifies why a PREBOOK response that DID come back still failed the
 * reversibility/safe-window/autoBookability gate — re-derives the
 * specific cause from the exact same evidence classifyHotelAutoBookability
 * already uses (rooms' refundable/freeCancellationUntil, plus the safety
 * buffer it applies), so this is a pure re-explanation, never a second
 * gate with its own opinion.
 */
export function classifyPrebookRejection(
  candidateHotelId: string,
  prebook: HotelPrebook,
  now: Date = new Date(),
): { reason: HotelRejectionReason; detail: { cancellationDeadline: string | null; safeCancellationUntil: string | null; cancellationPolicyCount: number | null; autoBookability: string } } {
  const bookability = classifyHotelAutoBookability(prebook.rooms, now);
  const detail = {
    cancellationDeadline: earliestFreeCancellationDeadline(prebook.rooms),
    safeCancellationUntil: bookability.hotelSafeCancellationUntil,
    cancellationPolicyCount: minCancelPolicyInfoCount(prebook.rooms),
    autoBookability: bookability.level,
  };

  if (prebook.hotelId !== candidateHotelId) return { reason: "PREBOOK_HOTEL_MISMATCH", detail };
  if (prebook.rooms.length === 0) return { reason: "AUTOBOOKABILITY_UNKNOWN", detail };
  if (prebook.rooms.some((r) => !r.refundable)) return { reason: "NRFN", detail };

  const roomsMissingDeadline = prebook.rooms.filter((r) => !r.freeCancellationUntil);
  if (roomsMissingDeadline.length > 0) {
    const allTrulyMissing = roomsMissingDeadline.every((r) => (r.cancelPolicyInfoCount ?? 0) === 0);
    return { reason: allTrulyMissing ? "CANCELLATION_POLICY_MISSING" : "CANCELLATION_POLICY_AMBIGUOUS", detail };
  }

  if (bookability.hotelSafeCancellationUntil) {
    const safeUntilMs = new Date(bookability.hotelSafeCancellationUntil).getTime();
    const actualDeadlineMs = safeUntilMs + HOTEL_AUTO_BOOK_SAFETY_BUFFER_MS;
    return { reason: actualDeadlineMs <= now.getTime() ? "CANCELLATION_WINDOW_EXPIRED" : "CANCELLATION_WINDOW_TOO_SHORT", detail };
  }

  return { reason: "AUTOBOOKABILITY_UNKNOWN", detail };
}

/** How one whole resolution ended, once validated.length === 0 — see resolveValidatedHotelShortlist's own doc comment for why these must never be phrased the same way to the customer. */
export type HotelResolutionOutcome = "VALIDATED" | "NO_INVENTORY" | "PREBOOK_BUDGET_EXHAUSTED_WITH_UNTRIED_CANDIDATES";

export type ResolutionSummaryLog = {
  searchCandidatesSeen: number;
  uniqueHotelsSeen: number;
  prebookAttempts: number;
  validatedHotels: number;
  rejectedByReason: Partial<Record<HotelRejectionReason, number>>;
  untriedCandidatesRemaining: number;
  budgetExhausted: boolean;
  outcome: HotelResolutionOutcome;
};

export function resolutionOutcome(validatedHotels: number, budgetExhausted: boolean): HotelResolutionOutcome {
  if (validatedHotels > 0) return "VALIDATED";
  return budgetExhausted ? "PREBOOK_BUDGET_EXHAUSTED_WITH_UNTRIED_CANDIDATES" : "NO_INVENTORY";
}
