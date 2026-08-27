import { describe, it, expect } from "vitest";
import {
  validateTicketAssignment,
  needsTicketAssignmentStep,
  computeQuote,
  isBelowMinimumProfit,
  computeTaxEstimate,
  hasQuoteChanged,
} from "@/lib/pricing/quote";
import { computeOrganizationFee, NO_OVERRIDES, type OrganizationFeeGlobalConfig } from "@/lib/pricing/organizationFee";

const global: OrganizationFeeGlobalConfig = {
  feeTicketOnly: 49,
  feeHotelTiers: JSON.stringify([{ minParty: 1, maxParty: 10, feePerTraveler: 90 }]),
  feeHotelFlightTiers: JSON.stringify([{ minParty: 1, maxParty: 10, feePerTraveler: 149 }]),
  additionalMatchFee: 25,
};

describe("ticket/traveler decoupling (§24-27/§161-162)", () => {
  it("allows fewer tickets than travelers (e.g. 6 travelers, 4 tickets)", () => {
    expect(validateTicketAssignment(4, 6).ok).toBe(true);
    expect(needsTicketAssignmentStep(4, 6)).toBe(true);
  });

  it("rejects more tickets than travelers", () => {
    expect(validateTicketAssignment(7, 6).ok).toBe(false);
  });

  it("rejects zero or fractional ticket counts", () => {
    expect(validateTicketAssignment(0, 6).ok).toBe(false);
    expect(validateTicketAssignment(2.5, 6).ok).toBe(false);
  });

  it("skips the assignment step when every traveler has a ticket", () => {
    expect(needsTicketAssignmentStep(6, 6)).toBe(false);
  });
});

describe("computeQuote (§77-95/§161-169)", () => {
  it("commercial total is exactly cost + org fee + buffer, margin never inflates it beyond that", () => {
    const orgFee = computeOrganizationFee({ packageType: "TICKET_HOTEL_FLIGHT", partySize: 4, matchCount: 1, global, overrides: NO_OVERRIDES });
    const quote = computeQuote({
      costs: { ticketCostNetTotal: 200, hotelCostNetTotal: 300, flightCostNetTotal: 400, hostCostNetTotal: 0 },
      orgFee,
      buffer: 10,
      paymentMethodInternalCost: 5,
    });
    expect(quote.costNetTotal).toBe(900);
    expect(quote.commercialTotal).toBe(900 + orgFee.total + 10);
  });

  it("estimated profit subtracts the internal payment-method cost from fee+buffer, never from the customer total", () => {
    const orgFee = computeOrganizationFee({ packageType: "TICKET_ONLY", partySize: 1, matchCount: 1, global, overrides: NO_OVERRIDES });
    const quote = computeQuote({
      costs: { ticketCostNetTotal: 50, hotelCostNetTotal: 0, flightCostNetTotal: 0, hostCostNetTotal: 0 },
      orgFee,
      buffer: 0,
      paymentMethodInternalCost: 3,
    });
    expect(quote.estimatedProfit).toBe(orgFee.total - 3);
    expect(quote.commercialTotal).toBe(50 + orgFee.total); // payment cost never added on top
  });

  it("flags a booking below the minimum estimated profit threshold", () => {
    expect(isBelowMinimumProfit(10, 20)).toBe(true);
    expect(isBelowMinimumProfit(25, 20)).toBe(false);
  });
});

describe("computeTaxEstimate (§85 — explicitly an estimate, never real accounting)", () => {
  it("returns null when disabled", () => {
    expect(computeTaxEstimate(1000, 0.21, false)).toBeNull();
  });

  it("returns commercialTotal * rate when enabled", () => {
    expect(computeTaxEstimate(1000, 0.21, true)).toBe(210);
  });
});

describe("hasQuoteChanged (§91-93 final revalidation)", () => {
  it("detects a commercial total that moved since the customer last saw it", () => {
    const orgFee = computeOrganizationFee({ packageType: "TICKET_ONLY", partySize: 1, matchCount: 1, global, overrides: NO_OVERRIDES });
    const before = computeQuote({ costs: { ticketCostNetTotal: 50, hotelCostNetTotal: 0, flightCostNetTotal: 0, hostCostNetTotal: 0 }, orgFee, buffer: 0, paymentMethodInternalCost: 0 });
    const afterSamePrice = computeQuote({ costs: { ticketCostNetTotal: 50, hotelCostNetTotal: 0, flightCostNetTotal: 0, hostCostNetTotal: 0 }, orgFee, buffer: 0, paymentMethodInternalCost: 0 });
    const afterPriceMoved = computeQuote({ costs: { ticketCostNetTotal: 60, hotelCostNetTotal: 0, flightCostNetTotal: 0, hostCostNetTotal: 0 }, orgFee, buffer: 0, paymentMethodInternalCost: 0 });

    expect(hasQuoteChanged(before, afterSamePrice)).toBe(false);
    expect(hasQuoteChanged(before, afterPriceMoved)).toBe(true);
  });
});
