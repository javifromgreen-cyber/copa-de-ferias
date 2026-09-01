import { describe, it, expect } from "vitest";
import { buildOutboundOptions, buildReturnOptions, resolveOffer, sliceKey } from "@/components/checkout-real/flightSelectionClient";
import type { RealRoundTripOfferDTO } from "@/server/actions/real-checkout-search";

// Fase 2.5 §25 O/P/Q/R/T — the UI-only round-trip selection helpers
// (a client-safe mirror of duffel/roundTripSelection.ts's pure functions,
// operating on the plain serialized DTO shape). Same rules, same tests as
// the server-side originals, exercised here against the DTO type the
// browser actually receives.

function slice(originIata: string, destinationIata: string, departingAt: string, carrierIata = "VY", flightNumber = "1", operatingCarrierIata: string | null = null) {
  return { segments: [{ originIata, destinationIata, departingAt, arrivingAt: departingAt, carrierIata, carrierName: "Vueling", operatingCarrierIata, flightNumber }] };
}

function offer(id: string, amount: number, opts: { outboundDep?: string; returnDep?: string; outboundFlightNo?: string; returnFlightNo?: string; fareBrand?: string; refundAllowed?: boolean } = {}): RealRoundTripOfferDTO {
  return {
    offerId: id,
    totalAmount: amount,
    currency: "EUR",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    outbound: slice("MAD", "MAN", opts.outboundDep ?? "2026-11-14T09:00:00", "VY", opts.outboundFlightNo ?? "1"),
    return: slice("MAN", "MAD", opts.returnDep ?? "2026-11-16T18:00:00", "VY", opts.returnFlightNo ?? "2"),
    commercialProduct: {
      outbound: { cabinClass: "economy", fareBrandName: opts.fareBrand ?? "Basic", baggage: null },
      return: { cabinClass: "economy", fareBrandName: opts.fareBrand ?? "Basic", baggage: null },
      refundBeforeDeparture: { allowed: opts.refundAllowed ?? false, penaltyAmount: null, penaltyCurrency: null },
      changeBeforeDeparture: null,
    },
  };
}

describe("O — PASO IDA options are deduplicated across offers that share the same outbound flight", () => {
  it("two offers with the same outbound but different return produce ONE outbound option", () => {
    const a = offer("off_a", 100, { returnDep: "2026-11-16T18:00:00" });
    const b = offer("off_b", 110, { returnDep: "2026-11-16T20:00:00", returnFlightNo: "3" });
    const options = buildOutboundOptions([a, b], "ANY");
    expect(options).toHaveLength(1);
  });
});

describe("P — choosing an outbound restricts PASO VUELTA to compatible returns only", () => {
  it("a return belonging only to a different outbound never appears", () => {
    const a = offer("off_a", 100, { outboundFlightNo: "1", returnFlightNo: "2" });
    const b = offer("off_b", 120, { outboundFlightNo: "9", returnFlightNo: "3" }); // different outbound entirely
    const outboundKeyA = buildOutboundOptions([a, b], "ANY").find((o) => o.slice.segments[0].flightNumber === "1")!.key;
    const returns = buildReturnOptions([a, b], outboundKeyA, "ANY");
    expect(returns).toHaveLength(1);
    expect(returns[0].slice.segments[0].flightNumber).toBe("2");
  });
});

describe("Q — daypart preferences (mañana/tarde) apply independently to ida and vuelta", () => {
  it("ida mañana + vuelta tarde only keeps offers matching both, independently", () => {
    const morningOut_afternoonReturn = offer("off_1", 100, { outboundDep: "2026-11-14T08:00:00", returnDep: "2026-11-16T17:00:00" });
    const morningOut_morningReturn = offer("off_2", 105, { outboundDep: "2026-11-14T08:00:00", returnDep: "2026-11-16T07:00:00", returnFlightNo: "5" });

    const morningOutbound = buildOutboundOptions([morningOut_afternoonReturn, morningOut_morningReturn], "MORNING");
    expect(morningOutbound).toHaveLength(1); // both share the same morning outbound -> deduped to 1

    const afternoonReturns = buildReturnOptions([morningOut_afternoonReturn, morningOut_morningReturn], morningOutbound[0].key, "AFTERNOON");
    expect(afternoonReturns).toHaveLength(1);
    expect(afternoonReturns[0].slice.segments[0].flightNumber).toBe("2");
  });
});

describe("R — final selection resolves to exactly ONE offerId, never a pair", () => {
  it("resolveOffer returns a single RealRoundTripOfferDTO with one offerId", () => {
    const a = offer("off_a", 100);
    const outboundKey = buildOutboundOptions([a], "ANY")[0].key;
    const returnKey = buildReturnOptions([a], outboundKey, "ANY")[0].key;
    const result = resolveOffer([a], outboundKey, returnKey);
    expect(result).toEqual({ ok: true, offer: a });
  });
});

