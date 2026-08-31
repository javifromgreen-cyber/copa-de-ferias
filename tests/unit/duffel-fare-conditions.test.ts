import { describe, it, expect } from "vitest";
import { normalizeRoundTripOffer } from "@/lib/providers/flights/duffel/normalize";
import { flightSliceKey, resolveRoundTripOffer } from "@/lib/providers/flights/duffel/roundTripSelection";

// Fase 2.5 §1-§4 — resolveRoundTripOffer must not silently pick the
// cheaper of two offers for the same physical itinerary unless they are
// actually the same commercial product: same cabin, same fare brand, same
// baggage, same refund/change conditions, on BOTH the outbound AND the
// return slice. Fase 2's `fareConditions` only ever captured the
// OUTBOUND slice's product and silently dropped the return's — this file
// locks in the fix (the per-slice `commercialProduct.outbound` /
// `commercialProduct.return` split) and the worked example from the
// brief: same flights + different fare product must never collapse on
// price; same flights + same product + different price must resolve
// deterministically to the cheapest.

type SegOpts = { cabinClass?: string | null; checkedBag?: boolean };

function outboundSeg(opts: SegOpts = {}) {
  return {
    origin: { iata_code: "BCN" },
    destination: { iata_code: "MAN" },
    departing_at: "2026-10-15T09:00:00",
    arriving_at: "2026-10-15T10:30:00",
    marketing_carrier: { iata_code: "VY", name: "Vueling" },
    operating_carrier: { iata_code: "VY", name: "Vueling" },
    marketing_carrier_flight_number: "8748",
    passengers: [{ cabin_class: opts.cabinClass ?? "economy", baggages: opts.checkedBag ? [{ type: "checked", quantity: 1 }] : [] }],
  };
}

function returnSeg(opts: SegOpts = {}) {
  return {
    origin: { iata_code: "MAN" },
    destination: { iata_code: "BCN" },
    departing_at: "2026-10-18T18:30:00",
    arriving_at: "2026-10-18T22:00:00",
    marketing_carrier: { iata_code: "VY", name: "Vueling" },
    operating_carrier: { iata_code: "VY", name: "Vueling" },
    marketing_carrier_flight_number: "8749",
    passengers: [{ cabin_class: opts.cabinClass ?? "economy", baggages: opts.checkedBag ? [{ type: "checked", quantity: 1 }] : [] }],
  };
}

type SliceOpts = { cabinClass?: string | null; fareBrandName?: string | null; checkedBag?: boolean };
type Penalty = { allowed: boolean; penaltyAmount?: number | null; penaltyCurrency?: string | null } | null;
type OfferOpts = { outbound?: SliceOpts; return?: SliceOpts; refund?: Penalty; change?: Penalty; currency?: string };

function toRawPenalty(p: Penalty) {
  if (p === null) return null;
  return { allowed: p.allowed, penalty_amount: p.penaltyAmount != null ? String(p.penaltyAmount) : null, penalty_currency: p.penaltyCurrency ?? null };
}

function rawOffer(id: string, totalAmount: string, opts: OfferOpts = {}) {
  const out = opts.outbound ?? {};
  const ret = opts.return ?? {};
  const conditions =
    opts.refund === undefined && opts.change === undefined
      ? undefined
      : {
          ...(opts.refund !== undefined ? { refund_before_departure: toRawPenalty(opts.refund) } : {}),
          ...(opts.change !== undefined ? { change_before_departure: toRawPenalty(opts.change) } : {}),
        };
  return {
    id,
    total_amount: totalAmount,
    total_currency: opts.currency ?? "EUR",
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    slices: [
      { segments: [outboundSeg({ cabinClass: out.cabinClass, checkedBag: out.checkedBag })], fare_brand_name: out.fareBrandName === undefined ? null : out.fareBrandName },
      { segments: [returnSeg({ cabinClass: ret.cabinClass, checkedBag: ret.checkedBag })], fare_brand_name: ret.fareBrandName === undefined ? null : ret.fareBrandName },
    ],
    conditions,
  };
}

function offer(id: string, amount: string, opts: OfferOpts = {}) {
  return normalizeRoundTripOffer(rawOffer(id, amount, opts) as never, false, "orq_1", []);
}

