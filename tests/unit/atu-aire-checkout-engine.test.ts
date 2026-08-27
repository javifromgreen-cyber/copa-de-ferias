import { describe, it, expect } from "vitest";
import { packageRequiresHotel, packageRequiresFlight } from "@/lib/checkout-atu-aire/packageRequirements";
import { buildTicketCategoryOptions } from "@/lib/checkout-atu-aire/ticketOptions";
import { buildHotelOptions } from "@/lib/checkout-atu-aire/hotelOptions";
import { buildOutboundPreferenceOptions, buildReturnPreferenceOptions, filterFlightOffersForSelection } from "@/lib/checkout-atu-aire/flightOptions";
import { derivePriceLabel } from "@/lib/checkout-atu-aire/priceLabel";
import { buildAtuAireQuote } from "@/lib/checkout-atu-aire/quoteBuilder";
import { computeStayWindowBounds } from "@/lib/pricing/flightWindow";
import { computeRequiredRoomMix } from "@/lib/pricing/roomMix";
import type { NormalizedFlightOffer, NormalizedHotelOffer } from "@/lib/providers/types";
import type { AtuAireQuoteData, AtuAireSelection } from "@/lib/checkout-atu-aire/types";
import { DEFAULT_SELECTION } from "@/lib/checkout-atu-aire/types";

describe("packageRequirements (§31)", () => {
  it("TICKET_ONLY requires neither hotel nor flight", () => {
    expect(packageRequiresHotel("TICKET_ONLY")).toBe(false);
    expect(packageRequiresFlight("TICKET_ONLY")).toBe(false);
  });
  it("TICKET_HOTEL requires hotel but not flight", () => {
    expect(packageRequiresHotel("TICKET_HOTEL")).toBe(true);
    expect(packageRequiresFlight("TICKET_HOTEL")).toBe(false);
  });
  it("TICKET_HOTEL_FLIGHT requires both", () => {
    expect(packageRequiresHotel("TICKET_HOTEL_FLIGHT")).toBe(true);
    expect(packageRequiresFlight("TICKET_HOTEL_FLIGHT")).toBe(true);
  });
});

describe("buildTicketCategoryOptions", () => {
  it("sorts cheapest-first and computes deltas relative to the cheapest", () => {
    const options = buildTicketCategoryOptions(
      [
        { id: "t1", category: "Tribuna", sector: "Lateral", costNet: 95, restrictions: "" },
        { id: "t2", category: "General", sector: "Fondo", costNet: 60, restrictions: "" },
      ],
      10, // other events' cheapest offers
    );
    expect(options[0].category).toBe("General");
    expect(options[0].deltaFromCheapest).toBe(0);
    expect(options[1].category).toBe("Tribuna");
    expect(options[1].deltaFromCheapest).toBe(35);
    expect(options[0].totalCostNetPerPerson).toBe(70); // 60 + 10 other-event cost
  });
});

function hotel(overrides: Partial<NormalizedHotelOffer>): NormalizedHotelOffer {
  return {
    id: "h1",
    provider: "mockA",
    name: "Test Hotel",
    stars: 4,
    zone: "Centro",
    pricePerNight: { single: 80, double: 50, triple: 40 },
    roomsAvailable: { single: 5, double: 5, triple: 0 },
    validUntil: null,
    ...overrides,
  };
}

describe("buildHotelOptions", () => {
  it("marks an invalid offer but still returns it, sorted after valid ones", () => {
    const mix = computeRequiredRoomMix(3); // needs 1 triple
    const cheapInvalid = hotel({ id: "a", roomsAvailable: { single: 5, double: 5, triple: 0 }, pricePerNight: { single: 50, double: 30, triple: 20 } });
    const pricierValid = hotel({ id: "b", roomsAvailable: { single: 5, double: 5, triple: 2 }, pricePerNight: { single: 90, double: 60, triple: 50 } });
    const options = buildHotelOptions([cheapInvalid, pricierValid], mix, 1, 3);
    expect(options[0].offer.id).toBe("b");
    expect(options[0].valid).toBe(true);
    expect(options[1].offer.id).toBe("a");
    expect(options[1].valid).toBe(false);
    expect(options[1].invalidReason).toBeTruthy();
  });
});

function flightOffer(overrides: Partial<NormalizedFlightOffer>): NormalizedFlightOffer {
  return {
    id: "f1",
    provider: "mock",
    originAirport: "MAD",
    destinationAirport: "AMS",
    outboundDeparture: new Date(2026, 5, 10, 9),
    outboundArrival: new Date(2026, 5, 10, 12),
    returnDeparture: new Date(2026, 5, 12, 21),
    returnArrival: new Date(2026, 5, 13, 0),
    pricePerPerson: 100,
    ...overrides,
  };
}

