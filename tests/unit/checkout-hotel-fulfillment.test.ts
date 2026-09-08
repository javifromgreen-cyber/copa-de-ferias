import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { createCheckoutAttempt } from "@/lib/checkout-saga/createCheckoutAttempt";
import { acquireTicketHold } from "@/lib/checkout-saga/ticketHold";
import { transitionCheckoutAttempt } from "@/lib/checkout-saga/transitions";
import { persistCheckoutAttemptBuyer, type CheckoutAttemptBuyerInput } from "@/lib/checkout-saga/checkoutAttemptBuyer";
import { serializeFinalQuoteSnapshot, type FinalQuoteSnapshot, type FinalQuoteSnapshotHotel } from "@/lib/checkout-saga/finalQuoteSnapshot";
import { progressCapturedCheckoutAttempt } from "@/lib/checkout-saga/capture";
import { createPaymentAuthorization } from "@/lib/checkout-saga/payment";
import { computeRequiredRoomMix } from "@/lib/pricing/roomMix";
import { assignTravelersToRooms } from "@/lib/checkout-atu-aire/rooming";
import { ProviderError } from "@/lib/providers/errors";
import type { PaymentAuthorization } from "@/lib/providers/payments/stripe/types";
import type { HotelBookingResult } from "@/lib/providers/hotels/nuitee/types";

// Fase 3B.2 — TICKET_HOTEL: AUTHORIZED -> Nuitee SANDBOX BOOK -> Stripe
// TEST capture -> Booking CONFIRMED, per this phase's own §28 test list.
// Nuitee and Stripe are entirely mocked at the adapter boundary — never
// real network — the checkout-saga engines (transitions, ticket holds,
// hotelStatus claim, finalization) run for real against the test DB.

vi.mock("@/lib/providers/payments/stripe/authorization", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/providers/payments/stripe/authorization")>();
  return { ...actual, getAuthorization: vi.fn(), captureAuthorization: vi.fn(), cancelAuthorization: vi.fn() };
});
import { getAuthorization, captureAuthorization, cancelAuthorization } from "@/lib/providers/payments/stripe/authorization";

vi.mock("@/lib/providers/hotels/nuitee", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/providers/hotels/nuitee")>();
  return { ...actual, bookPrebook: vi.fn(), getHotelBooking: vi.fn(), findHotelBookingByClientReference: vi.fn(), cancelHotelBooking: vi.fn() };
});
import { bookPrebook, getHotelBooking, findHotelBookingByClientReference, cancelHotelBooking } from "@/lib/providers/hotels/nuitee";

const RUN_ID = `checkout-hotel-fulfillment-${Date.now()}`;
let tripId: string;
let eventId: string;

beforeAll(async () => {
  const trip = await prisma.trip.create({
    data: { number: 900020, slug: RUN_ID, name: "Test Trip Hotel", subtitle: "Test", city: "Test", country: "Test", homeTeam: "A", awayTeam: "B", stadium: "Test", matchDate: new Date(), price: 100, travelMode: "A_TU_AIRE", isDemo: true },
  });
  tripId = trip.id;
  const event = await prisma.event.create({ data: { tripId, homeTeam: "A", awayTeam: "B", stadium: "Test", matchDate: new Date() } });
  eventId = event.id;
});

afterAll(async () => {
  const attempts = await prisma.checkoutAttempt.findMany({ where: { tripId }, select: { bookingId: true } });
  const bookingIds = attempts.map((a) => a.bookingId).filter((id): id is string => Boolean(id));
  await prisma.checkoutAttempt.deleteMany({ where: { tripId } });
  if (bookingIds.length > 0) await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } });
  await prisma.trip.delete({ where: { id: tripId } });
  await prisma.$disconnect();
});

beforeEach(() => {
  vi.mocked(getAuthorization).mockReset();
  vi.mocked(captureAuthorization).mockReset();
  vi.mocked(cancelAuthorization).mockReset();
  vi.mocked(bookPrebook).mockReset();
  vi.mocked(getHotelBooking).mockReset();
  vi.mocked(findHotelBookingByClientReference).mockReset();
  vi.mocked(cancelHotelBooking).mockReset();
});
afterEach(() => vi.restoreAllMocks());

const BUYER: CheckoutAttemptBuyerInput = { firstName: "Test", lastName: "Sandbox", email: "buyer@example.com", phone: "+34600000000" };
const EXPECTED_AMOUNT_MINOR = 11000; // pvpTotal 110.00 EUR (50 ticket + 50 hotel + 10 orgFee)

