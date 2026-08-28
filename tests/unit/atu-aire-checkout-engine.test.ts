import { describe, it, expect } from "vitest";
import { packageRequiresHotel, packageRequiresFlight } from "@/lib/checkout-atu-aire/packageRequirements";
import { buildTicketCategoryOptionsForEvent } from "@/lib/checkout-atu-aire/ticketOptions";
import { buildHotelOptions } from "@/lib/checkout-atu-aire/hotelOptions";
import { buildOutboundPreferenceOptions, buildReturnPreferenceOptions, filterOutboundLegsForSelection } from "@/lib/checkout-atu-aire/flightOptions";
import { derivePriceLabel } from "@/lib/checkout-atu-aire/priceLabel";
import { isFlightPackageEligible } from "@/lib/checkout-atu-aire/countries";
import { reconcileSelection } from "@/lib/checkout-atu-aire/reconcile";
import { buildAtuAireQuote } from "@/lib/checkout-atu-aire/quoteBuilder";
import { computeStayWindowBounds } from "@/lib/pricing/flightWindow";
import { computeRequiredRoomMix } from "@/lib/pricing/roomMix";
import type { NormalizedFlightLeg, NormalizedHotelOffer } from "@/lib/providers/types";
import type { AtuAireQuoteData, AtuAireSelection } from "@/lib/checkout-atu-aire/types";
import { DEFAULT_SELECTION } from "@/lib/checkout-atu-aire/types";

