import { describe, it, expect } from "vitest";
import {
  classifyPrebookError,
  classifyPrebookRejection,
  refundableTagOf,
  resolutionOutcome,
} from "@/lib/checkout-atu-aire/hotelRejectionDiagnostics";
import { ProviderError } from "@/lib/providers/errors";
import type { HotelPrebook, HotelRoom } from "@/lib/providers/hotels/nuitee/types";

// Built after the first real Vercel TICKET_HOTEL run exhausted the whole
// PREBOOK attempt budget (8/8) without validating a single candidate,
// with zero visibility into why. These classifiers re-derive WHY an
// already-rejected candidate was rejected from the exact same evidence
// classifyHotelAutoBookability uses — they never make their own
// accept/reject decision.

function room(overrides: Partial<HotelRoom> = {}): HotelRoom {
  return {
    occupancyNumber: 1,
    roomName: "Doble",
    maxOccupancy: 2,
    adultCount: 2,
    board: "RO",
    price: { total: 100, currency: "EUR" },
    includedTaxesAndFees: [],
    excludedTaxesAndFees: [],
    refundable: true,
    freeCancellationUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    cancelPolicyInfoCount: 1,
    ...overrides,
  };
}

function prebook(overrides: Partial<HotelPrebook> = {}): HotelPrebook {
  return {
    prebookId: "prebook_1",
    offerId: "offer_1",
    hotelId: "hotel_1",
    rooms: [room()],
    price: { total: 100, currency: "EUR" },
    priceDifferencePercent: null,
    cancellationChanged: false,
    boardChanged: false,
    paymentTypes: [],
    checkin: "2026-11-14",
    checkout: "2026-11-16",
    ...overrides,
  };
}

describe("classifyPrebookError — PREBOOK call itself threw, no response was ever evaluated", () => {
  it("NETWORK_ERROR with a timeout message -> PREBOOK_TIMEOUT", () => {
    const err = new ProviderError("NETWORK_ERROR", "nuitee", "Nuitee request timed out before any response was received.");
    expect(classifyPrebookError(err)).toEqual({ reason: "PREBOOK_TIMEOUT", providerErrorCode: null });
  });

  it("NETWORK_ERROR without a timeout message -> PREBOOK_HTTP_ERROR", () => {
    const err = new ProviderError("NETWORK_ERROR", "nuitee", "Nuitee request failed before any response was received: fetch failed");
    expect(classifyPrebookError(err).reason).toBe("PREBOOK_HTTP_ERROR");
  });

  it("a confirmed HTTP-status error (RATE_LIMITED/AUTHENTICATION_FAILED/PERMISSION_DENIED/NO_AVAILABILITY/PROVIDER_UNAVAILABLE) -> PREBOOK_HTTP_ERROR, carrying providerErrorCode when present", () => {
    const err = new ProviderError("RATE_LIMITED", "nuitee", "Nuitee rate limit exceeded (429).", { httpStatus: 429, providerErrorCode: "rate_limit_exceeded" });
    expect(classifyPrebookError(err)).toEqual({ reason: "PREBOOK_HTTP_ERROR", providerErrorCode: "rate_limit_exceeded" });
  });

  it("INVALID_PROVIDER_RESPONSE (malformed body / provider application-level error) -> PREBOOK_PROVIDER_ERROR", () => {
    const err = new ProviderError("INVALID_PROVIDER_RESPONSE", "nuitee", "Nuitee returned 400 (code 4005).", { httpStatus: 400, providerErrorCode: "4005" });
    expect(classifyPrebookError(err)).toEqual({ reason: "PREBOOK_PROVIDER_ERROR", providerErrorCode: "4005" });
  });

  it("a non-ProviderError thrown value -> OTHER_VALIDATION_FAILURE", () => {
    expect(classifyPrebookError(new Error("unexpected")).reason).toBe("OTHER_VALIDATION_FAILURE");
  });
});