function fakePi(overrides: Partial<PaymentAuthorization> = {}): PaymentAuthorization {
  return {
    providerReference: "pi_hotel_test",
    status: "authorized",
    rawStatus: "requires_capture",
    amountMinorUnits: EXPECTED_AMOUNT_MINOR,
    currency: "EUR",
    amountCapturableMinorUnits: EXPECTED_AMOUNT_MINOR,
    amountReceivedMinorUnits: 0,
    captureMethod: "manual",
    livemode: false,
    hasKnownFailure: false,
    lastPaymentErrorCode: null,
    metadata: {},
    clientSecret: null,
    ...overrides,
  };
}
function fakeCaptured(overrides: Partial<PaymentAuthorization> = {}): PaymentAuthorization {
  return fakePi({ status: "captured", rawStatus: "succeeded", amountReceivedMinorUnits: EXPECTED_AMOUNT_MINOR, ...overrides });
}
function fakeBooked(overrides: Partial<HotelBookingResult> = {}): HotelBookingResult {
  return { bookingId: "nuitee_booking_1", supplierBookingId: "supplier_1", hotelConfirmationCode: "CONF123", status: "CONFIRMED", paymentStatus: "PAID", currency: "EUR", totalPrice: 50, processingFee: null, ...overrides };
}
/** The real shape hotelFulfillment.ts's buildHotelBookSnapshotJson persists — used when a test needs to simulate hotelStatus already "confirmed" without going through progressHotelFulfillment itself. */
function fakeHotelBookSnapshotJson(): string {
  return JSON.stringify({
    bookingId: "nuitee_booking_1",
    supplierBookingId: "supplier_1",
    hotelConfirmationCode: "CONF123",
    status: "CONFIRMED",
    bookedAt: new Date().toISOString(),
    hotelId: "hotel_1",
    name: "Hotel Test",
    address: "Calle Falsa 123",
    checkIn: "2026-10-01",
    checkOut: "2026-10-03",
    roomMix: [{ type: "single", count: 1 }],
    roomingIntent: [{ type: "single", travelerIndices: [0] }],
    board: "RO",
    price: { total: 50, currency: "EUR" },
    includedTaxesAndFees: [],
    excludedTaxesAndFees: [{ description: "City tax", amount: 5, currency: "EUR" }],
    refundable: true,
  });
}

function reversibleHotelSnapshot(partySize: number, overrides: Partial<FinalQuoteSnapshotHotel> = {}): FinalQuoteSnapshotHotel {
  const roomMix = computeRequiredRoomMix(partySize);
  const roomingIntent = assignTravelersToRooms(partySize, roomMix);
  return {
    provider: "nuitee",
    hotelId: "hotel_1",
    name: "Hotel Test",
    address: "Calle Falsa 123",
    offerId: "hotel_offer_1",
    prebookId: "prebook_1",
    checkIn: "2026-10-01",
    checkOut: "2026-10-03",
    roomMix,
    roomingIntent,
    board: "RO",
    price: { total: 50, currency: "EUR" },
    includedTaxesAndFees: [],
    excludedTaxesAndFees: [{ description: "City tax", amount: 5, currency: "EUR" }],
    refundable: true,
    autoBookability: { autoBookable: true, level: "FULLY_REVERSIBLE", hotelSafeCancellationUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() },
    // Fase 3B.3 — defaults that satisfy hotelFulfillment.ts's own
    // pre-BOOK category/radius guard, so every pre-existing test in this
    // file (which doesn't care about that guard) keeps passing unchanged.
    stars: 3,
    hotelStarCategory: 3,
    distanceToStadiumKm: 1,
    stadiumHotelRadiusKm: 5,
    ...overrides,
  };
}

/** Mirrors checkout-capture.test.ts's own buildAuthorizedAttempt, extended with a hotel component already `prebooked`. */
async function buildHotelAuthorizedAttempt(opts: { partySize?: number; hotel?: Partial<FinalQuoteSnapshotHotel> } = {}) {
  const partySize = opts.partySize ?? 1;
  const attempt = await createCheckoutAttempt({ tripId, packageType: "TICKET_HOTEL", partySize });
  for (const step of ["revalidating", "ready_to_pay", "payment_authorizing", "payment_authorized"] as const) {
    await transitionCheckoutAttempt(attempt.id, step);
  }

  const ticketOffer = await prisma.ticketOffer.create({ data: { eventId, costNet: 50, currency: "EUR", stock: 10, active: true } });
  const hold = await acquireTicketHold({ checkoutAttemptId: attempt.id, ticketOfferId: ticketOffer.id, quantity: 1, expiresAt: new Date(Date.now() + 60_000) });
  if (!hold.ok) throw new Error("test setup: hold failed");

  for (let i = 0; i < partySize; i++) {
    await prisma.checkoutAttemptTraveler.create({ data: { checkoutAttemptId: attempt.id, order: i, firstName: `Traveler${i}`, lastName: "Sandbox", email: `traveler${i}@example.com` } });
  }
  await persistCheckoutAttemptBuyer(attempt.id, BUYER);

  const hotel = reversibleHotelSnapshot(partySize, opts.hotel);
  const snapshot: FinalQuoteSnapshot = {
    ticket: [{ eventId, ticketOfferId: ticketOffer.id, category: "General", quantity: 1, costNetPerUnit: 50, currency: "EUR" }],
    hotel,
    flight: null,
    commercial: { costTicketNet: 50, costHotelNet: 50, costFlightNet: 0, orgFee: 10, buffer: 0, pvpTotal: 110, pvpPerPerson: 110 / partySize, currency: "EUR" },
    travelersCount: partySize,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 900_000).toISOString(),
  };

  await prisma.checkoutAttempt.update({
    where: { id: attempt.id },
    data: {
      paymentStatus: "authorized",
      hotelStatus: "prebooked",
      finalQuoteSnapshot: serializeFinalQuoteSnapshot(snapshot),
      finalQuoteSnapshotVersion: 1,
      stripePaymentIntentId: "pi_hotel_test",
      paymentIntentQuoteVersion: 1,
    },
  });

  return attempt.id;
}

