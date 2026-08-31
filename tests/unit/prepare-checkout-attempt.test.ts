import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { prepareCheckoutAttempt, type PrepareCheckoutAttemptInput } from "@/lib/checkout-saga/prepareCheckoutAttempt";
import { normalizeRoundTripOffer } from "@/lib/providers/flights/duffel/normalize";
import { flightSliceKey } from "@/lib/providers/flights/duffel/roundTripSelection";
import type { CheckoutAttemptTravelerInput } from "@/lib/checkout-saga/travelerValidation";

// Fase 2 §27 (AB-AL) — the full real saga, DRAFT -> REVALIDATING ->
// READY_TO_PAY, with Duffel and Nuitee entirely HTTP-mocked (never real
// network — see §28).

const RUN_ID = `preparecheckout-${Date.now()}`;
let tripId: string;
let eventId: string;

beforeAll(async () => {
  const trip = await prisma.trip.create({
    data: {
      number: 900006,
      slug: RUN_ID,
      name: "Test Trip",
      subtitle: "Test",
      city: "Test",
      country: "Test",
      homeTeam: "A",
      awayTeam: "B",
      stadium: "Test",
      matchDate: new Date(),
      price: 100,
      currency: "EUR",
      travelMode: "A_TU_AIRE",
      isDemo: true,
    },
  });
  tripId = trip.id;
  const event = await prisma.event.create({ data: { tripId, homeTeam: "A", awayTeam: "B", stadium: "Test", matchDate: new Date() } });
  eventId = event.id;
});

afterAll(async () => {
  await prisma.checkoutAttempt.deleteMany({ where: { tripId } });
  await prisma.ticketOffer.deleteMany({ where: { eventId } });
  await prisma.trip.delete({ where: { id: tripId } });
  await prisma.$disconnect();
});

beforeEach(() => {
  vi.stubEnv("DUFFEL_ACCESS_TOKEN", "duffel_test_fake_for_unit_tests_only");
  vi.stubEnv("NUITEE_API_KEY", "sand_fake_for_unit_tests_only");
  vi.stubEnv("APP_MODE", "demo");
  vi.stubEnv("ALLOW_SANDBOX_PROVIDER_BOOKING", "");
});
afterEach(() => vi.unstubAllEnvs());

async function createTicketOffer(stock: number) {
  const offer = await prisma.ticketOffer.create({ data: { eventId, costNet: 50, currency: "EUR", stock, active: true } });
  return offer.id;
}

type Route = { test: RegExp; status: number; body: unknown };

function routedFetch(routes: Route[]): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    const route = routes.find((r) => r.test.test(url));
    if (!route) throw new Error(`unmocked fetch call: ${url}`);
    return new Response(JSON.stringify(route.body), { status: route.status });
  }) as unknown as typeof fetch;
}

// --- Nuitee PREBOOK fixture -------------------------------------------
function nuiteePrebookBody(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    data: {
      prebookId: "pb_test1",
      offerId: "hotel_offer_1",
      hotelId: "hotel_1",
      currency: "EUR",
      roomTypes: [
        {
          rates: [
            {
              occupancyNumber: 1,
              name: "Doble",
              adultCount: 2,
              retailRate: { total: [{ amount: 200, currency: "EUR" }], taxesAndFees: [{ included: true, description: "Resort fee", amount: 10, currency: "EUR" }] },
              cancellationPolicies: { refundableTag: "RFN" },
            },
          ],
        },
      ],
      price: 200,
      priceDifferencePercent: 0,
      cancellationChanged: false,
      boardChanged: false,
      paymentTypes: ["NUITEE_PAY"],
      checkin: "2026-10-15",
      checkout: "2026-10-17",
      ...overrides,
    },
    sandbox: true,
  };
}

// --- Duffel round-trip offer fixture -----------------------------------
function duffelSeg(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    origin: { iata_code: "BCN" },
    destination: { iata_code: "MAN" },
    departing_at: "2026-10-15T09:00:00",
    arriving_at: "2026-10-15T10:30:00",
    marketing_carrier: { iata_code: "VY", name: "Vueling" },
    operating_carrier: { iata_code: "VY", name: "Vueling" },
    marketing_carrier_flight_number: "8748",
    passengers: [{ cabin_class: "economy" }],
    ...overrides,
  };
}
const DUFFEL_RETURN_SEG = duffelSeg({ origin: { iata_code: "MAN" }, destination: { iata_code: "BCN" }, departing_at: "2026-10-18T18:30:00", arriving_at: "2026-10-18T22:00:00", marketing_carrier_flight_number: "8749" });