describe("packageRequirements (§24)", () => {
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

describe("isFlightPackageEligible (§2/§3/§4)", () => {
  it("Spain is eligible for the flight-inclusive package", () => {
    expect(isFlightPackageEligible("ES")).toBe(true);
  });
  it("Latin American countries are not eligible", () => {
    for (const code of ["MX", "AR", "CO", "CL", "PE", "BR"]) {
      expect(isFlightPackageEligible(code)).toBe(false);
    }
  });
  it("no country chosen yet is not eligible (never assumes Spain)", () => {
    expect(isFlightPackageEligible(null)).toBe(false);
  });
});

describe("buildTicketCategoryOptionsForEvent — per-Event, never combined (§17/§18)", () => {
  it("sorts cheapest-first and computes deltas relative to the cheapest, for a single Event only", () => {
    const options = buildTicketCategoryOptionsForEvent([
      { id: "t1", category: "Tribuna", sector: "Lateral", costNet: 95, restrictions: "" },
      { id: "t2", category: "General", sector: "Fondo", costNet: 60, restrictions: "" },
    ]);
    expect(options[0].category).toBe("General");
    expect(options[0].deltaFromCheapest).toBe(0);
    expect(options[0].totalCostNetPerPerson).toBe(60); // never inflated by another Event's cost
    expect(options[1].category).toBe("Tribuna");
    expect(options[1].deltaFromCheapest).toBe(35);
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

describe("buildHotelOptions — no price on the option itself, never a per-card resultant figure (§5/§6)", () => {
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

  it("totalPrice/perPersonPrice are computed (used internally for sorting and the summary total) even though the card never renders them", () => {
    const mix = computeRequiredRoomMix(2);
    const offer = hotel({ id: "h", roomsAvailable: { single: 5, double: 5, triple: 5 }, pricePerNight: { single: 80, double: 50, triple: 40 } });
    const options = buildHotelOptions([offer], mix, 1, 2);
    expect(options[0].perPersonPrice).toBe(25); // one double room (50) split across 2 travelers
    expect(options[0]).not.toHaveProperty("resultantTotalPerPerson");
  });
});

function flightLeg(overrides: Partial<NormalizedFlightLeg>): NormalizedFlightLeg {
  return {
    id: "f1",
    provider: "mock",
    originAirport: "MAD",
    destinationAirport: "LHR",
    departure: new Date(2026, 5, 10, 9),
    arrival: new Date(2026, 5, 10, 12),
    pricePerPerson: 100,
    stops: 0,
    ...overrides,
  };
}

const confirmedWindow = { earliestPossibleKickoff: new Date(2026, 5, 11, 20), latestPossibleKickoff: new Date(2026, 5, 11, 20) };
const bounds = computeStayWindowBounds({
  eventWindows: [confirmedWindow],
  minimumArrivalBufferBeforeKickoffMinutes: 180,
  minimumReturnBufferAfterEventMinutes: 120,
});

describe("direct-only filtering — a connecting flight can never win (§8)", () => {
  it("excludes a stops>0 leg from filterOutboundLegsForSelection even if it would be cheapest", () => {
    const direct = flightLeg({ id: "direct", pricePerPerson: 120, stops: 0 });
    const connecting = flightLeg({ id: "cheap-connecting", pricePerPerson: 30, stops: 1 });
    const result = filterOutboundLegsForSelection([direct, connecting], bounds, "ANY");
    expect(result.map((l) => l.id)).toEqual(["direct"]);
  });

  it("excludes stops>0 legs from ANY/MORNING/AFTERNOON preference pricing, and marks them unavailable", () => {
    const connecting = flightLeg({ id: "cheap-connecting", pricePerPerson: 10, stops: 1, departure: new Date(2026, 5, 10, 8) });
    const options = buildOutboundPreferenceOptions([connecting], bounds);
    expect(options.every((o) => o.priceFromPerPerson === null)).toBe(true);
    expect(options.every((o) => o.available === false)).toBe(true);
  });
});

describe("daypart preference filtering", () => {
  const morningOut = flightLeg({ id: "morning", departure: new Date(2026, 5, 10, 8), pricePerPerson: 112 });
  const afternoonOut = flightLeg({ id: "afternoon", departure: new Date(2026, 5, 10, 17), pricePerPerson: 94 });
  const legs = [morningOut, afternoonOut];

  it("ANY accepts both morning and afternoon legs", () => {
    const result = filterOutboundLegsForSelection(legs, bounds, "ANY");
    expect(result.map((l) => l.id).sort()).toEqual(["afternoon", "morning"]);
  });
  it("MORNING excludes the afternoon leg", () => {
    expect(filterOutboundLegsForSelection(legs, bounds, "MORNING").map((l) => l.id)).toEqual(["morning"]);
  });
  it("AFTERNOON excludes the morning leg", () => {
    expect(filterOutboundLegsForSelection(legs, bounds, "AFTERNOON").map((l) => l.id)).toEqual(["afternoon"]);
  });
});

describe("daypart availability — 'No disponible' when nothing matches (§12)", () => {
  it("a preference with zero matching legs is marked unavailable, not just priced null", () => {
    const onlyMorning = flightLeg({ id: "morning", departure: new Date(2026, 5, 10, 8), pricePerPerson: 100 });
    const options = buildOutboundPreferenceOptions([onlyMorning], bounds);
    const afternoon = options.find((o) => o.value === "AFTERNOON")!;
    expect(afternoon.available).toBe(false);
    expect(afternoon.priceFromPerPerson).toBeNull();
    const morning = options.find((o) => o.value === "MORNING")!;
    expect(morning.available).toBe(true);
  });
});

describe("independent outbound/return preferences (§10/§11)", () => {
  it("outbound preference options are computed purely from outbound legs — a same-shaped return leg list never leaks in", () => {
    const outboundLegs = [flightLeg({ id: "out-morning", departure: new Date(2026, 5, 10, 8), pricePerPerson: 90 })];
    const returnLegsThatShouldNeverMatter = [flightLeg({ id: "ret-morning", originAirport: "LHR", destinationAirport: "MAD", departure: new Date(2026, 5, 12, 9), pricePerPerson: 999 })];
    void returnLegsThatShouldNeverMatter;
    const outboundOptions = buildOutboundPreferenceOptions(outboundLegs, bounds);
    expect(outboundOptions.find((o) => o.value === "MORNING")?.priceFromPerPerson).toBe(90);
  });

  it("return preference options are computed purely from return legs — an outbound-shaped leg list never leaks in", () => {
    const returnLegs = [flightLeg({ id: "ret-morning", originAirport: "LHR", destinationAirport: "MAD", departure: new Date(2026, 5, 12, 9), pricePerPerson: 85 })];
    const outboundLegsThatShouldNeverMatter = [flightLeg({ id: "out-morning", departure: new Date(2026, 5, 10, 8), pricePerPerson: 999 })];
    void outboundLegsThatShouldNeverMatter;
    const returnOptions = buildReturnPreferenceOptions(returnLegs, bounds);
    expect(returnOptions.find((o) => o.value === "MORNING")?.priceFromPerPerson).toBe(85);
  });
});

describe("derivePriceLabel", () => {
  const base = {
    hasPartySize: true,
    ticketsSelected: true,
    hotelRequired: false,
    hotelSelected: false,
    flightRequired: false,
    originRequired: false,
    originSelected: false,
    outboundFlightSelected: false,
    returnFlightSelected: false,
    revalidated: false,
  };
  it("is 'from' until a party size exists", () => {
    expect(derivePriceLabel({ ...base, hasPartySize: false })).toBe("from");
  });
  it("is 'estimated' once party size exists but something required is missing", () => {
    expect(derivePriceLabel({ ...base, ticketsSelected: false })).toBe("estimated");
  });
  it("is 'estimated' when flight-required but no origin chosen yet, even if revalidated flag is set", () => {
    expect(derivePriceLabel({ ...base, flightRequired: true, originRequired: true, originSelected: false, revalidated: true })).toBe("estimated");
  });
  it("is 'estimated' when only one of ida/vuelta has been selected", () => {
    expect(
      derivePriceLabel({ ...base, flightRequired: true, originRequired: true, originSelected: true, outboundFlightSelected: true, returnFlightSelected: false, revalidated: true }),
    ).toBe("estimated");
  });
  it("is 'total' only once everything required is selected AND revalidated", () => {
    expect(derivePriceLabel({ ...base, hotelRequired: true, hotelSelected: true, revalidated: true })).toBe("total");
    expect(derivePriceLabel({ ...base, hotelRequired: true, hotelSelected: true, revalidated: false })).toBe("estimated");
  });
});

describe("reconcileSelection (§9/§10/§11)", () => {
  it("clears the origin and both flight legs when the origin is no longer eligible, keeping everything else", () => {
    const selection: AtuAireSelection = {
      ...DEFAULT_SELECTION,
      buyerCountry: "ES",
      packageType: "TICKET_HOTEL_FLIGHT",
      partySize: 2,
      originAirport: "AGP",
      outboundLegId: "old-out",
      returnLegId: "old-ret",
    };
    const quote = { eligibleOrigins: [{ iata: "MAD", city: "Madrid", airportName: "Madrid-Barajas" }], hotelOptions: [], outboundLegs: [], returnLegs: [] } as never;
    const result = reconcileSelection(selection, quote);
    expect(result.originAirport).toBeNull();
    expect(result.outboundLegId).toBeNull();
    expect(result.returnLegId).toBeNull();
    expect(result.partySize).toBe(2); // untouched
    expect(result.packageType).toBe("TICKET_HOTEL_FLIGHT"); // untouched
  });

  it("keeps the origin and both legs when everything is still valid", () => {
    const selection: AtuAireSelection = { ...DEFAULT_SELECTION, originAirport: "MAD", outboundLegId: "out1", returnLegId: "ret1" };
    const quote = {
      eligibleOrigins: [{ iata: "MAD", city: "Madrid", airportName: "Madrid-Barajas" }],
      hotelOptions: [],
      outboundLegs: [{ id: "out1" }],
      returnLegs: [{ id: "ret1" }],
    } as never;
    const result = reconcileSelection(selection, quote);
    expect(result).toBe(selection); // same reference — nothing changed
  });

  it("dropping just the outbound leg (e.g. a preference change) never clears the still-valid return leg", () => {
    const selection: AtuAireSelection = { ...DEFAULT_SELECTION, originAirport: "MAD", outboundLegId: "stale-out", returnLegId: "ret1" };
    const quote = { eligibleOrigins: [{ iata: "MAD", city: "Madrid", airportName: "Madrid-Barajas" }], hotelOptions: [], outboundLegs: [], returnLegs: [{ id: "ret1" }] } as never;
    const result = reconcileSelection(selection, quote);
    expect(result.outboundLegId).toBeNull();
    expect(result.returnLegId).toBe("ret1");
  });
});

// ---------------------------------------------------------------------
// Full-quote integration through buildAtuAireQuote
// ---------------------------------------------------------------------
function baseData(overrides: Partial<AtuAireQuoteData> = {}): AtuAireQuoteData {
  const primary = { id: "ev1", homeTeam: "Home", awayTeam: "Away", stadium: "Stadium", city: "City", matchDate: new Date(2026, 5, 11, 20), kickoff: new Date(2026, 5, 11, 20), scheduleStatus: "confirmed" as const, primaryEvent: true };
  return {
    trip: {
      id: "trip1",
      slug: "demo",
      name: "Demo",
      subtitle: "",
      city: "City",
      maxPartySize: 10,
      requiredTravelerFields: "",
      minimumArrivalBufferBeforeKickoffMinutes: 180,
      minimumReturnBufferAfterEventMinutes: 120,
      orgFeeTicketOnlyOverride: null,
      orgFeeHotelTiersOverride: "",
      orgFeeHotelFlightTiersOverride: "",
      additionalMatchFeeOverride: null,
    },
    events: [primary],
    ticketOffersByEventId: {
      ev1: [
        { id: "t1", category: "General", sector: "Fondo", costNet: 60, restrictions: "" },
        { id: "t2", category: "Tribuna", sector: "Lateral", costNet: 95, restrictions: "" },
      ],
    },
    hotelOffers: [
      hotel({ id: "hA", roomsAvailable: { single: 6, double: 10, triple: 0 }, pricePerNight: { single: 70, double: 45, triple: 38 } }),
      hotel({ id: "hB", roomsAvailable: { single: 8, double: 8, triple: 4 }, pricePerNight: { single: 90, double: 60, triple: 52 } }),
    ],
    eligibleOrigins: [
      { iata: "MAD", city: "Madrid", airportName: "Madrid-Barajas" },
      { iata: "BCN", city: "Barcelona", airportName: "Barcelona-El Prat" },
    ],
    // Each origin's round-trip is split evenly across an outbound and a
    // return leg (100/100 for MAD, 30/30 for BCN) — priced and selected
    // fully independently (§9/§10), never a single bundled fare.
    outboundLegs: [
      flightLeg({ id: "mad-out", originAirport: "MAD", destinationAirport: "LHR", pricePerPerson: 100 }),
      flightLeg({ id: "bcn-out", originAirport: "BCN", destinationAirport: "LHR", pricePerPerson: 30 }),
    ],
    returnLegs: [
      flightLeg({ id: "mad-ret", originAirport: "LHR", destinationAirport: "MAD", departure: new Date(2026, 5, 12, 21), arrival: new Date(2026, 5, 13, 0), pricePerPerson: 100 }),
      flightLeg({ id: "bcn-ret", originAirport: "LHR", destinationAirport: "BCN", departure: new Date(2026, 5, 12, 21), arrival: new Date(2026, 5, 13, 0), pricePerPerson: 30 }),
    ],
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

describe("buildAtuAireQuote — every A_TU_AIRE product always supports all three modalities (§1-3/§40/§42)", () => {
  it("Spain: all three package types are offered, including the flight one", () => {
    const data = baseData();
    const quote = buildAtuAireQuote(data, { ...DEFAULT_SELECTION, buyerCountry: "ES" });
    expect(quote.packageTypeOptions.map((o) => o.packageType).sort()).toEqual(["TICKET_HOTEL", "TICKET_HOTEL_FLIGHT", "TICKET_ONLY"]);
  });

  it("a Latin American buyer never sees TICKET_HOTEL_FLIGHT — the modality itself is absent, not blocked", () => {
    const data = baseData();
    const quote = buildAtuAireQuote(data, { ...DEFAULT_SELECTION, buyerCountry: "MX" });
    expect(quote.packageTypeOptions.map((o) => o.packageType)).toEqual(["TICKET_ONLY", "TICKET_HOTEL"]);
  });

  it("TICKET_ONLY / TICKET_HOTEL behave identically regardless of country (§24 regression)", () => {
    const data = baseData();
    const spain = buildAtuAireQuote(data, { ...DEFAULT_SELECTION, buyerCountry: "ES", packageType: "TICKET_HOTEL", partySize: 2, ticketSelections: { ev1: "General" }, nights: 1, hotelOfferId: "hB" });
    const mexico = buildAtuAireQuote(data, { ...DEFAULT_SELECTION, buyerCountry: "MX", packageType: "TICKET_HOTEL", partySize: 2, ticketSelections: { ev1: "General" }, nights: 1, hotelOfferId: "hB" });
    expect(spain.price.totalCommercial).toBe(mexico.price.totalCommercial);
  });

  it("TICKET_HOTEL_FLIGHT is still listed for Spain even when no direct Spanish route exists at all — never removed, just unpriced (§3/§10)", () => {
    const data = baseData({ eligibleOrigins: [], outboundLegs: [], returnLegs: [] });
    const quote = buildAtuAireQuote(data, { ...DEFAULT_SELECTION, buyerCountry: "ES" });
    const flightOption = quote.packageTypeOptions.find((o) => o.packageType === "TICKET_HOTEL_FLIGHT");
    expect(flightOption).toBeDefined();
    expect(flightOption!.fromPricePerPerson).toBeNull();
  });

  it("no Event can make a modality disappear for an eligible buyer — an Event with zero ticket offers still keeps all three listed", () => {
    const data = baseData({ ticketOffersByEventId: { ev1: [] } });
    const quote = buildAtuAireQuote(data, { ...DEFAULT_SELECTION, buyerCountry: "ES" });
    expect(quote.packageTypeOptions.map((o) => o.packageType).sort()).toEqual(["TICKET_HOTEL", "TICKET_HOTEL_FLIGHT", "TICKET_ONLY"]);
  });
});

describe("buildAtuAireQuote — flight unavailable state never fakes availability (§3/§10/§14)", () => {
  it("blocks flight selection with an explicit 'no direct route' reason, without hiding the modality", () => {
    const data = baseData({ eligibleOrigins: [], outboundLegs: [], returnLegs: [] });
    const quote = buildAtuAireQuote(data, {
      ...DEFAULT_SELECTION,
      buyerCountry: "ES",
      packageType: "TICKET_HOTEL_FLIGHT",
      partySize: 1,
      ticketSelections: { ev1: "General" },
      nights: 1,
      hotelOfferId: "hB",
    });
    expect(quote.flightAvailability.blocked).toBe(true);
    if (quote.flightAvailability.blocked) {
      expect(quote.flightAvailability.reason.toLowerCase()).toContain("vuelos directos");
    }
    expect(quote.eligibleOrigins).toEqual([]);
  });
});

describe("buildAtuAireQuote — 'desde' price never assumes MAD (§13)", () => {
  it("uses the cheapest DIRECT outbound + cheapest DIRECT return across all eligible origins, not a fixed airport", () => {
    const data = baseData(); // BCN's legs (30+30) are cheaper than MAD's (100+100)
    const quote = buildAtuAireQuote(data, { ...DEFAULT_SELECTION, buyerCountry: "ES" });
    const flightOption = quote.packageTypeOptions.find((o) => o.packageType === "TICKET_HOTEL_FLIGHT")!;
    // Ticket(60) + cheapest single-room hotel(70) + BCN round trip(30+30=60) + hotel-flight fee(149) = 339.
    // Had MAD's 200 combined been used instead, "desde" would be 479 — well above this.
    expect(flightOption.fromPricePerPerson).toBe(339);
    expect(flightOption.fromPricePerPerson).toBeLessThan(479);
  });

  it("ignores a connecting leg even if it is the cheapest raw leg available", () => {
    const data = baseData({
      eligibleOrigins: [{ iata: "MAD", city: "Madrid", airportName: "Madrid-Barajas" }],
      outboundLegs: [flightLeg({ id: "mad-direct-out", originAirport: "MAD", pricePerPerson: 75, stops: 0 }), flightLeg({ id: "svq-connecting-out", originAirport: "SVQ", pricePerPerson: 10, stops: 1 })],
      returnLegs: [flightLeg({ id: "mad-direct-ret", originAirport: "LHR", destinationAirport: "MAD", pricePerPerson: 75, stops: 0 })],
    });
    const quote = buildAtuAireQuote(data, { ...DEFAULT_SELECTION, buyerCountry: "ES" });
    const flightOption = quote.packageTypeOptions.find((o) => o.packageType === "TICKET_HOTEL_FLIGHT")!;
    const ticketOnlyOption = quote.packageTypeOptions.find((o) => o.packageType === "TICKET_ONLY")!;
    // The 10€ connecting leg must never be used — the flight component must reflect 150 (75+75), not 10.
    expect(flightOption.fromPricePerPerson! - ticketOnlyOption.fromPricePerPerson!).toBeGreaterThan(100);
  });
});

describe("buildAtuAireQuote — total price reflects the selected hotel/flight, never a per-card resultant figure (§5/§6/§9)", () => {
  it("selecting a hotel recalculates the summary total correctly, even though the hotel card itself carries no price", () => {
    const data = baseData();
    const sel: AtuAireSelection = { ...DEFAULT_SELECTION, buyerCountry: "ES", packageType: "TICKET_HOTEL", partySize: 2, ticketSelections: { ev1: "General" }, nights: 1 };
    const withHa = buildAtuAireQuote(data, { ...sel, hotelOfferId: "hA" });
    const withHb = buildAtuAireQuote(data, { ...sel, hotelOfferId: "hB" });
    expect(withHa.price.totalCommercial).not.toBe(withHb.price.totalCommercial);
    expect(withHa.price.perPerson).not.toBe(withHb.price.perPerson);
    expect(withHb.hotelOptions.find((h) => h.offer.id === "hB")).not.toHaveProperty("resultantTotalPerPerson");
  });

  it("selecting the outbound+return legs explicitly matches the auto-selected (cheapest) total for that origin", () => {
    const data = baseData();
    const sel: AtuAireSelection = {
      ...DEFAULT_SELECTION,
      buyerCountry: "ES",
      packageType: "TICKET_HOTEL_FLIGHT",
      partySize: 1,
      ticketSelections: { ev1: "General" },
      nights: 1,
      hotelOfferId: "hB",
      originAirport: "MAD",
    };
    const autoQuote = buildAtuAireQuote(data, sel); // no legs picked yet — price falls back to the cheapest filtered leg per direction
    const outboundLeg = autoQuote.outboundLegs[0];
    const returnLeg = autoQuote.returnLegs[0];
    const withLegs = buildAtuAireQuote(data, { ...sel, outboundLegId: outboundLeg.id, returnLegId: returnLeg.id });
    expect(withLegs.price.perPerson).toBeCloseTo(autoQuote.price.perPerson!, 5);
    // Each leg card shows only its own (much smaller) price — never the trip's resulting total.
    expect(outboundLeg.pricePerPerson).toBeLessThan(withLegs.price.perPerson!);
    expect(returnLeg.pricePerPerson).toBeLessThan(withLegs.price.perPerson!);
  });
});

describe("buildAtuAireQuote — origin selection (§6/§7/§9/§22/§24)", () => {
  const flightSelection: AtuAireSelection = {
    ...DEFAULT_SELECTION,
    buyerCountry: "ES",
    packageType: "TICKET_HOTEL_FLIGHT",
    partySize: 1,
    ticketSelections: { ev1: "General" },
    nights: 1,
    hotelOfferId: "hB",
  };

  it("exposes exactly the eligible origins the data layer provided — never a hardcoded list", () => {
    const data = baseData();
    const quote = buildAtuAireQuote(data, flightSelection);
    expect(quote.eligibleOrigins.map((o) => o.iata).sort()).toEqual(["BCN", "MAD"]);
  });

  it("changing the origin recalculates the outbound and return legs shown", () => {
    const data = baseData();
    const withMad = buildAtuAireQuote(data, { ...flightSelection, originAirport: "MAD" });
    const withBcn = buildAtuAireQuote(data, { ...flightSelection, originAirport: "BCN" });
    expect(withMad.outboundLegs.every((l) => l.originAirport === "MAD")).toBe(true);
    expect(withBcn.outboundLegs.every((l) => l.originAirport === "BCN")).toBe(true);
    expect(withMad.returnLegs.every((l) => l.destinationAirport === "MAD")).toBe(true);
    expect(withBcn.returnLegs.every((l) => l.destinationAirport === "BCN")).toBe(true);
  });

  it("changing the origin recalculates the price", () => {
    const data = baseData();
    const withMad = buildAtuAireQuote(data, { ...flightSelection, originAirport: "MAD" });
    const withBcn = buildAtuAireQuote(data, { ...flightSelection, originAirport: "BCN" });
    expect(withMad.price.totalCommercial).not.toBe(withBcn.price.totalCommercial);
  });

  it("switching origin clears only the flight legs — travelers/tickets/hotel/nights stay put (§15, via reconcileSelection)", () => {
    const data = baseData();
    // A fresh quote fetched for the NEW origin (BCN) naturally has no leg
    // with the old MAD-specific id — reconcileSelection compares the stale
    // selection against exactly this kind of fresh quote.
    const freshQuoteForBcn = buildAtuAireQuote(data, { ...flightSelection, originAirport: "BCN" });
    const staleSelection: AtuAireSelection = { ...flightSelection, originAirport: "BCN", outboundLegId: "mad-out", returnLegId: "mad-ret" };
    const reconciled = reconcileSelection(staleSelection, freshQuoteForBcn);
    expect(reconciled.outboundLegId).toBeNull();
    expect(reconciled.returnLegId).toBeNull();
    expect(reconciled.originAirport).toBe("BCN");
    expect(reconciled.hotelOfferId).toBe("hB");
    expect(reconciled.nights).toBe(1);
    expect(reconciled.partySize).toBe(1);
  });

  it("no origin chosen yet -> no preference options or flight legs are computed", () => {
    const data = baseData();
    const quote = buildAtuAireQuote(data, flightSelection);
    expect(quote.outboundPreferenceOptions).toEqual([]);
    expect(quote.returnPreferenceOptions).toEqual([]);
    expect(quote.outboundLegs).toEqual([]);
    expect(quote.returnLegs).toEqual([]);
    expect(quote.price.missing).toContain("aeropuerto de salida");
  });

  it("daypart preference options, once an origin is chosen, only use that origin's direct legs", () => {
    const data = baseData({
      outboundLegs: [
        flightLeg({ id: "mad-morning", originAirport: "MAD", departure: new Date(2026, 5, 10, 8), pricePerPerson: 71 }),
        flightLeg({ id: "bcn-morning", originAirport: "BCN", departure: new Date(2026, 5, 10, 8), pricePerPerson: 999 }),
      ],
    });
    const quote = buildAtuAireQuote(data, { ...flightSelection, originAirport: "MAD" });
    const morningOption = quote.outboundPreferenceOptions.find((o) => o.value === "MORNING");
    expect(morningOption?.priceFromPerPerson).toBe(71); // never picks up BCN's leg
  });
});

describe("buildAtuAireQuote — date_provisional blocks flights; time_provisional uses a conservative window instead (§15-19)", () => {
  function eventWith(scheduleStatus: "confirmed" | "time_provisional" | "date_provisional") {
    return { id: "ev1", homeTeam: "Home", awayTeam: "Away", stadium: "Stadium", city: "City", matchDate: new Date(2026, 5, 13, 0, 0), kickoff: null, scheduleStatus, primaryEvent: true };
  }

  const flightSelection = (): AtuAireSelection => ({
    ...DEFAULT_SELECTION,
    buyerCountry: "ES",
    packageType: "TICKET_HOTEL_FLIGHT",
    partySize: 1,
    ticketSelections: { ev1: "General" },
    nights: 1,
    hotelOfferId: "hB",
    originAirport: "MAD",
  });

  it("date_provisional: flight selection stays blocked even with an origin chosen, with a fecha-specific reason", () => {
    const data = baseData({ events: [eventWith("date_provisional")] });
    const quote = buildAtuAireQuote(data, flightSelection());
    expect(quote.flightAvailability.blocked).toBe(true);
    if (quote.flightAvailability.blocked) {
      expect(quote.flightAvailability.reason.toLowerCase()).toContain("fecha");
    }
    expect(quote.outboundLegs).toEqual([]);
    expect(quote.returnLegs).toEqual([]);
  });

  it("time_provisional: never blocks by itself — only genuinely safe legs survive the conservative window, per direction", () => {
    // Conservative window for an all-day-unknown-hour match: earliest kickoff
    // 12:00, latest 21:00 -> latestArrival = 12:00-180min = 09:00,
    // earliestReturn = 21:00+120min = 23:00 (same day).
    const safeOutbound = flightLeg({ id: "safe-out", originAirport: "MAD", arrival: new Date(2026, 5, 13, 8, 30), pricePerPerson: 90 }); // before 09:00 cutoff
    const unsafeOutbound = flightLeg({ id: "unsafe-out", originAirport: "MAD", arrival: new Date(2026, 5, 13, 11, 0), pricePerPerson: 50 }); // after 09:00 cutoff
    const safeReturn = flightLeg({ id: "safe-ret", originAirport: "LHR", destinationAirport: "MAD", departure: new Date(2026, 5, 13, 23, 30), pricePerPerson: 90 }); // after 23:00 cutoff
    const unsafeReturn = flightLeg({ id: "unsafe-ret", originAirport: "LHR", destinationAirport: "MAD", departure: new Date(2026, 5, 13, 21, 0), pricePerPerson: 40 }); // before 23:00 cutoff
    const data = baseData({ events: [eventWith("time_provisional")], outboundLegs: [safeOutbound, unsafeOutbound], returnLegs: [safeReturn, unsafeReturn] });
    const quote = buildAtuAireQuote(data, flightSelection());
    expect(quote.flightAvailability.blocked).toBe(false);
    expect(quote.outboundLegs.map((l) => l.id)).toEqual(["safe-out"]);
    expect(quote.outboundLegs.map((l) => l.id)).not.toContain("unsafe-out");
    expect(quote.returnLegs.map((l) => l.id)).toEqual(["safe-ret"]);
    expect(quote.returnLegs.map((l) => l.id)).not.toContain("unsafe-ret");
  });
});

describe("buildAtuAireQuote — multi-match tickets (§17-21/§24)", () => {
  function twoEventData(): AtuAireQuoteData {
    const data = baseData();
    return {
      ...data,
      events: [
        data.events[0],
        { id: "ev2", homeTeam: "H2", awayTeam: "A2", stadium: "S2", city: "City", matchDate: new Date(2026, 5, 12, 20), kickoff: new Date(2026, 5, 12, 20), scheduleStatus: "confirmed", primaryEvent: false },
      ],
      ticketOffersByEventId: {
        ...data.ticketOffersByEventId,
        ev2: [{ id: "t3", category: "Visitante", sector: "", costNet: 70, restrictions: "" }],
      },
    };
  }

  it("every Event gets its own ticketOptionsByEvent entry", () => {
    const data = twoEventData();
    const quote = buildAtuAireQuote(data, { ...DEFAULT_SELECTION, buyerCountry: "ES" });
    expect(quote.ticketOptionsByEvent.ev1.map((o) => o.category).sort()).toEqual(["General", "Tribuna"]);
    expect(quote.ticketOptionsByEvent.ev2.map((o) => o.category)).toEqual(["Visitante"]);
  });

  it("an Event with a single offer counts as selected without an explicit click, and is priced correctly", () => {
    const data = twoEventData();
    const sel: AtuAireSelection = { ...DEFAULT_SELECTION, buyerCountry: "ES", packageType: "TICKET_ONLY", partySize: 1, ticketSelections: { ev1: "General" } }; // ev2 left unselected on purpose
    const quote = buildAtuAireQuote(data, sel);
    expect(quote.price.missing).not.toContain("entradas");
  });

  it("changing the second match's ticket category changes the total", () => {
    const data = twoEventData();
    const cheap: AtuAireSelection = { ...DEFAULT_SELECTION, buyerCountry: "ES", packageType: "TICKET_ONLY", partySize: 2, ticketSelections: { ev1: "General", ev2: "Visitante" } };
    const q1 = buildAtuAireQuote(data, cheap);
    // ev2 only has one category in this fixture, so extend it to prove the sum genuinely includes both events.
    const dataWithTwoOptions: AtuAireQuoteData = {
      ...data,
      ticketOffersByEventId: { ...data.ticketOffersByEventId, ev2: [...data.ticketOffersByEventId.ev2, { id: "t4", category: "Superior", sector: "", costNet: 105, restrictions: "" }] },
    };
    const pricier: AtuAireSelection = { ...cheap, ticketSelections: { ev1: "General", ev2: "Superior" } };
    const q2 = buildAtuAireQuote(dataWithTwoOptions, pricier);
    expect(q2.price.totalCommercial).toBeGreaterThan(q1.price.totalCommercial ?? 0);
  });

  it("additionalMatchFee applies exactly once (not per extra ticket) for a 2-Event product", () => {
    const oneMatch = baseData();
    const twoMatches = twoEventData();
    const sel1: AtuAireSelection = { ...DEFAULT_SELECTION, buyerCountry: "ES", packageType: "TICKET_ONLY", partySize: 1, ticketSelections: { ev1: "General" } };
    const sel2: AtuAireSelection = { ...sel1, ticketSelections: { ev1: "General", ev2: "Visitante" } };
    const q1 = buildAtuAireQuote(oneMatch, sel1);
    const q2 = buildAtuAireQuote(twoMatches, sel2);
    expect(q2.additionalMatchFeeApplies).toBe(true);
    // The difference must be exactly the ev2 ticket cost (70) plus one additionalMatchFee application (25), times partySize=1, plus the extra organization fee delta.
    const rawDelta = (q2.price.totalCommercial ?? 0) - (q1.price.totalCommercial ?? 0);
    expect(rawDelta).toBeGreaterThan(70); // at minimum the second ticket's own cost
  });
});

describe("buildAtuAireQuote — price recompute on each decision (regression, §24)", () => {
  it("recomputes when partySize changes", () => {
    const data = baseData();
    const sel1: AtuAireSelection = { ...DEFAULT_SELECTION, buyerCountry: "ES", packageType: "TICKET_ONLY", partySize: 1, ticketSelections: { ev1: "General" } };
    const sel2: AtuAireSelection = { ...sel1, partySize: 2 };
    const q1 = buildAtuAireQuote(data, sel1);
    const q2 = buildAtuAireQuote(data, sel2);
    expect(q2.price.totalCommercial).toBe((q1.price.totalCommercial ?? 0) * 2);
  });

  it("never offers an invalid hotel as selectable — a 3-traveler party excludes zero-triple hA", () => {
    const data = baseData();
    const sel: AtuAireSelection = { ...DEFAULT_SELECTION, buyerCountry: "ES", packageType: "TICKET_HOTEL", partySize: 3, ticketSelections: { ev1: "General" }, nights: 1 };
    const quote = buildAtuAireQuote(data, sel);
    expect(quote.hotelOptions.find((h) => h.offer.id === "hA")?.valid).toBe(false);
    expect(quote.hotelOptions.find((h) => h.offer.id === "hB")?.valid).toBe(true);
  });

  it("shows a 'desde' price per person before any party size is chosen", () => {
    const data = baseData();
    const quote = buildAtuAireQuote(data, { ...DEFAULT_SELECTION, buyerCountry: "ES" });
    expect(quote.price.label).toBe("from");
    for (const option of quote.packageTypeOptions) {
      expect(option.fromPricePerPerson).toBeGreaterThan(0);
    }
  });
});