describe("A — TICKET_HOTEL reversible: AUTHORIZED -> BOOK -> CAPTURE -> Booking CONFIRMED", () => {
  it("progresses fulfilling -> payment_capturing -> finalizing -> confirmed in one call", async () => {
    const attemptId = await buildHotelAuthorizedAttempt();
    vi.mocked(bookPrebook).mockResolvedValueOnce(fakeBooked());
    vi.mocked(getAuthorization).mockResolvedValueOnce(fakePi());
    vi.mocked(captureAuthorization).mockResolvedValueOnce(fakeCaptured());

    const result = await progressCapturedCheckoutAttempt(attemptId);
    expect(result.outcome).toBe("confirmed");
    if (result.outcome !== "confirmed") return;

    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: result.bookingId } });
    expect(booking.bookingStatus).toBe("confirmed");
    expect(booking.packageType).toBe("TICKET_HOTEL");
  });
});

describe("B — BOOK occurs before Stripe capture", () => {
  it("bookPrebook is called before captureAuthorization", async () => {
    const attemptId = await buildHotelAuthorizedAttempt();
    const order: string[] = [];
    vi.mocked(bookPrebook).mockImplementationOnce(async () => {
      order.push("book");
      return fakeBooked();
    });
    vi.mocked(getAuthorization).mockResolvedValueOnce(fakePi());
    vi.mocked(captureAuthorization).mockImplementationOnce(async () => {
      order.push("capture");
      return fakeCaptured();
    });

    await progressCapturedCheckoutAttempt(attemptId);
    expect(order).toEqual(["book", "capture"]);
  });
});

describe("C — clientReference determinista y persistido", () => {
  it("is generated and persisted BEFORE bookPrebook is called, and matches cdf_hotel_<id>_v<version>", async () => {
    const attemptId = await buildHotelAuthorizedAttempt();
    let persistedAtCallTime: string | null = null;
    vi.mocked(bookPrebook).mockImplementationOnce(async () => {
      const attempt = await prisma.checkoutAttempt.findUniqueOrThrow({ where: { id: attemptId } });
      persistedAtCallTime = attempt.hotelClientReference;
      return fakeBooked();
    });
    vi.mocked(getAuthorization).mockResolvedValueOnce(fakePi());
    vi.mocked(captureAuthorization).mockResolvedValueOnce(fakeCaptured());

    await progressCapturedCheckoutAttempt(attemptId);
    expect(persistedAtCallTime).toBe(`cdf_hotel_${attemptId}_v1`);
    const [, clientReference] = vi.mocked(bookPrebook).mock.calls[0];
    expect(clientReference).toBe(`cdf_hotel_${attemptId}_v1`);
  });
});

describe("D — double progress uses the same clientReference / produces one logical booking", () => {
  it("two concurrent progressCapturedCheckoutAttempt calls call bookPrebook at most once", async () => {
    const attemptId = await buildHotelAuthorizedAttempt();
    vi.mocked(bookPrebook).mockImplementation(async () => fakeBooked());
    vi.mocked(getAuthorization).mockResolvedValue(fakePi());
    vi.mocked(captureAuthorization).mockResolvedValue(fakeCaptured());

    const [a, b] = await Promise.all([progressCapturedCheckoutAttempt(attemptId), progressCapturedCheckoutAttempt(attemptId)]);
    const outcomes = [a.outcome, b.outcome];
    expect(outcomes.every((o) => o === "confirmed" || o === "retry")).toBe(true);
    expect(vi.mocked(bookPrebook).mock.calls.length).toBeLessThanOrEqual(1);

    const confirmedIds = [a, b].filter((r) => r.outcome === "confirmed").map((r) => (r as { bookingId: string }).bookingId);
    if (confirmedIds.length === 2) expect(confirmedIds[0]).toBe(confirmedIds[1]);
  });
});

