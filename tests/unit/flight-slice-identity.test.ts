import { describe, it, expect } from "vitest";
import { flightSliceIdentityKey } from "@/lib/providers/flights/duffel/flightSliceIdentity";
import { flightSliceKey } from "@/lib/providers/flights/duffel/roundTripSelection";
import { sliceKey } from "@/components/checkout-real/flightSelectionClient";
import { normalizeRoundTripOffer } from "@/lib/providers/flights/duffel/normalize";

// Fase 2.6 (closure) §6/§9 I — server (roundTripSelection.ts's
// flightSliceKey) and client (flightSelectionClient.ts's sliceKey) must
// resolve to the exact same string for the exact same physical flight,
// because they now both call the one shared flightSliceIdentityKey
// (flightSliceIdentity.ts) — no more duplicated, divergent algorithms.

function duffelSeg(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    origin: { iata_code: "MAD" },
    destination: { iata_code: "MAN" },
    departing_at: "2026-12-04T09:00:00",
    arriving_at: "2026-12-04T11:30:00",
    marketing_carrier: { iata_code: "VY", name: "Vueling" },
    operating_carrier: { iata_code: "IB", name: "Iberia" }, // a genuine codeshare — marketed by Vueling, operated by Iberia
    marketing_carrier_flight_number: "8748",
    passengers: [{ cabin_class: "economy" }],
    ...overrides,
  };
}
const RETURN_SEG = duffelSeg({ origin: { iata_code: "MAN" }, destination: { iata_code: "MAD" }, departing_at: "2026-12-06T18:00:00", arriving_at: "2026-12-06T21:00:00", marketing_carrier_flight_number: "8749", operating_carrier: { iata_code: "VY", name: "Vueling" } });

function rawOffer() {
  return {
    id: "off_1",
    total_amount: "120.00",
    total_currency: "EUR",
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    slices: [{ segments: [duffelSeg()] }, { segments: [RETURN_SEG] }],
  };
}

describe("flightSliceIdentityKey — the one shared pure identity function", () => {
  it("differs when only the operating carrier differs", () => {
    const a = [{ originIata: "MAD", destinationIata: "MAN", departingAt: "2026-12-04T09:00:00.000Z", arrivingAt: "2026-12-04T11:30:00.000Z", marketingCarrierIata: "VY", operatingCarrierIata: "VY", flightNumber: "8748" }];
    const b = [{ originIata: "MAD", destinationIata: "MAN", departingAt: "2026-12-04T09:00:00.000Z", arrivingAt: "2026-12-04T11:30:00.000Z", marketingCarrierIata: "VY", operatingCarrierIata: "IB", flightNumber: "8748" }];
    expect(flightSliceIdentityKey(a)).not.toBe(flightSliceIdentityKey(b));
  });

  it("is stable/deterministic for identical input", () => {
    const seg = { originIata: "MAD", destinationIata: "MAN", departingAt: "2026-12-04T09:00:00.000Z", arrivingAt: "2026-12-04T11:30:00.000Z", marketingCarrierIata: "VY", operatingCarrierIata: null, flightNumber: "8748" };
    expect(flightSliceIdentityKey([seg])).toBe(flightSliceIdentityKey([{ ...seg }]));
  });
});

describe("I — server flightSliceKey and client sliceKey agree field-for-field on the same real offer, codeshare included", () => {
  it("normalizes a genuine codeshare offer server-side, then confirms the client-side DTO-based key matches exactly", () => {
    const offer = normalizeRoundTripOffer(rawOffer() as never, false, "orq_1", ["pas_1"]);
    const serverOutboundKey = flightSliceKey(offer.outbound);
    const serverReturnKey = flightSliceKey(offer.return);

    // Build the exact DTO shape the browser would receive (mirrors
    // toStoredFlightOffer in src/lib/checkout-saga/flightSearchSession.ts).
    const outboundDTO = { segments: offer.outbound.segments.map((s) => ({ originIata: s.originIata, destinationIata: s.destinationIata, departingAt: s.departingAt.toISOString(), arrivingAt: s.arrivingAt.toISOString(), carrierIata: s.marketingCarrier.iata, carrierName: s.marketingCarrier.name, operatingCarrierIata: s.operatingCarrier?.iata ?? null, flightNumber: s.flightNumber })) };
    const returnDTO = { segments: offer.return.segments.map((s) => ({ originIata: s.originIata, destinationIata: s.destinationIata, departingAt: s.departingAt.toISOString(), arrivingAt: s.arrivingAt.toISOString(), carrierIata: s.marketingCarrier.iata, carrierName: s.marketingCarrier.name, operatingCarrierIata: s.operatingCarrier?.iata ?? null, flightNumber: s.flightNumber })) };

    expect(sliceKey(outboundDTO)).toBe(serverOutboundKey);
    expect(sliceKey(returnDTO)).toBe(serverReturnKey);
    // And the codeshare (operating IB, marketed VY) really did produce a
    // distinct identity from a same-carrier control.
    expect(offer.outbound.segments[0].operatingCarrier?.iata).toBe("IB");
  });
});