describe("T — a different commercial product on the same itinerary never collapses on price", () => {
  it("refuses to auto-select the cheaper of two offers with different fare brands", () => {
    const basic = offer("off_basic", 100, { fareBrand: "Basic", refundAllowed: false });
    const flex = offer("off_flex", 150, { fareBrand: "Flex", refundAllowed: true });
    const outboundKey = buildOutboundOptions([basic, flex], "ANY")[0].key;
    const returnKey = buildReturnOptions([basic, flex], outboundKey, "ANY")[0].key;
    const result = resolveOffer([basic, flex], outboundKey, returnKey);
    expect(result.ok).toBe(false);
  });
});

describe("Fase 2.6 §1/§9 A/B/C — not_comparable surfaces every candidate for an explicit Tarifa/Condiciones choice", () => {
  it("A — a single commercial product for the itinerary resolves automatically (no Tarifa step needed)", () => {
    const only = offer("off_only", 118, { fareBrand: "Basic", refundAllowed: false });
    const outboundKey = buildOutboundOptions([only], "ANY")[0].key;
    const returnKey = buildReturnOptions([only], outboundKey, "ANY")[0].key;
    const result = resolveOffer([only], outboundKey, returnKey);
    expect(result).toEqual({ ok: true, offer: only });
  });

  it("B — worked example: Economy Basic (118€, no bag) vs Economy Flex (143€, bag) both stay selectable, never a dead end", () => {
    const basic = offer("off_A", 118, { fareBrand: "Basic", refundAllowed: false });
    const flex = offer("off_B", 143, { fareBrand: "Flex", refundAllowed: true });
    const outboundKey = buildOutboundOptions([basic, flex], "ANY")[0].key;
    const returnKey = buildReturnOptions([basic, flex], outboundKey, "ANY")[0].key;
    const result = resolveOffer([basic, flex], outboundKey, returnKey);
    expect(result.ok).toBe(false);
    if (result.ok || result.reason !== "not_comparable") throw new Error("expected not_comparable with candidates");
    expect(result.candidates.map((c) => c.offerId).sort()).toEqual(["off_A", "off_B"]);
  });

  it("C — explicitly choosing candidate B (from the surfaced list) yields offerId off_B, never the cheaper A", () => {
    const basic = offer("off_A", 118, { fareBrand: "Basic", refundAllowed: false });
    const flex = offer("off_B", 143, { fareBrand: "Flex", refundAllowed: true });
    const outboundKey = buildOutboundOptions([basic, flex], "ANY")[0].key;
    const returnKey = buildReturnOptions([basic, flex], outboundKey, "ANY")[0].key;
    const result = resolveOffer([basic, flex], outboundKey, returnKey);
    if (result.ok || result.reason !== "not_comparable") throw new Error("expected not_comparable with candidates");
    const chosen = result.candidates.find((c) => c.offerId === "off_B");
    expect(chosen?.offerId).toBe("off_B");
    expect(chosen?.totalAmount).toBe(143);
  });
});

describe("H (closure §6) — sliceKey differentiates a genuine codeshare (same marketing carrier/flight/time, different operating carrier)", () => {
  it("two otherwise-identical slices with different operating carriers produce different keys", () => {
    const marketedByVueling = slice("MAD", "MAN", "2026-11-14T09:00:00", "VY", "8748", "VY");
    const operatedByIberia = slice("MAD", "MAN", "2026-11-14T09:00:00", "VY", "8748", "IB");
    expect(sliceKey(marketedByVueling)).not.toBe(sliceKey(operatedByIberia));
  });

  it("null operating carrier (not reported) is a distinct identity from an explicit one matching the marketing carrier", () => {
    const noOperatingCarrierReported = slice("MAD", "MAN", "2026-11-14T09:00:00", "VY", "8748", null);
    const explicitlySelfOperated = slice("MAD", "MAN", "2026-11-14T09:00:00", "VY", "8748", "VY");
    // Both represent "operated by Vueling itself" in practice, but the
    // identity is intentionally literal about what Duffel actually
    // reported — never inferring "same as marketing" when the field was
    // simply absent.
    expect(sliceKey(noOperatingCarrierReported)).not.toBe(sliceKey(explicitlySelfOperated));
  });

  it("identical operating carrier on both sides still resolves to the same key (no false split)", () => {
    const a = slice("MAD", "MAN", "2026-11-14T09:00:00", "VY", "8748", "IB");
    const b = slice("MAD", "MAN", "2026-11-14T09:00:00", "VY", "8748", "IB");
    expect(sliceKey(a)).toBe(sliceKey(b));
  });
});