function duffelRawOffer(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "off_rt_1",
    total_amount: "180.00",
    total_currency: "EUR",
    expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    slices: [{ segments: [duffelSeg()], fare_brand_name: "Basic" }, { segments: [DUFFEL_RETURN_SEG] }],
    conditions: { refund_before_departure: { allowed: true, penalty_amount: null, penalty_currency: null } }, // FULLY_REVERSIBLE
    ...overrides,
  };
}

function resolvedFlightSelection() {
  const offer = normalizeRoundTripOffer(duffelRawOffer() as never, false, "orq_1", ["pas_1"]);
  return { offer, outboundSliceKey: flightSliceKey(offer.outbound), returnSliceKey: flightSliceKey(offer.return) };
}

const COMPLETE_TRAVELER: CheckoutAttemptTravelerInput = { firstName: "Ada", lastName: "Lovelace", title: "mrs", gender: "f", birthDate: "1990-01-01", email: "ada@example.com", phone: "+34600000000" };

async function baseInput(overrides: Partial<PrepareCheckoutAttemptInput> = {}): Promise<PrepareCheckoutAttemptInput> {
  const ticketOfferId = overrides.ticket?.ticketOfferId ?? (await createTicketOffer(10));
  return {
    tripId,
    packageType: "TICKET_ONLY",
    partySize: 1,
    travelers: [{ firstName: "Ada", lastName: "Lovelace" }],
    ticket: { ticketOfferId, quantity: 1 },
    ...overrides,
  };
}

describe("AB — happy path TICKET_ONLY", () => {
  it("reaches READY_TO_PAY with a TicketHold and a FinalQuoteSnapshot, no hotel/flight", async () => {
    const input = await baseInput();
    const result = await prepareCheckoutAttempt(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.status).toBe("ready_to_pay");
    expect(result.finalQuoteSnapshot.hotel).toBeNull();
    expect(result.finalQuoteSnapshot.flight).toBeNull();
    expect(result.finalQuoteSnapshot.commercial.pvpTotal).toBeGreaterThan(0);

    const attempt = await prisma.checkoutAttempt.findUniqueOrThrow({ where: { id: result.checkoutAttemptId } });
    expect(attempt.status).toBe("ready_to_pay");
  });
});

describe("AC — happy path TICKET_HOTEL", () => {
  it("reaches READY_TO_PAY after a successful Nuitee PREBOOK", async () => {
    const fetchImpl = routedFetch([{ test: /rates\/prebook/, status: 200, body: nuiteePrebookBody() }]);
    const input = await baseInput({
      packageType: "TICKET_HOTEL",
      hotel: { offerId: "hotel_offer_1", expectedTotalPrice: 200, expectedRooms: [{ occupancyNumber: 1, roomName: "Doble" }], hotelName: "Hotel Test" },
      fetchImpl,
    });
    const result = await prepareCheckoutAttempt(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.finalQuoteSnapshot.hotel).not.toBeNull();
    expect(result.finalQuoteSnapshot.hotel?.price.total).toBe(200);
    expect(result.finalQuoteSnapshot.flight).toBeNull();
  });
});