describe("normalization — commercialProduct comes from real Duffel fields, per slice, never borrowed from the other direction", () => {
  it("reads outbound cabin/fare brand/baggage independently from the return's", () => {
    const o = offer("off_1", "120.00", {
      outbound: { cabinClass: "business", fareBrandName: "Flex", checkedBag: true },
      return: { cabinClass: "economy", fareBrandName: "Basic", checkedBag: false },
    });
    expect(o.commercialProduct.outbound).toEqual({ cabinClass: "business", fareBrandName: "Flex", baggage: { checkedIncluded: true, carryOnIncluded: false } });
    expect(o.commercialProduct.return).toEqual({ cabinClass: "economy", fareBrandName: "Basic", baggage: null });
  });

  it("reads conditions.refund_before_departure / change_before_departure verbatim at the offer level", () => {
    const o = offer("off_1", "120.00", { refund: { allowed: true, penaltyAmount: 30, penaltyCurrency: "EUR" }, change: { allowed: false } });
    expect(o.commercialProduct.refundBeforeDeparture).toEqual({ allowed: true, penaltyAmount: 30, penaltyCurrency: "EUR" });
    expect(o.commercialProduct.changeBeforeDeparture).toEqual({ allowed: false, penaltyAmount: null, penaltyCurrency: null });
  });

  it("leaves refundBeforeDeparture/changeBeforeDeparture null when Duffel doesn't provide `conditions` at all — never guessed", () => {
    const o = offer("off_1", "120.00");
    expect(o.commercialProduct.refundBeforeDeparture).toBeNull();
    expect(o.commercialProduct.changeBeforeDeparture).toBeNull();
  });

  it("leaves baggage null when Duffel provides no baggage info at all on a slice — never invents '1 checked bag' from fare brand alone", () => {
    const o = offer("off_1", "120.00", { outbound: { fareBrandName: "Flex" } });
    expect(o.commercialProduct.outbound.baggage).toBeNull();
  });
});

describe("A — same itinerary, same commercial product (both slices), different price -> cheapest wins", () => {
  it("resolves deterministically to the cheaper genuinely-comparable offer", () => {
    const cheap = offer("off_cheap", "100.00", { outbound: { fareBrandName: "Basic" }, return: { fareBrandName: "Basic" }, refund: { allowed: false } });
    const expensive = offer("off_expensive", "150.00", { outbound: { fareBrandName: "Basic" }, return: { fareBrandName: "Basic" }, refund: { allowed: false } });
    const result = resolveRoundTripOffer([cheap, expensive], flightSliceKey(cheap.outbound), flightSliceKey(cheap.return));
    expect(result).toEqual({ ok: true, offer: cheap });
  });

  it("worked example (§4): Offer C (€120) vs Offer D (€124), same flights, same product -> €120 wins", () => {
    const c = offer("off_C", "120.00", { outbound: { fareBrandName: "Basic", checkedBag: true }, return: { fareBrandName: "Basic", checkedBag: true }, refund: { allowed: true, penaltyAmount: 20, penaltyCurrency: "EUR" } });
    const d = offer("off_D", "124.00", { outbound: { fareBrandName: "Basic", checkedBag: true }, return: { fareBrandName: "Basic", checkedBag: true }, refund: { allowed: true, penaltyAmount: 20, penaltyCurrency: "EUR" } });
    const result = resolveRoundTripOffer([c, d], flightSliceKey(c.outbound), flightSliceKey(c.return));
    expect(result).toEqual({ ok: true, offer: c });
  });
});

describe("B — same itinerary, different cabin class on either leg -> not_comparable, never auto-selected", () => {
  it("different outbound cabin", () => {
    const economy = offer("off_eco", "100.00", { outbound: { cabinClass: "economy" }, return: { cabinClass: "economy" } });
    const business = offer("off_biz", "300.00", { outbound: { cabinClass: "business" }, return: { cabinClass: "economy" } });
    const result = resolveRoundTripOffer([economy, business], flightSliceKey(economy.outbound), flightSliceKey(economy.return));
    expect(result.ok).toBe(false);
  });

  it("different return cabin (the leg Fase 2's model used to silently ignore)", () => {
    const economyBoth = offer("off_eco", "100.00", { outbound: { cabinClass: "economy" }, return: { cabinClass: "economy" } });
    const businessReturn = offer("off_mix", "180.00", { outbound: { cabinClass: "economy" }, return: { cabinClass: "business" } });
    const result = resolveRoundTripOffer([economyBoth, businessReturn], flightSliceKey(economyBoth.outbound), flightSliceKey(economyBoth.return));
    expect(result.ok).toBe(false);
  });
});

describe("C — same itinerary, different fare brand on either leg -> not_comparable", () => {
  it("different outbound fare brand, cheaper one -> refused, not auto-selected", () => {
    const basic = offer("off_basic", "100.00", { outbound: { fareBrandName: "Basic" }, return: { fareBrandName: "Basic" } });
    const flex = offer("off_flex", "150.00", { outbound: { fareBrandName: "Flex" }, return: { fareBrandName: "Basic" } });
    const result = resolveRoundTripOffer([basic, flex], flightSliceKey(basic.outbound), flightSliceKey(basic.return));
    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === "not_comparable") {
      expect(result.candidates.map((o) => o.offerId).sort()).toEqual(["off_basic", "off_flex"]);
    } else {
      throw new Error("expected not_comparable");
    }
  });

  it("different return fare brand -> refused too", () => {
    const basic = offer("off_basic", "100.00", { outbound: { fareBrandName: "Basic" }, return: { fareBrandName: "Basic" } });
    const flexReturn = offer("off_flex_ret", "110.00", { outbound: { fareBrandName: "Basic" }, return: { fareBrandName: "Flex" } });
    const result = resolveRoundTripOffer([basic, flexReturn], flightSliceKey(basic.outbound), flightSliceKey(basic.return));
    expect(result.ok).toBe(false);
  });
});