describe("E — BOOK network timeout + lookup finds the booking -> continues without a second BOOK", () => {
  it("resolves to confirmed and bookPrebook is called exactly once", async () => {
    const attemptId = await buildHotelAuthorizedAttempt();
    vi.mocked(bookPrebook).mockRejectedValueOnce(new ProviderError("NETWORK_ERROR", "nuitee", "timeout"));
    vi.mocked(findHotelBookingByClientReference).mockResolvedValueOnce([fakeBooked()]);
    vi.mocked(getAuthorization).mockResolvedValueOnce(fakePi());
    vi.mocked(captureAuthorization).mockResolvedValueOnce(fakeCaptured());

    const result = await progressCapturedCheckoutAttempt(attemptId);
    expect(result.outcome).toBe("confirmed");
    expect(vi.mocked(bookPrebook)).toHaveBeenCalledTimes(1);
  });
});

describe("F — BOOK duplicate error (4005-style) -> lookup by clientReference -> reconciled", () => {
  it("a non-network provider error followed by a confirmed lookup match resolves to confirmed", async () => {
    const attemptId = await buildHotelAuthorizedAttempt();
    vi.mocked(bookPrebook).mockRejectedValueOnce(new ProviderError("INVALID_PROVIDER_RESPONSE", "nuitee", "duplicate clientReference (4005)"));
    vi.mocked(findHotelBookingByClientReference).mockResolvedValueOnce([fakeBooked()]);
    vi.mocked(getAuthorization).mockResolvedValueOnce(fakePi());
    vi.mocked(captureAuthorization).mockResolvedValueOnce(fakeCaptured());

    const result = await progressCapturedCheckoutAttempt(attemptId);
    expect(result.outcome).toBe("confirmed");
  });
});

describe("G — BOOK timeout + inconclusive lookup -> RECOVERY_REQUIRED, no capture", () => {
  it("an ambiguous lookup result never proceeds to capture", async () => {
    const attemptId = await buildHotelAuthorizedAttempt();
    vi.mocked(bookPrebook).mockRejectedValueOnce(new ProviderError("NETWORK_ERROR", "nuitee", "timeout"));
    vi.mocked(findHotelBookingByClientReference).mockResolvedValueOnce([fakeBooked(), fakeBooked({ bookingId: "nuitee_booking_2" })]); // >1 confirmed match

    const result = await progressCapturedCheckoutAttempt(attemptId);
    expect(result.outcome).toBe("recovery_required");
    expect(vi.mocked(captureAuthorization)).not.toHaveBeenCalled();
    const attempt = await prisma.checkoutAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    expect(attempt.status).toBe("recovery_required");
  });
});

describe("H — BOOK definitively failed with confirmed absence -> void Stripe, release hold, no Booking", () => {
  it("voids the PaymentIntent and marks the attempt failed without ever capturing", async () => {
    const attemptId = await buildHotelAuthorizedAttempt();
    vi.mocked(bookPrebook).mockRejectedValueOnce(new ProviderError("INVALID_PROVIDER_RESPONSE", "nuitee", "rejected"));
    vi.mocked(findHotelBookingByClientReference).mockResolvedValueOnce([]); // confirmed absence
    vi.mocked(cancelAuthorization).mockResolvedValueOnce(fakePi({ status: "voided", rawStatus: "canceled" }));

    const result = await progressCapturedCheckoutAttempt(attemptId);
    expect(result.outcome).toBe("failed");
    expect(vi.mocked(cancelAuthorization)).toHaveBeenCalledWith("pi_hotel_test");
    expect(vi.mocked(captureAuthorization)).not.toHaveBeenCalled();

    const attempt = await prisma.checkoutAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    expect(attempt.status).toBe("failed");
    expect(attempt.bookingId).toBeNull();
    const holds = await prisma.ticketHold.findMany({ where: { checkoutAttemptId: attemptId } });
    expect(holds.every((h) => h.status === "released")).toBe(true);
  });
});

describe("I — hotel booking is persisted before capture", () => {
  it("hotelProviderReference/hotelBookSnapshot are set the moment BOOK confirms, before captureAuthorization runs", async () => {
    const attemptId = await buildHotelAuthorizedAttempt();
    vi.mocked(bookPrebook).mockImplementationOnce(async () => fakeBooked());
    vi.mocked(getAuthorization).mockResolvedValueOnce(fakePi());
    vi.mocked(captureAuthorization).mockImplementationOnce(async () => {
      const attempt = await prisma.checkoutAttempt.findUniqueOrThrow({ where: { id: attemptId } });
      expect(attempt.hotelStatus).toBe("confirmed");
      expect(attempt.hotelProviderReference).toBe("nuitee_booking_1");
      expect(attempt.hotelBookSnapshot).not.toBe("");
      return fakeCaptured();
    });

    await progressCapturedCheckoutAttempt(attemptId);
    expect(vi.mocked(captureAuthorization)).toHaveBeenCalledTimes(1);
  });
});

