import { describe, it, expect } from "vitest";
import { classifyHotelReversibility, classifyFlightReversibility, isNoViableReversibilityCombination, effectiveRiskLevel } from "@/lib/checkout-saga/reversibility";
import type { HotelRoom } from "@/lib/providers/hotels/nuitee/types";
import type { FlightCommercialProduct } from "@/lib/providers/flights/duffel/types";

// Fase 2 §17/§18 — UNKNOWN is treated as IRREVERSIBLE for risk purposes
// everywhere reversibility feeds a decision; never inventing "cancelable"
// beyond what Nuitee/Duffel actually told us.

function room(overrides: Partial<HotelRoom> = {}): HotelRoom {
  return { occupancyNumber: 1, roomName: "Doble", maxOccupancy: 2, adultCount: 2, board: "RO", price: { total: 100, currency: "EUR" }, includedTaxesAndFees: [], excludedTaxesAndFees: [], refundable: true, ...overrides };
}

function commercialProduct(overrides: Partial<FlightCommercialProduct> = {}): FlightCommercialProduct {
  return {
    outbound: { cabinClass: "economy", fareBrandName: null, baggage: null },
    return: { cabinClass: "economy", fareBrandName: null, baggage: null },
    refundBeforeDeparture: null,
    changeBeforeDeparture: null,
    ...overrides,
  };
}

describe("classifyHotelReversibility", () => {
  it("all rooms refundable -> FULLY_REVERSIBLE", () => {
    expect(classifyHotelReversibility([room({ refundable: true }), room({ refundable: true })])).toBe("FULLY_REVERSIBLE");
  });

  it("no rooms refundable -> IRREVERSIBLE", () => {
    expect(classifyHotelReversibility([room({ refundable: false }), room({ refundable: false })])).toBe("IRREVERSIBLE");
  });

  it("a mix of refundable/non-refundable rooms -> PARTIALLY_REVERSIBLE", () => {
    expect(classifyHotelReversibility([room({ refundable: true }), room({ refundable: false })])).toBe("PARTIALLY_REVERSIBLE");
  });

  it("no rooms at all -> UNKNOWN, never assumed refundable", () => {
    expect(classifyHotelReversibility([])).toBe("UNKNOWN");
  });
});

describe("classifyFlightReversibility", () => {
  it("Duffel didn't provide refund_before_departure at all -> UNKNOWN", () => {
    expect(classifyFlightReversibility(commercialProduct({ refundBeforeDeparture: null }))).toBe("UNKNOWN");
  });

  it("allowed: false -> IRREVERSIBLE, never invented as cancelable", () => {
    expect(classifyFlightReversibility(commercialProduct({ refundBeforeDeparture: { allowed: false, penaltyAmount: null, penaltyCurrency: null } }))).toBe("IRREVERSIBLE");
  });

  it("allowed: true with a zero penalty -> FULLY_REVERSIBLE", () => {
    expect(classifyFlightReversibility(commercialProduct({ refundBeforeDeparture: { allowed: true, penaltyAmount: 0, penaltyCurrency: "EUR" } }))).toBe("FULLY_REVERSIBLE");
  });

  it("allowed: true with no penalty amount specified -> FULLY_REVERSIBLE", () => {
    expect(classifyFlightReversibility(commercialProduct({ refundBeforeDeparture: { allowed: true, penaltyAmount: null, penaltyCurrency: null } }))).toBe("FULLY_REVERSIBLE");
  });

  it("allowed: true with a real penalty -> PARTIALLY_REVERSIBLE", () => {
    expect(classifyFlightReversibility(commercialProduct({ refundBeforeDeparture: { allowed: true, penaltyAmount: 40, penaltyCurrency: "EUR" } }))).toBe("PARTIALLY_REVERSIBLE");
  });
});

describe("effectiveRiskLevel — §17 UNKNOWN treated as irreversible for risk", () => {
  it("FULLY/PARTIALLY_REVERSIBLE -> REVERSIBLE", () => {
    expect(effectiveRiskLevel("FULLY_REVERSIBLE")).toBe("REVERSIBLE");
    expect(effectiveRiskLevel("PARTIALLY_REVERSIBLE")).toBe("REVERSIBLE");
  });

  it("IRREVERSIBLE and UNKNOWN both -> IRREVERSIBLE_FOR_RISK", () => {
    expect(effectiveRiskLevel("IRREVERSIBLE")).toBe("IRREVERSIBLE_FOR_RISK");
    expect(effectiveRiskLevel("UNKNOWN")).toBe("IRREVERSIBLE_FOR_RISK");
  });
});

describe("isNoViableReversibilityCombination — §18", () => {
  it("hotel IRREVERSIBLE + flight IRREVERSIBLE -> true (no viable combination)", () => {
    expect(isNoViableReversibilityCombination("IRREVERSIBLE", "IRREVERSIBLE")).toBe(true);
  });

  it("hotel IRREVERSIBLE + flight UNKNOWN -> true (UNKNOWN treated as irreversible)", () => {
    expect(isNoViableReversibilityCombination("IRREVERSIBLE", "UNKNOWN")).toBe(true);
  });

  it("hotel UNKNOWN + flight UNKNOWN -> true", () => {
    expect(isNoViableReversibilityCombination("UNKNOWN", "UNKNOWN")).toBe(true);
  });

  it("hotel FULLY_REVERSIBLE + flight IRREVERSIBLE -> false (at least one side is reversible)", () => {
    expect(isNoViableReversibilityCombination("FULLY_REVERSIBLE", "IRREVERSIBLE")).toBe(false);
  });

  it("only a hotel present (no flight, null) -> never blocks on its own", () => {
    expect(isNoViableReversibilityCombination("IRREVERSIBLE", null)).toBe(false);
  });

  it("only a flight present (no hotel, null) -> never blocks on its own", () => {
    expect(isNoViableReversibilityCombination(null, "IRREVERSIBLE")).toBe(false);
  });

  it("neither present -> false", () => {
    expect(isNoViableReversibilityCombination(null, null)).toBe(false);
  });
});