describe("D — same itinerary, different baggage on either leg -> not_comparable", () => {
  it("worked example (§4): Offer A (Economy Basic, no checked bag, €118) vs Offer B (same flights, Economy Flex, checked bag, €137) must NOT collapse", () => {
    const a = offer("off_A", "118.00", { outbound: { fareBrandName: "Basic", checkedBag: false }, return: { fareBrandName: "Basic", checkedBag: false } });
    const b = offer("off_B", "137.00", { outbound: { fareBrandName: "Flex", checkedBag: true }, return: { fareBrandName: "Flex", checkedBag: true } });
    const result = resolveRoundTripOffer([a, b], flightSliceKey(a.outbound), flightSliceKey(a.return));
    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === "not_comparable") {
      expect(result.candidates.map((o) => o.offerId).sort()).toEqual(["off_A", "off_B"]);
    } else {
      throw new Error("expected not_comparable — Offer A must not auto-win on price against a different commercial product");
    }
  });

  it("baggage differing only on the return leg still refuses", () => {
    const noBagReturn = offer("off_nobag", "100.00", { outbound: { fareBrandName: "Basic", checkedBag: true }, return: { fareBrandName: "Basic", checkedBag: false } });
    const bagReturn = offer("off_bag", "110.00", { outbound: { fareBrandName: "Basic", checkedBag: true }, return: { fareBrandName: "Basic", checkedBag: true } });
    const result = resolveRoundTripOffer([noBagReturn, bagReturn], flightSliceKey(noBagReturn.outbound), flightSliceKey(noBagReturn.return));
    expect(result.ok).toBe(false);
  });
});

describe("E — same itinerary, same cabin/fare/baggage, different refund/change conditions -> not_comparable", () => {
  it("different refund_before_departure -> refused even though both slices' products are identical", () => {
    const nonRefundable = offer("off_nr", "100.00", { outbound: { fareBrandName: "Basic" }, return: { fareBrandName: "Basic" }, refund: { allowed: false } });
    const refundable = offer("off_r", "130.00", { outbound: { fareBrandName: "Basic" }, return: { fareBrandName: "Basic" }, refund: { allowed: true, penaltyAmount: 20, penaltyCurrency: "EUR" } });
    const result = resolveRoundTripOffer([nonRefundable, refundable], flightSliceKey(nonRefundable.outbound), flightSliceKey(nonRefundable.return));
    expect(result.ok).toBe(false);
  });

  it("different change_before_departure -> refused", () => {
    const a = offer("off_a", "100.00", { outbound: { fareBrandName: "Basic" }, return: { fareBrandName: "Basic" }, change: { allowed: false } });
    const b = offer("off_b", "105.00", { outbound: { fareBrandName: "Basic" }, return: { fareBrandName: "Basic" }, change: { allowed: true, penaltyAmount: 15, penaltyCurrency: "EUR" } });
    const result = resolveRoundTripOffer([a, b], flightSliceKey(a.outbound), flightSliceKey(a.return));
    expect(result.ok).toBe(false);
  });

  it("one offer with conditions unknown (null) vs one with known refundable conditions -> refused, UNKNOWN never treated as equal to a known value", () => {
    const unknown = offer("off_unknown", "100.00", { outbound: { fareBrandName: "Basic" }, return: { fareBrandName: "Basic" } });
    const known = offer("off_known", "105.00", { outbound: { fareBrandName: "Basic" }, return: { fareBrandName: "Basic" }, refund: { allowed: true, penaltyAmount: 0, penaltyCurrency: "EUR" } });
    const result = resolveRoundTripOffer([unknown, known], flightSliceKey(unknown.outbound), flightSliceKey(unknown.return));
    expect(result.ok).toBe(false);
  });
});

describe("currency mismatch -> not_comparable regardless of product equality", () => {
  it("same product, different currency -> refused", () => {
    const eur = offer("off_eur", "100.00", { outbound: { fareBrandName: "Basic" }, return: { fareBrandName: "Basic" }, currency: "EUR" });
    const gbp = offer("off_gbp", "90.00", { outbound: { fareBrandName: "Basic" }, return: { fareBrandName: "Basic" }, currency: "GBP" });
    const result = resolveRoundTripOffer([eur, gbp], flightSliceKey(eur.outbound), flightSliceKey(eur.return));
    expect(result.ok).toBe(false);
  });
});