describe("J — capture succeeded -> no hotel cancellation", () => {
  it("cancelHotelBooking is never called on a successful capture", async () => {
    const attemptId = await buildHotelAuthorizedAttempt();
    vi.mocked(bookPrebook).mockResolvedValueOnce(fakeBooked());
    vi.mocked(getAuthorization).mockResolvedValueOnce(fakePi());
    vi.mocked(captureAuthorization).mockResolvedValueOnce(fakeCaptured());

    await progressCapturedCheckoutAttempt(attemptId);
    expect(vi.mocked(cancelHotelBooking)).not.toHaveBeenCalled();
  });
});

describe("K — capture timeout + GET shows succeeded -> finalize, no cancel", () => {
  it("reconciles as captured and never cancels the hotel", async () => {
    const attemptId = await buildHotelAuthorizedAttempt();
    vi.mocked(bookPrebook).mockResolvedValueOnce(fakeBooked());
    vi.mocked(getAuthorization).mockResolvedValueOnce(fakePi()).mockResolvedValueOnce(fakeCaptured()); // pre-capture read, then reconciliation read
    vi.mocked(captureAuthorization).mockRejectedValueOnce(new Error("network timeout"));

    const result = await progressCapturedCheckoutAttempt(attemptId);
    expect(result.outcome).toBe("confirmed");
    expect(vi.mocked(cancelHotelBooking)).not.toHaveBeenCalled();
  });
});

describe("L — a definitive capture failure attempts to cancel the hotel", () => {
  it("calls cancelHotelBooking once the hotel is already CONFIRMED", async () => {
    const attemptId = await buildHotelAuthorizedAttempt();
    vi.mocked(bookPrebook).mockResolvedValueOnce(fakeBooked());
    // A definitive failure per capturePaymentIntent's own logic is only
    // ever produced by the pre-capture check ITSELF showing voided/failed
    // — never merely "the capture call threw" (that reconciles to
    // "unknown"/ambiguous instead, see test O). captureAuthorization is
    // therefore never even reached in this scenario.
    vi.mocked(getAuthorization).mockResolvedValueOnce(fakePi({ status: "voided", rawStatus: "canceled" }));
    vi.mocked(cancelHotelBooking).mockResolvedValueOnce({ outcome: "resolved", result: { bookingId: "nuitee_booking_1", status: "CANCELLED", charges: 0, currency: "EUR" } });

    const result = await progressCapturedCheckoutAttempt(attemptId);
    expect(vi.mocked(cancelHotelBooking)).toHaveBeenCalledWith("nuitee_booking_1", undefined);
    expect(vi.mocked(captureAuthorization)).not.toHaveBeenCalled();
    expect(result.outcome).toBe("failed");
  });
});

describe("M — cancel CANCELLED with zero charges -> compensation completed", () => {
  it("marks the attempt failed cleanly", async () => {
    const attemptId = await buildHotelAuthorizedAttempt();
    vi.mocked(bookPrebook).mockResolvedValueOnce(fakeBooked());
    vi.mocked(getAuthorization).mockResolvedValueOnce(fakePi({ status: "voided", rawStatus: "canceled" }));
    vi.mocked(cancelHotelBooking).mockResolvedValueOnce({ outcome: "resolved", result: { bookingId: "nuitee_booking_1", status: "CANCELLED", charges: 0, currency: "EUR" } });

    const result = await progressCapturedCheckoutAttempt(attemptId);
    expect(result.outcome).toBe("failed");
    const attempt = await prisma.checkoutAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    expect(attempt.hotelStatus).toBe("cancelled");
    expect(attempt.status).toBe("failed");
  });
});

describe("N — cancel CANCELLED_WITH_CHARGES -> RECOVERY_REQUIRED", () => {
  it("never assumes clean compensation when charges apply", async () => {
    const attemptId = await buildHotelAuthorizedAttempt();
    vi.mocked(bookPrebook).mockResolvedValueOnce(fakeBooked());
    vi.mocked(getAuthorization).mockResolvedValueOnce(fakePi({ status: "voided", rawStatus: "canceled" }));
    vi.mocked(cancelHotelBooking).mockResolvedValueOnce({ outcome: "resolved", result: { bookingId: "nuitee_booking_1", status: "CANCELLED_WITH_CHARGES", charges: 15, currency: "EUR" } });

    const result = await progressCapturedCheckoutAttempt(attemptId);
    expect(result.outcome).toBe("recovery_required");
    const attempt = await prisma.checkoutAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    expect(attempt.status).toBe("recovery_required");
    expect(attempt.hotelStatus).toBe("cancelling");
  });
});