const bounds = computeStayWindowBounds({
  eventDates: [new Date(2026, 5, 11, 20)],
  minimumArrivalBufferBeforeKickoffMinutes: 180,
  minimumReturnBufferAfterEventMinutes: 120,
});

describe("daypart preference filtering (§31)", () => {
  const morningOut = flightOffer({ id: "morning", outboundDeparture: new Date(2026, 5, 10, 8), pricePerPerson: 112 });
  const afternoonOut = flightOffer({ id: "afternoon", outboundDeparture: new Date(2026, 5, 10, 17), pricePerPerson: 94 });
  const offers = [morningOut, afternoonOut];

  it("ANY accepts both morning and afternoon offers", () => {
    const result = filterFlightOffersForSelection(offers, bounds, "ANY", "ANY");
    expect(result.map((o) => o.id).sort()).toEqual(["afternoon", "morning"]);
  });

  it("MORNING excludes the afternoon offer", () => {
    const result = filterFlightOffersForSelection(offers, bounds, "MORNING", "ANY");
    expect(result.map((o) => o.id)).toEqual(["morning"]);
  });

  it("AFTERNOON excludes the morning offer", () => {
    const result = filterFlightOffersForSelection(offers, bounds, "AFTERNOON", "ANY");
    expect(result.map((o) => o.id)).toEqual(["afternoon"]);
  });
});

describe("independent outbound/return preferences (§15/§31)", () => {
  const cheapMorningOutAnyReturn = flightOffer({ id: "a", outboundDeparture: new Date(2026, 5, 10, 8), returnDeparture: new Date(2026, 5, 12, 8), pricePerPerson: 90 });
  const afternoonOutMorningReturn = flightOffer({ id: "b", outboundDeparture: new Date(2026, 5, 10, 17), returnDeparture: new Date(2026, 5, 12, 9), pricePerPerson: 130 });
  const offers = [cheapMorningOutAnyReturn, afternoonOutMorningReturn];

  it("changing only the return preference doesn't affect an already-fixed outbound preference's own filter", () => {
    const withAnyReturn = filterFlightOffersForSelection(offers, bounds, "MORNING", "ANY");
    const withMorningReturn = filterFlightOffersForSelection(offers, bounds, "MORNING", "MORNING");
    expect(withAnyReturn.map((o) => o.id)).toEqual(["a"]); // only offer "a" has morning outbound
    expect(withMorningReturn.map((o) => o.id)).toEqual(["a"]); // "a" also has a morning return
  });

  it("outbound preference options are priced holding the current return preference, not a fixed default", () => {
    const optionsReturnAny = buildOutboundPreferenceOptions(offers, bounds, "ANY");
    const morningOption = optionsReturnAny.find((o) => o.value === "MORNING");
    expect(morningOption?.priceFromPerPerson).toBe(90); // cheapest morning-outbound offer regardless of return

    const optionsReturnMorning = buildReturnPreferenceOptions(offers, bounds, "MORNING");
    const anyReturnOption = optionsReturnMorning.find((o) => o.value === "ANY");
    expect(anyReturnOption?.priceFromPerPerson).toBe(90); // still constrained by outbound=MORNING
  });
});

describe("buffer viability (§18/§31)", () => {
  it("a preference matching only offers outside the safe window returns no results, never an unsafe one", () => {
    const tooLateArrival = flightOffer({ id: "late", outboundDeparture: new Date(2026, 5, 11, 15), outboundArrival: new Date(2026, 5, 11, 18) }); // after 17:00 latest-arrival bound, same day as kickoff
    const result = filterFlightOffersForSelection([tooLateArrival], bounds, "AFTERNOON", "ANY");
    expect(result).toEqual([]);
  });

  it("preference price options report null (no price) rather than an unsafe fallback when nothing qualifies", () => {
    const tooLateArrival = flightOffer({ id: "late", outboundDeparture: new Date(2026, 5, 11, 15), outboundArrival: new Date(2026, 5, 11, 18) });
    const options = buildOutboundPreferenceOptions([tooLateArrival], bounds, "ANY");
    expect(options.every((o) => o.priceFromPerPerson === null)).toBe(true);
  });
});