describe("AD — happy path TICKET_HOTEL_FLIGHT", () => {
  it("reaches READY_TO_PAY after successful Nuitee PREBOOK + Duffel revalidation, both reversible", async () => {
    const { offer, outboundSliceKey, returnSliceKey } = resolvedFlightSelection();
    const fetchImpl = routedFetch([
      { test: /rates\/prebook/, status: 200, body: nuiteePrebookBody() },
      { test: /air\/offers\//, status: 200, body: { data: duffelRawOffer() } },
    ]);
    const input = await baseInput({
      packageType: "TICKET_HOTEL_FLIGHT",
      travelers: [COMPLETE_TRAVELER],
      hotel: { offerId: "hotel_offer_1", expectedTotalPrice: 200, expectedRooms: [{ occupancyNumber: 1, roomName: "Doble" }], hotelName: "Hotel Test" },
      flight: { offerId: offer.offerId, offerRequestId: offer.offerRequestId, passengerIds: offer.passengerIds, originalTotalAmount: offer.totalAmount, outboundSliceKey, returnSliceKey },
      fetchImpl,
    });
    const result = await prepareCheckoutAttempt(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.finalQuoteSnapshot.hotel).not.toBeNull();
    expect(result.finalQuoteSnapshot.flight).not.toBeNull();
    expect(result.finalQuoteSnapshot.flight?.offerId).toBe("off_rt_1");
    // Never two offerIds — only one, and it's a real property on the snapshot, not a pair.
    expect(result.finalQuoteSnapshot.flight).not.toHaveProperty("outboundOfferId");
  });
});

describe("AE — a provider failure yields FAILED, never READY_TO_PAY", () => {
  it("Nuitee PREBOOK 404 (offer gone) -> attempt FAILED", async () => {
    const fetchImpl = routedFetch([{ test: /rates\/prebook/, status: 404, body: {} }]);
    const input = await baseInput({
      packageType: "TICKET_HOTEL",
      hotel: { offerId: "hotel_offer_gone", expectedTotalPrice: 200, expectedRooms: [{ occupancyNumber: 1, roomName: "Doble" }], hotelName: "Hotel Test" },
      fetchImpl,
    });
    const result = await prepareCheckoutAttempt(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe("failed");
    const attempt = await prisma.checkoutAttempt.findUniqueOrThrow({ where: { id: result.checkoutAttemptId! } });
    expect(attempt.status).toBe("failed");
  });
});

describe("AF — stock disappears before the hold -> FAILED", () => {
  it("acquireTicketHold fails when another attempt already confirmed the only unit", async () => {
    const ticketOfferId = await createTicketOffer(1);
    // Simulate another, already-confirmed sale consuming the sole unit.
    const other = await prisma.checkoutAttempt.create({ data: { tripId, packageType: "TICKET_ONLY", partySize: 1, status: "draft" } });
    await prisma.ticketHold.create({ data: { checkoutAttemptId: other.id, ticketOfferId, quantity: 1, status: "confirmed" } });

    const input = await baseInput({ ticket: { ticketOfferId, quantity: 1 } });
    const result = await prepareCheckoutAttempt(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe("failed");

    const attempt = await prisma.checkoutAttempt.findUniqueOrThrow({ where: { id: result.checkoutAttemptId! } });
    expect(attempt.status).toBe("failed");
    const holds = await prisma.ticketHold.findMany({ where: { checkoutAttemptId: result.checkoutAttemptId! } });
    expect(holds).toHaveLength(0); // never even created — acquireTicketHold itself returned insufficient_stock
  });
});

describe("AG/AH — READY_TO_PAY carries a FinalQuoteSnapshot and a HELD TicketHold", () => {
  it("both are present and consistent", async () => {
    const input = await baseInput();
    const result = await prepareCheckoutAttempt(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const attempt = await prisma.checkoutAttempt.findUniqueOrThrow({ where: { id: result.checkoutAttemptId }, include: { ticketHolds: true } });
    expect(attempt.finalQuoteSnapshot).not.toBe("");
    expect(JSON.parse(attempt.finalQuoteSnapshot)).toBeTruthy();
    expect(attempt.ticketHolds).toHaveLength(1);
    expect(attempt.ticketHolds[0].status).toBe("held");
  });
});

describe("AI/AJ — no Booking exists and no payment is captured at READY_TO_PAY", () => {
  it("bookingId is null and paymentStatus stays not_started", async () => {
    const input = await baseInput();
    const result = await prepareCheckoutAttempt(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const attempt = await prisma.checkoutAttempt.findUniqueOrThrow({ where: { id: result.checkoutAttemptId } });
    expect(attempt.bookingId).toBeNull();
    expect(attempt.paymentStatus).toBe("not_started");
    const bookingCount = await prisma.booking.count({ where: { checkoutAttempt: { id: result.checkoutAttemptId } } });
    expect(bookingCount).toBe(0);
  });
});

describe("AK/AL — no BOOK and no Order are ever executed", () => {
  it("the TICKET_HOTEL_FLIGHT happy path never issues a request to /rates/book or /air/orders", async () => {
    const { offer, outboundSliceKey, returnSliceKey } = resolvedFlightSelection();
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      calls.push(url);
      if (/rates\/prebook/.test(url)) return new Response(JSON.stringify(nuiteePrebookBody()), { status: 200 });
      if (/air\/offers\//.test(url)) return new Response(JSON.stringify({ data: duffelRawOffer() }), { status: 200 });
      throw new Error(`unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;

    const input = await baseInput({
      packageType: "TICKET_HOTEL_FLIGHT",
      travelers: [COMPLETE_TRAVELER],
      hotel: { offerId: "hotel_offer_1", expectedTotalPrice: 200, expectedRooms: [{ occupancyNumber: 1, roomName: "Doble" }], hotelName: "Hotel Test" },
      flight: { offerId: offer.offerId, offerRequestId: offer.offerRequestId, passengerIds: offer.passengerIds, originalTotalAmount: offer.totalAmount, outboundSliceKey, returnSliceKey },
      fetchImpl,
    });
    const result = await prepareCheckoutAttempt(input);
    expect(result.ok).toBe(true);
    expect(calls.some((u) => /rates\/book/.test(u))).toBe(false);
    expect(calls.some((u) => /air\/orders/.test(u))).toBe(false);
  });
});

describe("§15 — partySize must equal Duffel passengerIds.length for flight modalities", () => {
  it("refuses READY_TO_PAY when passengerIds count doesn't match partySize", async () => {
    const rawOfferMismatch = duffelRawOffer();
    const offer = normalizeRoundTripOffer(rawOfferMismatch as never, false, "orq_1", ["pas_1"]); // 1 passengerId
    const outboundSliceKey = flightSliceKey(offer.outbound);
    const returnSliceKey = flightSliceKey(offer.return);
    const fetchImpl = routedFetch([
      { test: /rates\/prebook/, status: 200, body: nuiteePrebookBody() },
      { test: /air\/offers\//, status: 200, body: { data: rawOfferMismatch } },
    ]);
    const input = await baseInput({
      packageType: "TICKET_HOTEL_FLIGHT",
      partySize: 2, // but only 1 passengerId
      travelers: [COMPLETE_TRAVELER, { ...COMPLETE_TRAVELER, email: "alan@example.com" }],
      hotel: { offerId: "hotel_offer_1", expectedTotalPrice: 200, expectedRooms: [{ occupancyNumber: 1, roomName: "Doble" }], hotelName: "Hotel Test" },
      flight: { offerId: offer.offerId, offerRequestId: offer.offerRequestId, passengerIds: offer.passengerIds, originalTotalAmount: offer.totalAmount, outboundSliceKey, returnSliceKey },
      fetchImpl,
    });
    const result = await prepareCheckoutAttempt(input);
    expect(result.ok).toBe(false);
  });
});

describe("§18 — both hotel and flight irreversible/unknown -> no viable combination, no hold, no READY_TO_PAY", () => {
  it("hotel non-refundable + flight with no conditions provided (UNKNOWN) is refused", async () => {
    const rawOfferNoConditions = duffelRawOffer({ conditions: undefined });
    const offer = normalizeRoundTripOffer(rawOfferNoConditions as never, false, "orq_1", ["pas_1"]);
    const outboundSliceKey = flightSliceKey(offer.outbound);
    const returnSliceKey = flightSliceKey(offer.return);
    const fetchImpl = routedFetch([
      { test: /rates\/prebook/, status: 200, body: nuiteePrebookBody({ roomTypes: [{ rates: [{ occupancyNumber: 1, name: "Doble", adultCount: 2, retailRate: { total: [{ amount: 200, currency: "EUR" }], taxesAndFees: [] }, cancellationPolicies: { refundableTag: "NRFN" } }] }] }) },
      { test: /air\/offers\//, status: 200, body: { data: rawOfferNoConditions } },
    ]);
    const input = await baseInput({
      packageType: "TICKET_HOTEL_FLIGHT",
      travelers: [COMPLETE_TRAVELER],
      hotel: { offerId: "hotel_offer_1", expectedTotalPrice: 200, expectedRooms: [{ occupancyNumber: 1, roomName: "Doble" }], hotelName: "Hotel Test" },
      flight: { offerId: offer.offerId, offerRequestId: offer.offerRequestId, passengerIds: offer.passengerIds, originalTotalAmount: offer.totalAmount, outboundSliceKey, returnSliceKey },
      fetchImpl,
    });
    const result = await prepareCheckoutAttempt(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const attempt = await prisma.checkoutAttempt.findUniqueOrThrow({ where: { id: result.checkoutAttemptId! }, include: { ticketHolds: true } });
    expect(attempt.status).toBe("failed");
    expect(attempt.ticketHolds).toHaveLength(0); // never even acquired — the gate runs before the hold
  });
});

describe("§16 — a material hotel change (cancellation policy) blocks READY_TO_PAY", () => {
  it("cancellationChanged=true on PREBOOK is never accepted silently", async () => {
    const fetchImpl = routedFetch([{ test: /rates\/prebook/, status: 200, body: nuiteePrebookBody({ cancellationChanged: true }) }]);
    const input = await baseInput({
      packageType: "TICKET_HOTEL",
      hotel: { offerId: "hotel_offer_1", expectedTotalPrice: 200, expectedRooms: [{ occupancyNumber: 1, roomName: "Doble" }], hotelName: "Hotel Test" },
      fetchImpl,
    });
    const result = await prepareCheckoutAttempt(input);
    expect(result.ok).toBe(false);
  });

  it("R — a price-only difference on PREBOOK IS accepted and flows into the final quote", async () => {
    const fetchImpl = routedFetch([{ test: /rates\/prebook/, status: 200, body: nuiteePrebookBody({ price: 250, roomTypes: [{ rates: [{ occupancyNumber: 1, name: "Doble", adultCount: 2, retailRate: { total: [{ amount: 250, currency: "EUR" }], taxesAndFees: [] }, cancellationPolicies: { refundableTag: "RFN" } }] }] }) }]);
    const input = await baseInput({
      packageType: "TICKET_HOTEL",
      hotel: { offerId: "hotel_offer_1", expectedTotalPrice: 200, expectedRooms: [{ occupancyNumber: 1, roomName: "Doble" }], hotelName: "Hotel Test" },
      fetchImpl,
    });
    const result = await prepareCheckoutAttempt(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.finalQuoteSnapshot.hotel?.price.total).toBe(250); // the NEW price, not the originally-quoted 200
    expect(result.finalQuoteSnapshot.commercial.costHotelNet).toBe(250);
  });

  it("a room-type change (different roomName) between SEARCH and PREBOOK is detected and blocks", async () => {
    const fetchImpl = routedFetch([{ test: /rates\/prebook/, status: 200, body: nuiteePrebookBody({ roomTypes: [{ rates: [{ occupancyNumber: 1, name: "Suite", adultCount: 2, retailRate: { total: [{ amount: 200, currency: "EUR" }], taxesAndFees: [] }, cancellationPolicies: { refundableTag: "RFN" } }] }] }) }]);
    const input = await baseInput({
      packageType: "TICKET_HOTEL",
      hotel: { offerId: "hotel_offer_1", expectedTotalPrice: 200, expectedRooms: [{ occupancyNumber: 1, roomName: "Doble" }], hotelName: "Hotel Test" },
      fetchImpl,
    });
    const result = await prepareCheckoutAttempt(input);
    expect(result.ok).toBe(false);
  });
});

describe("§14 — Duffel revalidation detecting a changed itinerary blocks READY_TO_PAY", () => {
  it("a revalidated outbound with a different departure time is rejected, no READY_TO_PAY", async () => {
    const { offer, outboundSliceKey, returnSliceKey } = resolvedFlightSelection();
    const changedOffer = duffelRawOffer({ slices: [{ segments: [duffelSeg({ departing_at: "2026-10-15T15:00:00", arriving_at: "2026-10-15T16:30:00" })] }, { segments: [DUFFEL_RETURN_SEG] }] });
    const fetchImpl = routedFetch([
      { test: /rates\/prebook/, status: 200, body: nuiteePrebookBody() },
      { test: /air\/offers\//, status: 200, body: { data: changedOffer } },
    ]);
    const input = await baseInput({
      packageType: "TICKET_HOTEL_FLIGHT",
      travelers: [COMPLETE_TRAVELER],
      hotel: { offerId: "hotel_offer_1", expectedTotalPrice: 200, expectedRooms: [{ occupancyNumber: 1, roomName: "Doble" }], hotelName: "Hotel Test" },
      flight: { offerId: offer.offerId, offerRequestId: offer.offerRequestId, passengerIds: offer.passengerIds, originalTotalAmount: offer.totalAmount, outboundSliceKey, returnSliceKey },
      fetchImpl,
    });
    const result = await prepareCheckoutAttempt(input);
    expect(result.ok).toBe(false);
  });
});