describe("classifyPrebookRejection — PREBOOK responded, but failed the reversibility/safe-window gate", () => {
  it("a hotelId mismatch between the candidate and the PREBOOK response -> PREBOOK_HOTEL_MISMATCH", () => {
    const result = classifyPrebookRejection("hotel_expected", prebook({ hotelId: "hotel_other" }));
    expect(result.reason).toBe("PREBOOK_HOTEL_MISMATCH");
  });

  it("any non-refundable room -> NRFN", () => {
    const result = classifyPrebookRejection("hotel_1", prebook({ rooms: [room({ refundable: false, freeCancellationUntil: null })] }));
    expect(result.reason).toBe("NRFN");
  });

  it("refundable with zero cancelPolicyInfos entries -> CANCELLATION_POLICY_MISSING (the real Nuitee sandbox gap)", () => {
    const result = classifyPrebookRejection("hotel_1", prebook({ rooms: [room({ freeCancellationUntil: null, cancelPolicyInfoCount: 0 })] }));
    expect(result.reason).toBe("CANCELLATION_POLICY_MISSING");
  });

  it("refundable with cancelPolicyInfos present but not proving free-now -> CANCELLATION_POLICY_AMBIGUOUS", () => {
    const result = classifyPrebookRejection("hotel_1", prebook({ rooms: [room({ freeCancellationUntil: null, cancelPolicyInfoCount: 2 })] }));
    expect(result.reason).toBe("CANCELLATION_POLICY_AMBIGUOUS");
  });

  it("a free-cancellation deadline already in the past -> CANCELLATION_WINDOW_EXPIRED", () => {
    const pastDeadline = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const result = classifyPrebookRejection("hotel_1", prebook({ rooms: [room({ freeCancellationUntil: pastDeadline })] }));
    expect(result.reason).toBe("CANCELLATION_WINDOW_EXPIRED");
  });

  it("a future deadline that doesn't clear the safety buffer -> CANCELLATION_WINDOW_TOO_SHORT", () => {
    const tightDeadline = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // within the 30-min buffer
    const result = classifyPrebookRejection("hotel_1", prebook({ rooms: [room({ freeCancellationUntil: tightDeadline })] }));
    expect(result.reason).toBe("CANCELLATION_WINDOW_TOO_SHORT");
  });

  it("no rooms at all in the PREBOOK response -> AUTOBOOKABILITY_UNKNOWN", () => {
    const result = classifyPrebookRejection("hotel_1", prebook({ rooms: [] }));
    expect(result.reason).toBe("AUTOBOOKABILITY_UNKNOWN");
  });

  it("carries the underlying evidence (deadline/safe-until/policy count/level) in its detail, never a price figure", () => {
    const pastDeadline = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const result = classifyPrebookRejection("hotel_1", prebook({ rooms: [room({ freeCancellationUntil: pastDeadline, cancelPolicyInfoCount: 1 })] }));
    expect(result.detail.cancellationDeadline).toBe(pastDeadline);
    expect(result.detail.cancellationPolicyCount).toBe(1);
    expect(result.detail.autoBookability).toBe("UNKNOWN");
    expect(result.detail).not.toHaveProperty("price");
  });
});

describe("refundableTagOf", () => {
  it("all rooms refundable -> RFN", () => {
    expect(refundableTagOf([room(), room()])).toBe("RFN");
  });
  it("all rooms non-refundable -> NRFN", () => {
    expect(refundableTagOf([room({ refundable: false })])).toBe("NRFN");
  });
  it("a mix -> MIXED", () => {
    expect(refundableTagOf([room(), room({ refundable: false })])).toBe("MIXED");
  });
  it("no rooms -> UNKNOWN", () => {
    expect(refundableTagOf([])).toBe("UNKNOWN");
  });
});

describe("resolutionOutcome — NO_INVENTORY is never confused with a spent PREBOOK budget", () => {
  it("any validated hotel -> VALIDATED, regardless of budgetExhausted", () => {
    expect(resolutionOutcome(1, true)).toBe("VALIDATED");
    expect(resolutionOutcome(2, false)).toBe("VALIDATED");
  });

  it("0 validated, budget exhausted with untried candidates -> PREBOOK_BUDGET_EXHAUSTED_WITH_UNTRIED_CANDIDATES", () => {
    expect(resolutionOutcome(0, true)).toBe("PREBOOK_BUDGET_EXHAUSTED_WITH_UNTRIED_CANDIDATES");
  });

  it("0 validated, budget never the limiting factor -> NO_INVENTORY", () => {
    expect(resolutionOutcome(0, false)).toBe("NO_INVENTORY");
  });
});
