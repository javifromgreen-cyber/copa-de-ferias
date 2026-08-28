import { describe, it, expect } from "vitest";
import { computeTicketOnlyFromPricePerPerson } from "@/lib/checkout-atu-aire/publicPrice";

const feeConfig = {
  feeTicketOnly: 49,
  feeHotelTiers: JSON.stringify([{ minParty: 1, maxParty: 10, feePerTraveler: 90 }]),
  feeHotelFlightTiers: JSON.stringify([{ minParty: 1, maxParty: 10, feePerTraveler: 149 }]),
  additionalMatchFee: 25,
};
const tripOverrides = { orgFeeTicketOnlyOverride: null, orgFeeHotelTiersOverride: "", orgFeeHotelFlightTiersOverride: "", additionalMatchFeeOverride: null };

describe("computeTicketOnlyFromPricePerPerson — the public ficha price (§8/§42)", () => {
  it("is the cheapest TicketOffer per Event plus the TICKET_ONLY organization fee — never hotel/flight", () => {
    const price = computeTicketOnlyFromPricePerPerson({
      events: [{ id: "ev1" }],
      ticketOffersByEventId: { ev1: [{ costNet: 95 }, { costNet: 60 }] },
      feeConfig,
      tripOverrides,
    });
    expect(price).toBe(60 + 49);
  });

  it("sums the cheapest offer across every Event for a multi-match product", () => {
    const price = computeTicketOnlyFromPricePerPerson({
      events: [{ id: "ev1" }, { id: "ev2" }],
      ticketOffersByEventId: { ev1: [{ costNet: 60 }], ev2: [{ costNet: 70 }, { costNet: 110 }] },
      feeConfig,
      tripOverrides,
    });
    // Cheapest per event (60 + 70) plus the fee for a 2-match product.
    expect(price).toBeGreaterThan(60 + 70);
  });

  it("returns null when an Event genuinely has no active TicketOffer yet — never invents a price", () => {
    const price = computeTicketOnlyFromPricePerPerson({
      events: [{ id: "ev1" }],
      ticketOffersByEventId: { ev1: [] },
      feeConfig,
      tripOverrides,
    });
    expect(price).toBeNull();
  });

  it("returns null for a product with no Events at all", () => {
    const price = computeTicketOnlyFromPricePerPerson({ events: [], ticketOffersByEventId: {}, feeConfig, tripOverrides });
    expect(price).toBeNull();
  });
});