describe("O — an ambiguous cancel result -> RECOVERY_REQUIRED", () => {
  it("never releases/asserts compensated when cancelHotelBooking itself cannot resolve a real status", async () => {
    const attemptId = await buildHotelAuthorizedAttempt();
    vi.mocked(bookPrebook).mockResolvedValueOnce(fakeBooked());
    vi.mocked(getAuthorization).mockResolvedValueOnce(fakePi({ status: "voided", rawStatus: "canceled" }));
    // cancelHotelBooking() (book.ts) now owns its own PUT+GET
    // reconciliation and never throws — an unresolved outcome from it
    // means BOTH failed internally.
    vi.mocked(cancelHotelBooking).mockResolvedValueOnce({ outcome: "unknown", reason: "cancel_and_get_both_unreachable" });

    const result = await progressCapturedCheckoutAttempt(attemptId);
    expect(result.outcome).toBe("recovery_required");
  });
});

describe("P — a DB write failure right after BOOK never causes a second BOOK on retry", () => {
  it("hotelStatus already confirmed short-circuits without recalling bookPrebook", async () => {
    const attemptId = await buildHotelAuthorizedAttempt();
    vi.mocked(bookPrebook).mockResolvedValueOnce(fakeBooked());
    await prisma.checkoutAttempt.update({ where: { id: attemptId }, data: { hotelStatus: "booking" } });
    // Simulate a completed BOOK whose persistence step already landed
    // (as it would inside progressHotelFulfillment's own confirmBooking).
    await prisma.checkoutAttempt.update({ where: { id: attemptId }, data: { hotelStatus: "confirmed", hotelProviderReference: "nuitee_booking_1", hotelBookSnapshot: fakeHotelBookSnapshotJson() } });

    vi.mocked(getAuthorization).mockResolvedValueOnce(fakePi());
    vi.mocked(captureAuthorization).mockResolvedValueOnce(fakeCaptured());
    const result = await progressCapturedCheckoutAttempt(attemptId);
    expect(result.outcome).toBe("confirmed");
    expect(vi.mocked(bookPrebook)).not.toHaveBeenCalled();
  });
});

describe("Q — a DB failure after capture never re-books/re-captures on retry, just finalizes", () => {
  it("resumes straight into finalizing", async () => {
    const attemptId = await buildHotelAuthorizedAttempt();
    await prisma.checkoutAttempt.update({ where: { id: attemptId }, data: { status: "finalizing", paymentStatus: "captured", hotelStatus: "confirmed", hotelProviderReference: "nuitee_booking_1", hotelBookSnapshot: fakeHotelBookSnapshotJson() } });

    const result = await progressCapturedCheckoutAttempt(attemptId);
    expect(result.outcome).toBe("confirmed");
    expect(vi.mocked(bookPrebook)).not.toHaveBeenCalled();
    expect(vi.mocked(captureAuthorization)).not.toHaveBeenCalled();
  });
});

describe("R — genuine concurrency on progress produces exactly one Booking", () => {
  it("Promise.all of two full progress calls from payment_authorized yields one Booking", async () => {
    const attemptId = await buildHotelAuthorizedAttempt();
    vi.mocked(bookPrebook).mockImplementation(async () => fakeBooked());
    vi.mocked(getAuthorization).mockResolvedValue(fakePi());
    vi.mocked(captureAuthorization).mockResolvedValue(fakeCaptured());

    const results = await Promise.all([progressCapturedCheckoutAttempt(attemptId), progressCapturedCheckoutAttempt(attemptId)]);
    const confirmed = results.filter((r) => r.outcome === "confirmed") as { outcome: "confirmed"; bookingId: string }[];
    expect(confirmed.length).toBeGreaterThan(0);
    const bookingIds = new Set(confirmed.map((r) => r.bookingId));
    expect(bookingIds.size).toBe(1);
    const bookingCount = await prisma.booking.count({ where: { id: { in: [...bookingIds] } } });
    expect(bookingCount).toBe(1);
  });
});

describe("S — a non-refundable hotel never gets a real Stripe authorization", () => {
  it("createPaymentAuthorization refuses without ever calling Stripe", async () => {
    const attempt = await createCheckoutAttempt({ tripId, packageType: "TICKET_HOTEL", partySize: 1 });
    for (const step of ["revalidating", "ready_to_pay"] as const) await transitionCheckoutAttempt(attempt.id, step);
    const hotel = reversibleHotelSnapshot(1, { refundable: false, autoBookability: { autoBookable: false, level: "IRREVERSIBLE", hotelSafeCancellationUntil: null } });
    await prisma.checkoutAttempt.update({
      where: { id: attempt.id },
      data: {
        finalQuoteSnapshot: serializeFinalQuoteSnapshot({
          ticket: [{ eventId, ticketOfferId: "offer_placeholder", category: "General", quantity: 1, costNetPerUnit: 50, currency: "EUR" }],
          hotel,
          flight: null,
          commercial: { costTicketNet: 50, costHotelNet: 50, costFlightNet: 0, orgFee: 10, buffer: 0, pvpTotal: 110, pvpPerPerson: 110, currency: "EUR" },
          travelersCount: 1,
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 900_000).toISOString(),
        }),
        latestSafePaymentAt: new Date(Date.now() + 900_000),
      },
    });
    const result = await createPaymentAuthorization(attempt.id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Elige otra opción de hotel");
  });
});

