import { describe, it, expect } from "vitest";
import { normalizeRoundTripOffer } from "@/lib/providers/flights/duffel/normalize";
import { flightSliceKey, resolveRoundTripOffer } from "@/lib/providers/flights/duffel/roundTripSelection";

// Fase 2 §9 — resolveRoundTripOffer must not silently pick the cheaper of
// two offers for the same physical itinerary unless they're actually the
// same commercial product (cabin, fare brand, refund/change conditions,
// baggage) — never just "same flight, coincidentally cheaper".

function seg(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    origin: { iata_code: "BCN" },
    destination: { iata_code: "MAN" },
    departing_at: "2026-10-15T09:00:00",
    arriving_at: "2026-10-15T10:30:00",
    marketing_carrier: { iata_code: "VY", name: "Vueling" },
    operating_carrier: { iata_code: "VY", name: "Vueling" },
    marketing_carrier_flight_number: "8748",
    passengers: [{ cabin_class: "economy", baggages: [{ type: "checked", quantity: 1 }] }],
    ...overrides,
  };
}
const RETURN_SEG = seg({ origin: { iata_code: "MAN" }, destination: { iata_code: "BCN" }, departing_at: "2026-10-18T18:30:00", arriving_at: "2026-10-18T22:00:00", marketing_carrier_flight_number: "8749" });

function rawOffer(id: string, totalAmount: string, opts: { fareBrandName?: string | null; cabinClass?: string | null; refundAllowed?: boolean | null; conditions?: unknown } = {}) {
  const outboundSeg = seg(opts.cabinClass !== undefined ? { passengers: [{ cabin_class: opts.cabinClass, baggages: [{ type: "checked", quantity: 1 }] }] } : {});
  return {
    id,
    total_amount: totalAmount,
    total_currency: "EUR",
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    slices: [
      { segments: [outboundSeg], fare_brand_name: opts.fareBrandName === undefined ? "Basic" : opts.fareBrandName },
      { segments: [RETURN_SEG] },
    ],
    conditions:
      opts.conditions !== undefined
        ? opts.conditions
        : opts.refundAllowed === undefined
          ? undefined
          : { refund_before_departure: { allowed: opts.refundAllowed, penalty_amount: opts.refundAllowed ? "30.00" : null, penalty_currency: opts.refundAllowed ? "EUR" : null } },
  };
}

describe("normalization — cabin/fare brand/refund-change conditions come from real Duffel fields, never invented", () => {
  it("reads cabin_class, fare_brand_name and conditions.refund_before_departure verbatim", () => {
    const offer = normalizeRoundTripOffer(rawOffer("off_1", "120.00", { fareBrandName: "Flex", cabinClass: "business", refundAllowed: true }) as never, false, "orq_1", []);
    expect(offer.fareConditions.cabinClass).toBe("business");
    expect(offer.fareConditions.fareBrandName).toBe("Flex");
    expect(offer.fareConditions.refundBeforeDeparture).toEqual({ allowed: true, penaltyAmount: 30, penaltyCurrency: "EUR" });
  });

  it("leaves refundBeforeDeparture/changeBeforeDeparture null when Duffel doesn't provide `conditions` at all — never guessed", () => {
    const offer = normalizeRoundTripOffer(rawOffer("off_1", "120.00", { conditions: undefined }) as never, false, "orq_1", []);
    expect(offer.fareConditions.refundBeforeDeparture).toBeNull();
    expect(offer.fareConditions.changeBeforeDeparture).toBeNull();
  });
});

describe("M — resolveRoundTripOffer refuses to pick the cheapest when offers are not commercially comparable", () => {
  it("same itinerary, same fare conditions, different price -> cheapest wins (genuinely comparable)", () => {
    const cheap = normalizeRoundTripOffer(rawOffer("off_cheap", "100.00", { fareBrandName: "Basic", refundAllowed: false }) as never, false, "orq_1", []);
    const expensive = normalizeRoundTripOffer(rawOffer("off_expensive", "150.00", { fareBrandName: "Basic", refundAllowed: false }) as never, false, "orq_1", []);
    const outboundKey = flightSliceKey(cheap.outbound);
    const returnKey = flightSliceKey(cheap.return);
    const result = resolveRoundTripOffer([cheap, expensive], outboundKey, returnKey);
    expect(result).toEqual({ ok: true, offer: cheap });
  });

  it("same itinerary, DIFFERENT fare brand/refund conditions, cheaper one -> not_comparable, never auto-selected", () => {
    const basicNonRefundable = normalizeRoundTripOffer(rawOffer("off_basic", "100.00", { fareBrandName: "Basic", refundAllowed: false }) as never, false, "orq_1", []);
    const flexRefundable = normalizeRoundTripOffer(rawOffer("off_flex", "150.00", { fareBrandName: "Flex", refundAllowed: true }) as never, false, "orq_1", []);
    const outboundKey = flightSliceKey(basicNonRefundable.outbound);
    const returnKey = flightSliceKey(basicNonRefundable.return);
    const result = resolveRoundTripOffer([basicNonRefundable, flexRefundable], outboundKey, returnKey);
    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === "not_comparable") {
      expect(result.candidates.map((o) => o.offerId).sort()).toEqual(["off_basic", "off_flex"]);
    } else {
      throw new Error("expected not_comparable");
    }
  });

  it("same itinerary, different cabin class, cheaper one -> not_comparable (a Business fare and an Economy fare are not the same product)", () => {
    const economy = normalizeRoundTripOffer(rawOffer("off_eco", "100.00", { cabinClass: "economy" }) as never, false, "orq_1", []);
    const business = normalizeRoundTripOffer(rawOffer("off_biz", "300.00", { cabinClass: "business" }) as never, false, "orq_1", []);
    const outboundKey = flightSliceKey(economy.outbound);
    const returnKey = flightSliceKey(economy.return);
    const result = resolveRoundTripOffer([economy, business], outboundKey, returnKey);
    expect(result.ok).toBe(false);
  });

  it("same itinerary, same fare conditions, same baggage -> comparable even with baggage present", () => {
    const a = normalizeRoundTripOffer(rawOffer("off_a", "100.00", { fareBrandName: "Basic" }) as never, false, "orq_1", []);
    const b = normalizeRoundTripOffer(rawOffer("off_b", "90.00", { fareBrandName: "Basic" }) as never, false, "orq_1", []);
    const result = resolveRoundTripOffer([a, b], flightSliceKey(a.outbound), flightSliceKey(a.return));
    expect(result).toEqual({ ok: true, offer: b });
  });
});
