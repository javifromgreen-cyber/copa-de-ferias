import type { HotelRoom } from "@/lib/providers/hotels/nuitee/types";
import type { RoundTripFareConditions } from "@/lib/providers/flights/duffel/types";

/**
 * Fase 2 §17/§18 — the reversibility classification this session's earlier
 * "Arquitectura Transaccional" report designed but never implemented.
 * UNKNOWN is deliberately its own level, not folded into IRREVERSIBLE at
 * the type level — callers that need the conservative "treat as
 * irreversible for risk" behavior (§17) do so explicitly (see
 * isNoViableReversibilityCombination below), so a future Admin/reporting
 * view can still tell "we know it's non-refundable" apart from "we simply
 * don't know" without losing the distinction.
 */
export type ReversibilityLevel = "FULLY_REVERSIBLE" | "PARTIALLY_REVERSIBLE" | "IRREVERSIBLE" | "UNKNOWN";

/**
 * §17 — derived only from Nuitee's real per-room `refundable` flag
 * (HotelRoom.refundable, itself from cancellationPolicies.refundableTag —
 * see the Nuitee normalize.ts). No rooms at all is UNKNOWN, never assumed
 * refundable.
 */
export function classifyHotelReversibility(rooms: HotelRoom[]): ReversibilityLevel {
  if (rooms.length === 0) return "UNKNOWN";
  const refundableCount = rooms.filter((r) => r.refundable).length;
  if (refundableCount === rooms.length) return "FULLY_REVERSIBLE";
  if (refundableCount === 0) return "IRREVERSIBLE";
  return "PARTIALLY_REVERSIBLE";
}

/**
 * §17 — derived only from information Duffel actually provides on the
 * OFFER, before any Order exists: `conditions.refund_before_departure`
 * (see RoundTripFareConditions, normalizeFareConditions in duffel/
 * normalize.ts). Never inferred from cabin class or price — Duffel does
 * not guarantee refundability correlates with either, and this codebase
 * must not invent that correlation (§17: "NO inventar 'cancelable' si
 * Duffel no lo garantiza en Offer"). When Duffel doesn't provide the
 * condition at all (`refundBeforeDeparture === null`), the true
 * refundability can only be confirmed after an Order exists — exactly the
 * case the brief calls out — so this returns UNKNOWN, never a guess.
 */
export function classifyFlightReversibility(conditions: RoundTripFareConditions): ReversibilityLevel {
  const refund = conditions.refundBeforeDeparture;
  if (refund === null) return "UNKNOWN";
  if (!refund.allowed) return "IRREVERSIBLE";
  if (refund.penaltyAmount === null || refund.penaltyAmount === 0) return "FULLY_REVERSIBLE";
  return "PARTIALLY_REVERSIBLE";
}

/** §17 — the conservative "risk" view: UNKNOWN counts as IRREVERSIBLE wherever risk is being assessed. */
export function effectiveRiskLevel(level: ReversibilityLevel): "REVERSIBLE" | "IRREVERSIBLE_FOR_RISK" {
  return level === "FULLY_REVERSIBLE" || level === "PARTIALLY_REVERSIBLE" ? "REVERSIBLE" : "IRREVERSIBLE_FOR_RISK";
}

/**
 * §18 — TICKET_HOTEL_FLIGHT only: if BOTH components turn out irreversible
 * (or unknown, treated as irreversible per §17) after revalidation, the
 * combination is not automatable for this MVP — no TicketHold, no
 * READY_TO_PAY, the user must go back to selection. `null` for a
 * component means it's not part of this modality (TICKET_ONLY/
 * TICKET_HOTEL) and never blocks on its own — the rule only ever applies
 * when both a hotel AND a flight are actually present.
 */
export function isNoViableReversibilityCombination(hotel: ReversibilityLevel | null, flight: ReversibilityLevel | null): boolean {
  if (!hotel || !flight) return false;
  return effectiveRiskLevel(hotel) === "IRREVERSIBLE_FOR_RISK" && effectiveRiskLevel(flight) === "IRREVERSIBLE_FOR_RISK";
}