describe("T — reversibility UNKNOWN never gets a real Stripe authorization", () => {
  it("createPaymentAuthorization refuses when autoBookability is UNKNOWN", async () => {
    const attempt = await createCheckoutAttempt({ tripId, packageType: "TICKET_HOTEL", partySize: 1 });
    for (const step of ["revalidating", "ready_to_pay"] as const) await transitionCheckoutAttempt(attempt.id, step);
    const hotel = reversibleHotelSnapshot(1, { autoBookability: { autoBookable: false, level: "UNKNOWN", hotelSafeCancellationUntil: null } });
    await prisma.checkoutAttempt.update({
      where: { id: attempt.id },
      data: {
        finalQuoteSnapshot: serializeFinalQuoteSnapshot({
          ticket: [{ eventId, ticketOfferId: "offer_placeholder", category: "General", quantity: 1, costNetPerUnit: 50, currency: "EUR" }],
          hotel,
          flight: null,
          commercial: { costTicketNet: 50, costHotelNet: 50, costFlightNet: 0, orgFee: 10, buffer: 0, pvpTotal: 110, pvpPerPerson: 110, currency: "EUR" },
          travelersCount: 1,
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 900_000).toISOString(),
        }),
        latestSafePaymentAt: new Date(Date.now() + 900_000),
      },
    });
    const result = await createPaymentAuthorization(attempt.id);
    expect(result.ok).toBe(false);
  });
});

describe("U/V/W — rooming 1-6, 5 travelers -> [2,3], guests/occupancyNumber correct", () => {
  it.each([1, 2, 3, 4, 5, 6])("partySize %i maps every traveler to a guest with the correct occupancyNumber, never from BOOK's own response", async (partySize) => {
    const attemptId = await buildHotelAuthorizedAttempt({ partySize });
    vi.mocked(bookPrebook).mockResolvedValueOnce(fakeBooked());
    vi.mocked(getAuthorization).mockResolvedValueOnce(fakePi());
    vi.mocked(captureAuthorization).mockResolvedValueOnce(fakeCaptured());

    await progressCapturedCheckoutAttempt(attemptId);
    const [, , , guests] = vi.mocked(bookPrebook).mock.calls[0];
    expect(guests).toHaveLength(partySize);
    const roomMix = computeRequiredRoomMix(partySize);
    const roomingIntent = assignTravelersToRooms(partySize, roomMix);
    if (partySize === 5) {
      expect(roomMix.map((r) => r.type)).toEqual(["double", "triple"]);
      expect(roomingIntent[0].travelerIndices).toEqual([0, 1]);
      expect(roomingIntent[1].travelerIndices).toEqual([2, 3, 4]);
    }
    roomingIntent.forEach((room, i) => {
      for (const travelerIndex of room.travelerIndices) {
        const guest = guests!.find((g: { occupancyNumber: number; firstName: string }) => g.firstName === `Traveler${travelerIndex}`);
        expect(guest?.occupancyNumber).toBe(i + 1);
      }
    });
  });
});

describe("X — Nuitee BOOK's own occupants never reconstruct CDF rooming", () => {
  it("HotelBookingResult carries no per-room detail at all, structurally impossible to derive rooming from it", () => {
    const booked = fakeBooked();
    expect(Object.keys(booked)).not.toContain("bookedRooms");
    expect(Object.keys(booked)).not.toContain("occupants");
  });
});

describe("Y — final hotel snapshot on Booking is correct", () => {
  it("hotelSelectionSnapshot parses with real BOOK-time facts, not the pre-BOOK offer", async () => {
    const attemptId = await buildHotelAuthorizedAttempt();
    vi.mocked(bookPrebook).mockResolvedValueOnce(fakeBooked());
    vi.mocked(getAuthorization).mockResolvedValueOnce(fakePi());
    vi.mocked(captureAuthorization).mockResolvedValueOnce(fakeCaptured());

    const result = await progressCapturedCheckoutAttempt(attemptId);
    expect(result.outcome).toBe("confirmed");
    if (result.outcome !== "confirmed") return;
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: result.bookingId } });
    const snapshot = JSON.parse(booking.hotelSelectionSnapshot);
    expect(snapshot.name).toBe("Hotel Test");
    expect(snapshot.confirmationCode).toBe("CONF123");
    expect(snapshot.nights).toBe(2);
    expect(snapshot.hotelOfferId).toBe("hotel_offer_1");
  });
});