describe("derivePriceLabel (§6/§31)", () => {
  it("is 'from' until a party size exists", () => {
    expect(derivePriceLabel({ hasPartySize: false, ticketSelected: false, hotelRequired: false, hotelSelected: false, flightRequired: false, flightSelected: false, revalidated: false })).toBe("from");
  });
  it("is 'estimated' once party size exists but something required is still missing", () => {
    expect(derivePriceLabel({ hasPartySize: true, ticketSelected: false, hotelRequired: false, hotelSelected: false, flightRequired: false, flightSelected: false, revalidated: false })).toBe("estimated");
  });
  it("is 'total' only once everything required is selected AND revalidated", () => {
    expect(derivePriceLabel({ hasPartySize: true, ticketSelected: true, hotelRequired: true, hotelSelected: true, flightRequired: false, flightSelected: false, revalidated: true })).toBe("total");
    expect(derivePriceLabel({ hasPartySize: true, ticketSelected: true, hotelRequired: true, hotelSelected: true, flightRequired: false, flightSelected: false, revalidated: false })).toBe("estimated");
  });
});

// ---------------------------------------------------------------------
// Full-quote integration through buildAtuAireQuote — proves price
// recomputes on every selection change and that provisional schedules
// block flights, using the same pure function the checkout UI consumes.
// ---------------------------------------------------------------------
function baseData(overrides: Partial<AtuAireQuoteData> = {}): AtuAireQuoteData {
  const primary = { id: "ev1", homeTeam: "Home", awayTeam: "Away", stadium: "Stadium", city: "City", matchDate: new Date(2026, 5, 11, 20), scheduleStatus: "confirmed" as const, primaryEvent: true };
  return {
    trip: {
      id: "trip1",
      slug: "demo",
      name: "Demo",
      subtitle: "",
      city: "City",
      maxPartySize: 10,
      availablePackageTypes: ["TICKET_ONLY", "TICKET_HOTEL", "TICKET_HOTEL_FLIGHT"],
      minimumArrivalBufferBeforeKickoffMinutes: 180,
      minimumReturnBufferAfterEventMinutes: 120,
      orgFeeTicketOnlyOverride: null,
      orgFeeHotelTiersOverride: "",
      orgFeeHotelFlightTiersOverride: "",
      additionalMatchFeeOverride: null,
    },
    events: [primary],
    ticketOffersByEventId: { ev1: [{ id: "t1", category: "General", sector: "Fondo", costNet: 60, restrictions: "" }, { id: "t2", category: "Tribuna", sector: "Lateral", costNet: 95, restrictions: "" }] },
    hotelOffers: [hotel({ id: "hA", roomsAvailable: { single: 6, double: 10, triple: 0 }, pricePerNight: { single: 70, double: 45, triple: 38 } }), hotel({ id: "hB", roomsAvailable: { single: 8, double: 8, triple: 4 }, pricePerNight: { single: 90, double: 60, triple: 52 } })],
    flightOffers: [flightOffer({ id: "f1", pricePerPerson: 120 })],
    feeConfig: {
      feeTicketOnly: 49,
      feeHotelTiers: JSON.stringify([{ minParty: 1, maxParty: 10, feePerTraveler: 90 }]),
      feeHotelFlightTiers: JSON.stringify([{ minParty: 1, maxParty: 10, feePerTraveler: 149 }]),
      additionalMatchFee: 25,
    },
    revalidated: false,
    ...overrides,
  };
}