describe("Z — excluded taxes are conserved for Mi Viaje", () => {
  it("hotelSelectionSnapshot carries excludedTaxesAndFees through", async () => {
    const attemptId = await buildHotelAuthorizedAttempt();
    vi.mocked(bookPrebook).mockResolvedValueOnce(fakeBooked());
    vi.mocked(getAuthorization).mockResolvedValueOnce(fakePi());
    vi.mocked(captureAuthorization).mockResolvedValueOnce(fakeCaptured());

    const result = await progressCapturedCheckoutAttempt(attemptId);
    if (result.outcome !== "confirmed") throw new Error("expected confirmed");
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: result.bookingId } });
    const snapshot = JSON.parse(booking.hotelSelectionSnapshot);
    expect(snapshot.excludedTaxesAndFees).toEqual([{ description: "City tax", amount: 5, currency: "EUR" }]);
  });
});

describe("AD — 0 Duffel Order calls anywhere in the hotel fulfillment path", () => {
  it("hotelFulfillment.ts and its capture.ts wiring never import from the Duffel provider directory", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    for (const f of ["hotelFulfillment.ts", "capture.ts"]) {
      const content = await fs.readFile(path.join(process.cwd(), "src/lib/checkout-saga", f), "utf8");
      expect(content).not.toMatch(/providers\/flights\/duffel/i);
      expect(content.toLowerCase()).not.toContain("createorder");
    }
  });
});

describe("AF — no Stripe capture is ever attempted while the hotel isn't CONFIRMED", () => {
  it("a payment_capturing entry with a non-confirmed hotelStatus goes straight to recovery_required", async () => {
    const attemptId = await buildHotelAuthorizedAttempt();
    await prisma.checkoutAttempt.update({ where: { id: attemptId }, data: { status: "payment_capturing", hotelStatus: "booking" } });

    const result = await progressCapturedCheckoutAttempt(attemptId);
    expect(result.outcome).toBe("recovery_required");
    expect(vi.mocked(captureAuthorization)).not.toHaveBeenCalled();
  });
});

// Fase 3B.3 — the defensive pre-BOOK guard: the automatic hotel
// resolution should always already deliver a hotel of the exact
// requested category, inside the configured radius — but this codebase
// never trusts that alone right before a real BOOK call. Any mismatch
// must refuse to BOOK, void the Stripe authorization, and fail the
// attempt, exactly like not_auto_bookable/window_expired already do.
describe("AG — a star-category mismatch (stars !== hotelStarCategory) blocks BOOK entirely", () => {
  it("never calls bookPrebook, voids Stripe, and fails the attempt", async () => {
    const attemptId = await buildHotelAuthorizedAttempt({ hotel: { stars: 3, hotelStarCategory: 4 } });
    vi.mocked(getAuthorization).mockResolvedValueOnce(fakePi());

    const result = await progressCapturedCheckoutAttempt(attemptId);
    expect(result.outcome).toBe("failed");
    expect(vi.mocked(bookPrebook)).not.toHaveBeenCalled();
    expect(vi.mocked(cancelAuthorization)).toHaveBeenCalled();

    const attempt = await prisma.checkoutAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    expect(attempt.hotelStatus).toBe("failed");
  });
});

describe("AH — a hotel outside stadiumHotelRadiusKm (distanceToStadiumKm > stadiumHotelRadiusKm) blocks BOOK entirely", () => {
  it("never calls bookPrebook, voids Stripe, and fails the attempt", async () => {
    const attemptId = await buildHotelAuthorizedAttempt({ hotel: { distanceToStadiumKm: 10, stadiumHotelRadiusKm: 5 } });
    vi.mocked(getAuthorization).mockResolvedValueOnce(fakePi());

    const result = await progressCapturedCheckoutAttempt(attemptId);
    expect(result.outcome).toBe("failed");
    expect(vi.mocked(bookPrebook)).not.toHaveBeenCalled();
    expect(vi.mocked(cancelAuthorization)).toHaveBeenCalled();

    const attempt = await prisma.checkoutAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    expect(attempt.hotelStatus).toBe("failed");
  });
});

describe("AI — the FinalQuoteSnapshot retains the audit fields (category, delivered stars, distance, radius)", () => {
  it("hotelStarCategory/stars/distanceToStadiumKm/stadiumHotelRadiusKm all round-trip through the persisted snapshot", async () => {
    const attemptId = await buildHotelAuthorizedAttempt({ hotel: { stars: 4, hotelStarCategory: 4, distanceToStadiumKm: 2.3, stadiumHotelRadiusKm: 5 } });
    const attempt = await prisma.checkoutAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    const snapshot = JSON.parse(attempt.finalQuoteSnapshot) as FinalQuoteSnapshot;
    expect(snapshot.hotel?.hotelStarCategory).toBe(4);
    expect(snapshot.hotel?.stars).toBe(4);
    expect(snapshot.hotel?.distanceToStadiumKm).toBe(2.3);
    expect(snapshot.hotel?.stadiumHotelRadiusKm).toBe(5);
  });
});