describe("buildAtuAireQuote — price recompute on each decision (§31)", () => {
  it("recomputes when partySize changes", () => {
    const data = baseData();
    const sel1: AtuAireSelection = { ...DEFAULT_SELECTION, packageType: "TICKET_ONLY", partySize: 1 };
    const sel2: AtuAireSelection = { ...sel1, partySize: 2 };
    const q1 = buildAtuAireQuote(data, sel1);
    const q2 = buildAtuAireQuote(data, sel2);
    expect(q2.price.totalCommercial).toBe((q1.price.totalCommercial ?? 0) * 2);
  });

  it("recomputes when the ticket category changes", () => {
    const data = baseData();
    const cheap: AtuAireSelection = { ...DEFAULT_SELECTION, packageType: "TICKET_ONLY", partySize: 1, ticketCategory: "General" };
    const pricier: AtuAireSelection = { ...cheap, ticketCategory: "Tribuna" };
    const q1 = buildAtuAireQuote(data, cheap);
    const q2 = buildAtuAireQuote(data, pricier);
    expect(q2.price.totalCommercial).toBeGreaterThan(q1.price.totalCommercial ?? 0);
  });

  it("recomputes when nights change (hotel package)", () => {
    const data = baseData();
    const oneNight: AtuAireSelection = { ...DEFAULT_SELECTION, packageType: "TICKET_HOTEL", partySize: 2, ticketCategory: "General", hotelOfferId: "hB", nights: 1 };
    const twoNights: AtuAireSelection = { ...oneNight, nights: 2 };
    const q1 = buildAtuAireQuote(data, oneNight);
    const q2 = buildAtuAireQuote(data, twoNights);
    expect(q2.price.totalCommercial).toBeGreaterThan(q1.price.totalCommercial ?? 0);
  });

  it("recomputes when the hotel offer changes", () => {
    const data = baseData();
    const withA: AtuAireSelection = { ...DEFAULT_SELECTION, packageType: "TICKET_HOTEL", partySize: 2, ticketCategory: "General", hotelOfferId: "hA", nights: 1 };
    const withB: AtuAireSelection = { ...withA, hotelOfferId: "hB" };
    const q1 = buildAtuAireQuote(data, withA);
    const q2 = buildAtuAireQuote(data, withB);
    expect(q1.price.totalCommercial).not.toBe(q2.price.totalCommercial);
  });

  it("never offers an invalid hotel as selectable — a 3-traveler party excludes zero-triple hA from selection", () => {
    const data = baseData();
    const sel: AtuAireSelection = { ...DEFAULT_SELECTION, packageType: "TICKET_HOTEL", partySize: 3, ticketCategory: "General", nights: 1 };
    const quote = buildAtuAireQuote(data, sel);
    const optionA = quote.hotelOptions.find((h) => h.offer.id === "hA");
    const optionB = quote.hotelOptions.find((h) => h.offer.id === "hB");
    expect(optionA?.valid).toBe(false);
    expect(optionB?.valid).toBe(true);
  });

  it("recomputes when a concrete flight offer changes", () => {
    const data = baseData({ flightOffers: [flightOffer({ id: "cheap", pricePerPerson: 80 }), flightOffer({ id: "pricier", pricePerPerson: 150 })] });
    const sel: AtuAireSelection = { ...DEFAULT_SELECTION, packageType: "TICKET_HOTEL_FLIGHT", partySize: 1, ticketCategory: "General", hotelOfferId: "hB", nights: 1 };
    const withCheap = buildAtuAireQuote(data, { ...sel, flightOfferId: "cheap" });
    const withPricier = buildAtuAireQuote(data, { ...sel, flightOfferId: "pricier" });
    expect(withPricier.price.totalCommercial).toBeGreaterThan(withCheap.price.totalCommercial ?? 0);
  });

  it("applies the additional-match fee once a second Event exists", () => {
    const oneMatch = baseData();
    const twoMatches = baseData({ events: [...oneMatch.events, { id: "ev2", homeTeam: "H2", awayTeam: "A2", stadium: "S2", city: "City", matchDate: new Date(2026, 5, 12, 20), scheduleStatus: "confirmed", primaryEvent: false }], ticketOffersByEventId: { ...oneMatch.ticketOffersByEventId, ev2: [{ id: "t3", category: "General", sector: "", costNet: 60, restrictions: "" }] } });
    const sel: AtuAireSelection = { ...DEFAULT_SELECTION, packageType: "TICKET_ONLY", partySize: 1, ticketCategory: "General" };
    const q1 = buildAtuAireQuote(oneMatch, sel);
    const q2 = buildAtuAireQuote(twoMatches, sel);
    expect(q2.additionalMatchFeeApplies).toBe(true);
    expect(q2.price.totalCommercial).toBeGreaterThan(q1.price.totalCommercial ?? 0);
  });

  it("blocks flight selection outright when an Event is provisional", () => {
    const data = baseData({ events: [{ ...baseData().events[0], scheduleStatus: "provisional" }] });
    const sel: AtuAireSelection = { ...DEFAULT_SELECTION, packageType: "TICKET_HOTEL_FLIGHT", partySize: 1, ticketCategory: "General", hotelOfferId: "hB", nights: 1 };
    const quote = buildAtuAireQuote(data, sel);
    expect(quote.flightAvailability.blocked).toBe(true);
    expect(quote.flightOffers).toEqual([]);
    expect(quote.price.label).not.toBe("total");
    expect(quote.price.missing.some((m) => m.includes("vuelo"))).toBe(true);
  });

  it("shows only the enabled package types, in the order the trip configures them", () => {
    const data = baseData({ trip: { ...baseData().trip, availablePackageTypes: ["TICKET_ONLY"] } });
    const quote = buildAtuAireQuote(data, DEFAULT_SELECTION);
    expect(quote.packageTypeOptions.map((o) => o.packageType)).toEqual(["TICKET_ONLY"]);
  });

  it("shows a 'desde' price per person before any party size is chosen", () => {
    const data = baseData();
    const quote = buildAtuAireQuote(data, DEFAULT_SELECTION);
    expect(quote.price.label).toBe("from");
    for (const option of quote.packageTypeOptions) {
      expect(option.fromPricePerPerson).toBeGreaterThan(0);
    }
  });
});
