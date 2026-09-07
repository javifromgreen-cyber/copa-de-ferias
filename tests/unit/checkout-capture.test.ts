import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { createCheckoutAttempt } from "@/lib/checkout-saga/createCheckoutAttempt";
import { acquireTicketHold } from "@/lib/checkout-saga/ticketHold";
import { transitionCheckoutAttempt } from "@/lib/checkout-saga/transitions";
import { persistCheckoutAttemptBuyer, type CheckoutAttemptBuyerInput } from "@/lib/checkout-saga/checkoutAttemptBuyer";
import { serializeFinalQuoteSnapshot, type FinalQuoteSnapshot } from "@/lib/checkout-saga/finalQuoteSnapshot";
import { progressCapturedCheckoutAttempt } from "@/lib/checkout-saga/capture";
import { cancelAuthorizedPayment, createPaymentAuthorization } from "@/lib/checkout-saga/payment";
import type { PaymentAuthorization } from "@/lib/providers/payments/stripe/types";
import type { PackageType } from "@prisma/client";

// Fase 3B.1 — the capture->finalize->confirmed progression (capture.ts),
// TICKET_ONLY only. Stripe itself is entirely mocked at the adapter
// boundary (getAuthorization/captureAuthorization/cancelAuthorization) —
// never real network — the checkout-saga engines (transitions,
// ticket holds, finalization) run for real against the test DB, same
// discipline as checkout-payment-saga.test.ts / checkout-attempt-finalize.test.ts.

vi.mock("@/lib/providers/payments/stripe/authorization", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/providers/payments/stripe/authorization")>();
  return { ...actual, getAuthorization: vi.fn(), captureAuthorization: vi.fn(), cancelAuthorization: vi.fn() };
});
import { getAuthorization, captureAuthorization, cancelAuthorization } from "@/lib/providers/payments/stripe/authorization";

const RUN_ID = `checkout-capture-${Date.now()}`;
let tripId: string;
let eventId: string;

beforeAll(async () => {
  const trip = await prisma.trip.create({
    data: { number: 900010, slug: RUN_ID, name: "Test Trip", subtitle: "Test", city: "Test", country: "Test", homeTeam: "A", awayTeam: "B", stadium: "Test", matchDate: new Date(), price: 100, travelMode: "A_TU_AIRE", isDemo: true },
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
});
afterEach(() => vi.restoreAllMocks());

const BUYER: CheckoutAttemptBuyerInput = { firstName: "Test", lastName: "Sandbox", email: "test.sandbox@example.com", phone: "+34600000000" };
const EXPECTED_AMOUNT_MINOR = 6000; // pvpTotal 60.00 EUR

function fakePi(overrides: Partial<PaymentAuthorization>): PaymentAuthorization {
  return {
    providerReference: "pi_capture_test",
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

/** Builds a fresh CheckoutAttempt through the real transition graph up to (and stopping at) PAYMENT_AUTHORIZED, with a HELD hold, persisted buyer/traveler, a snapshot, and a Stripe PaymentIntent id — mirrors what createPaymentAuthorization/verifyAndApplyAuthorization would have left behind. */
async function buildAuthorizedAttempt(opts: { packageType?: PackageType } = {}) {
  const { packageType = "TICKET_ONLY" } = opts;
  const attempt = await createCheckoutAttempt({ tripId, packageType, partySize: 1 });
  for (const step of ["revalidating", "ready_to_pay", "payment_authorizing", "payment_authorized"] as const) {
    await transitionCheckoutAttempt(attempt.id, step);
  }

  const ticketOffer = await prisma.ticketOffer.create({ data: { eventId, costNet: 50, currency: "EUR", stock: 10, active: true } });
  const hold = await acquireTicketHold({ checkoutAttemptId: attempt.id, ticketOfferId: ticketOffer.id, quantity: 1, expiresAt: new Date(Date.now() + 60_000) });
  if (!hold.ok) throw new Error("test setup: hold failed");

  await prisma.checkoutAttemptTraveler.create({ data: { checkoutAttemptId: attempt.id, order: 0, firstName: "Test", lastName: "Sandbox" } });
  await persistCheckoutAttemptBuyer(attempt.id, BUYER);

  const snapshot: FinalQuoteSnapshot = {
    ticket: [{ eventId, ticketOfferId: ticketOffer.id, category: "General", quantity: 1, costNetPerUnit: 50, currency: "EUR" }],
    hotel: null,
    flight: null,
    commercial: { costTicketNet: 50, costHotelNet: 0, costFlightNet: 0, orgFee: 10, buffer: 0, pvpTotal: 60, pvpPerPerson: 60, currency: "EUR" },
    travelersCount: 1,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 900_000).toISOString(),
  };

  await prisma.checkoutAttempt.update({
    where: { id: attempt.id },
    data: {
      paymentStatus: "authorized",
      finalQuoteSnapshot: serializeFinalQuoteSnapshot(snapshot),
      finalQuoteSnapshotVersion: 1,
      stripePaymentIntentId: "pi_capture_test",
      paymentIntentQuoteVersion: 1,
    },
  });

  return attempt.id;
}

describe("A — TICKET_ONLY authorized -> capture -> CONFIRMED, end to end", () => {
  it("progresses fulfilling -> payment_capturing -> finalizing -> confirmed in one call", async () => {
    const attemptId = await buildAuthorizedAttempt();
    vi.mocked(getAuthorization).mockResolvedValueOnce(fakePi({})); // requires_capture, read before capturing
    vi.mocked(captureAuthorization).mockResolvedValueOnce(fakeCaptured());

    const result = await progressCapturedCheckoutAttempt(attemptId);
    expect(result.outcome).toBe("confirmed");
    if (result.outcome !== "confirmed") return;

    const attempt = await prisma.checkoutAttempt.findUniqueOrThrow({ where: { id: attemptId }, include: { ticketHolds: true } });
    expect(attempt.status).toBe("confirmed");
    expect(attempt.paymentStatus).toBe("captured");
    expect(attempt.bookingId).toBe(result.bookingId);
    expect(attempt.ticketHolds.every((h) => h.status === "confirmed")).toBe(true);

    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: result.bookingId } });
    expect(booking.reference).toBe(result.reference);
    expect(booking.accessToken).toBe(result.accessToken);
    expect(booking.bookingStatus).toBe("confirmed");
  });
});

describe("B — capture amount always comes from the server-side snapshot", () => {
  it("captureAuthorization is called with the snapshot's own pvpTotal in minor units, never a client input", async () => {
    const attemptId = await buildAuthorizedAttempt();
    vi.mocked(getAuthorization).mockResolvedValueOnce(fakePi({}));
    vi.mocked(captureAuthorization).mockResolvedValueOnce(fakeCaptured());

    await progressCapturedCheckoutAttempt(attemptId);
    const call = vi.mocked(captureAuthorization).mock.calls[0];
    expect(call[0]).toBe("pi_capture_test");
    expect(call[1].amountMinorUnits).toBe(EXPECTED_AMOUNT_MINOR);
  });
});

describe("C — capture only ever targets THIS attempt's own PaymentIntent id", () => {
  it("getAuthorization/captureAuthorization are called with attempt.stripePaymentIntentId, never a foreign id", async () => {
    const attemptId = await buildAuthorizedAttempt();
    vi.mocked(getAuthorization).mockResolvedValueOnce(fakePi({}));
    vi.mocked(captureAuthorization).mockResolvedValueOnce(fakeCaptured());

    await progressCapturedCheckoutAttempt(attemptId);
    expect(vi.mocked(getAuthorization).mock.calls[0][0]).toBe("pi_capture_test");
    expect(vi.mocked(captureAuthorization).mock.calls[0][0]).toBe("pi_capture_test");
  });
});

describe("D — requires_capture -> capture() called exactly once", () => {
  it("does not call captureAuthorization more than once for a clean success", async () => {
    const attemptId = await buildAuthorizedAttempt();
    vi.mocked(getAuthorization).mockResolvedValueOnce(fakePi({}));
    vi.mocked(captureAuthorization).mockResolvedValueOnce(fakeCaptured());

    await progressCapturedCheckoutAttempt(attemptId);
    expect(vi.mocked(captureAuthorization)).toHaveBeenCalledTimes(1);
  });
});

describe("E — retry after already-succeeded never captures a second time", () => {
  it("a fresh GET showing status=captured short-circuits before ever calling captureAuthorization", async () => {
    const attemptId = await buildAuthorizedAttempt();
    await prisma.checkoutAttempt.update({ where: { id: attemptId }, data: { status: "payment_capturing" } });
    vi.mocked(getAuthorization).mockResolvedValueOnce(fakeCaptured());

    const result = await progressCapturedCheckoutAttempt(attemptId);
    expect(result.outcome).toBe("confirmed");
    expect(vi.mocked(captureAuthorization)).not.toHaveBeenCalled();
  });
});

describe("F — capture-call timeout, then GET shows succeeded -> treated as captured, no error surfaced", () => {
  it("continues to CONFIRMED via the reconciling GET", async () => {
    const attemptId = await buildAuthorizedAttempt();
    vi.mocked(getAuthorization)
      .mockResolvedValueOnce(fakePi({})) // pre-capture check
      .mockResolvedValueOnce(fakeCaptured()); // reconciliation GET after the throw
    vi.mocked(captureAuthorization).mockRejectedValueOnce(new Error("ETIMEDOUT"));

    const result = await progressCapturedCheckoutAttempt(attemptId);
    expect(result.outcome).toBe("confirmed");
    expect(vi.mocked(captureAuthorization)).toHaveBeenCalledTimes(1); // never retried blindly
  });
});

describe("G — capture-call timeout, then GET still shows requires_capture -> safe to retry, never re-captured blindly here", () => {
  it("returns outcome=retry without ever calling captureAuthorization a second time", async () => {
    const attemptId = await buildAuthorizedAttempt();
    vi.mocked(getAuthorization)
      .mockResolvedValueOnce(fakePi({})) // pre-capture check
      .mockResolvedValueOnce(fakePi({})); // reconciliation GET — still requires_capture
    vi.mocked(captureAuthorization).mockRejectedValueOnce(new Error("ETIMEDOUT"));

    const result = await progressCapturedCheckoutAttempt(attemptId);
    expect(result.outcome).toBe("retry");
    expect(vi.mocked(captureAuthorization)).toHaveBeenCalledTimes(1);

    const attempt = await prisma.checkoutAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    expect(attempt.status).toBe("payment_capturing"); // never advanced past this on an unresolved retry
  });
});

describe("H — Stripe unverifiable -> RECOVERY_REQUIRED, hold stays HELD, no Booking", () => {
  it("getAuthorization throwing before capture even starts parks the attempt in recovery_required", async () => {
    const attemptId = await buildAuthorizedAttempt();
    vi.mocked(getAuthorization).mockRejectedValueOnce(new Error("network down"));

    const result = await progressCapturedCheckoutAttempt(attemptId);
    expect(result.outcome).toBe("recovery_required");
    expect(vi.mocked(captureAuthorization)).not.toHaveBeenCalled();

    const attempt = await prisma.checkoutAttempt.findUniqueOrThrow({ where: { id: attemptId }, include: { ticketHolds: true } });
    expect(attempt.status).toBe("recovery_required");
    expect(attempt.paymentStatus).toBe("unknown");
    expect(attempt.bookingId).toBeNull();
    expect(attempt.ticketHolds.every((h) => h.status === "held")).toBe(true);
  });
});

describe("I/J — Booking only ever exists after CAPTURED; TicketHold is HELD before capture", () => {
  it("before progressing, the hold is HELD and there is no Booking", async () => {
    const attemptId = await buildAuthorizedAttempt();
    const attempt = await prisma.checkoutAttempt.findUniqueOrThrow({ where: { id: attemptId }, include: { ticketHolds: true } });
    expect(attempt.bookingId).toBeNull();
    expect(attempt.ticketHolds.every((h) => h.status === "held")).toBe(true);
  });
});

describe("K — TicketHold becomes CONFIRMED only after finalization", () => {
  it("the same hold row flips held -> confirmed exactly when the Booking is created", async () => {
    const attemptId = await buildAuthorizedAttempt();
    vi.mocked(getAuthorization).mockResolvedValueOnce(fakePi({}));
    vi.mocked(captureAuthorization).mockResolvedValueOnce(fakeCaptured());

    await progressCapturedCheckoutAttempt(attemptId);
    const attempt = await prisma.checkoutAttempt.findUniqueOrThrow({ where: { id: attemptId }, include: { ticketHolds: true } });
    expect(attempt.ticketHolds.every((h) => h.status === "confirmed")).toBe(true);
  });
});

describe("L — a definitive capture failure never creates a Booking, releases the hold", () => {
  it("PaymentIntent confirmed voided/canceled before capture -> FAILED, hold released", async () => {
    const attemptId = await buildAuthorizedAttempt();
    vi.mocked(getAuthorization).mockResolvedValueOnce(fakePi({ status: "voided", rawStatus: "canceled" }));

    const result = await progressCapturedCheckoutAttempt(attemptId);
    expect(result.outcome).toBe("failed");
    expect(vi.mocked(captureAuthorization)).not.toHaveBeenCalled();

    const attempt = await prisma.checkoutAttempt.findUniqueOrThrow({ where: { id: attemptId }, include: { ticketHolds: true } });
    expect(attempt.status).toBe("failed");
    expect(attempt.bookingId).toBeNull();
    expect(attempt.ticketHolds.every((h) => h.status === "released")).toBe(true);
  });
});

describe("M — a local DB failure during finalization, AFTER a real capture, never re-captures on retry", () => {
  it("a persisted-traveler-count mismatch fails finalization locally; a corrected retry completes without touching Stripe again", async () => {
    const attempt = await createCheckoutAttempt({ tripId, packageType: "TICKET_ONLY", partySize: 2 });
    for (const step of ["revalidating", "ready_to_pay", "payment_authorizing", "payment_authorized"] as const) {
      await transitionCheckoutAttempt(attempt.id, step);
    }
    const ticketOffer = await prisma.ticketOffer.create({ data: { eventId, costNet: 50, currency: "EUR", stock: 10, active: true } });
    const hold = await acquireTicketHold({ checkoutAttemptId: attempt.id, ticketOfferId: ticketOffer.id, quantity: 1, expiresAt: new Date(Date.now() + 60_000) });
    if (!hold.ok) throw new Error("setup failed");
    // Deliberately only 1 persisted traveler for partySize=2.
    await prisma.checkoutAttemptTraveler.create({ data: { checkoutAttemptId: attempt.id, order: 0, firstName: "Test0", lastName: "Sandbox" } });
    await persistCheckoutAttemptBuyer(attempt.id, BUYER);
    const snapshot: FinalQuoteSnapshot = {
      ticket: [{ eventId, ticketOfferId: ticketOffer.id, category: "General", quantity: 1, costNetPerUnit: 50, currency: "EUR" }],
      hotel: null,
      flight: null,
      commercial: { costTicketNet: 50, costHotelNet: 0, costFlightNet: 0, orgFee: 10, buffer: 0, pvpTotal: 60, pvpPerPerson: 30, currency: "EUR" },
      travelersCount: 2,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 900_000).toISOString(),
    };
    await prisma.checkoutAttempt.update({
      where: { id: attempt.id },
      data: { paymentStatus: "authorized", finalQuoteSnapshot: serializeFinalQuoteSnapshot(snapshot), finalQuoteSnapshotVersion: 1, stripePaymentIntentId: "pi_m", paymentIntentQuoteVersion: 1 },
    });

    vi.mocked(getAuthorization).mockResolvedValueOnce(fakePi({ providerReference: "pi_m" }));
    vi.mocked(captureAuthorization).mockResolvedValueOnce(fakeCaptured({ providerReference: "pi_m" }));

    const failedResult = await progressCapturedCheckoutAttempt(attempt.id);
    expect(failedResult.outcome).toBe("retry"); // finalization failed locally, capture already happened

    const afterFailure = await prisma.checkoutAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
    expect(afterFailure.status).toBe("finalizing"); // never re-tries capture, never goes to failed/recovery_required
    expect(afterFailure.paymentStatus).toBe("captured"); // capture DID happen and is recorded

    // Corrected retry: persist the missing second traveler, then progress again.
    await prisma.checkoutAttemptTraveler.create({ data: { checkoutAttemptId: attempt.id, order: 1, firstName: "Test1", lastName: "Sandbox" } });
    const retried = await progressCapturedCheckoutAttempt(attempt.id);
    expect(retried.outcome).toBe("confirmed");
    // Stripe was never touched a second time on the retry.
    expect(vi.mocked(captureAuthorization)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(getAuthorization)).toHaveBeenCalledTimes(1);
  });
});

describe("N — two genuinely concurrent finalizations produce exactly one Booking", () => {
  it("Promise.all of two progressCapturedCheckoutAttempt calls from payment_capturing yields one Booking, one CONFIRMED", async () => {
    const attemptId = await buildAuthorizedAttempt();
    await prisma.checkoutAttempt.update({ where: { id: attemptId }, data: { status: "finalizing", paymentStatus: "captured" } });

    const [a, b] = await Promise.all([progressCapturedCheckoutAttempt(attemptId), progressCapturedCheckoutAttempt(attemptId)]);
    expect(a.outcome).toBe("confirmed");
    expect(b.outcome).toBe("confirmed");
    if (a.outcome === "confirmed" && b.outcome === "confirmed") {
      expect(a.bookingId).toBe(b.bookingId);
    }

    const bookingCount = a.outcome === "confirmed" ? await prisma.booking.count({ where: { id: a.bookingId } }) : -1;
    expect(bookingCount).toBe(1);
    const travelerCount = a.outcome === "confirmed" ? await prisma.traveler.count({ where: { bookingId: a.bookingId } }) : -1;
    expect(travelerCount).toBe(1); // never duplicated by the racing call
  });
});

describe("O — refresh after CAPTURED (Booking not yet created) finishes finalization", () => {
  it("calling progressCapturedCheckoutAttempt again from finalizing completes without re-touching Stripe", async () => {
    const attemptId = await buildAuthorizedAttempt();
    await prisma.checkoutAttempt.update({ where: { id: attemptId }, data: { status: "finalizing", paymentStatus: "captured" } });

    const result = await progressCapturedCheckoutAttempt(attemptId);
    expect(result.outcome).toBe("confirmed");
    expect(vi.mocked(getAuthorization)).not.toHaveBeenCalled();
    expect(vi.mocked(captureAuthorization)).not.toHaveBeenCalled();
  });
});

describe("P — the Booking's priceBreakdownSnapshot matches what Mi Viaje actually reads", () => {
  it("perPerson/total/ticketSelections are present and correct, not FinalQuoteSnapshot.commercial verbatim", async () => {
    const attemptId = await buildAuthorizedAttempt();
    vi.mocked(getAuthorization).mockResolvedValueOnce(fakePi({}));
    vi.mocked(captureAuthorization).mockResolvedValueOnce(fakeCaptured());

    const result = await progressCapturedCheckoutAttempt(attemptId);
    expect(result.outcome).toBe("confirmed");
    if (result.outcome !== "confirmed") return;

    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: result.bookingId } });
    const parsed = JSON.parse(booking.priceBreakdownSnapshot);
    expect(parsed.perPerson).toBe(60);
    expect(parsed.total).toBe(60);
    expect(parsed.ticketSelections[eventId]).toBe("General");
  });
});

describe("T — cancelling an authorized-but-not-captured payment releases the hold", () => {
  it("cancelAuthorizedPayment voids the PaymentIntent, transitions to CANCELLED, releases the hold", async () => {
    const attemptId = await buildAuthorizedAttempt();
    vi.mocked(getAuthorization).mockResolvedValueOnce(fakePi({}));
    vi.mocked(cancelAuthorization).mockResolvedValueOnce(fakePi({ status: "voided", rawStatus: "canceled" }));

    const result = await cancelAuthorizedPayment(attemptId);
    expect(result.ok).toBe(true);

    const attempt = await prisma.checkoutAttempt.findUniqueOrThrow({ where: { id: attemptId }, include: { ticketHolds: true } });
    expect(attempt.status).toBe("cancelled");
    expect(attempt.paymentStatus).toBe("voided");
    expect(attempt.ticketHolds.every((h) => h.status === "released")).toBe(true);
    expect(vi.mocked(captureAuthorization)).not.toHaveBeenCalled(); // never captured — nothing to refund
  });

  it("is idempotent: cancelling an already-cancelled attempt is a safe no-op", async () => {
    const attemptId = await buildAuthorizedAttempt();
    vi.mocked(getAuthorization).mockResolvedValueOnce(fakePi({}));
    vi.mocked(cancelAuthorization).mockResolvedValueOnce(fakePi({ status: "voided", rawStatus: "canceled" }));
    await cancelAuthorizedPayment(attemptId);

    const second = await cancelAuthorizedPayment(attemptId);
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.alreadyCancelled).toBe(true);
    expect(vi.mocked(cancelAuthorization)).toHaveBeenCalledTimes(1); // never called twice
  });
});

// Fase 3B.2 — TICKET_HOTEL is no longer unconditionally blocked here: a
// reversible, auto-bookable hotel now progresses through a real Nuitee
// SANDBOX BOOK before capture (see hotelFulfillment.ts and its own
// dedicated test file, checkout-hotel-fulfillment.test.ts). The
// TICKET_HOTEL_FLIGHT barrier below is unchanged — flight fulfillment
// still doesn't exist.
describe("V — TICKET_HOTEL_FLIGHT can never capture in this phase", () => {
  it("V — TICKET_HOTEL_FLIGHT stays blocked at PAYMENT_AUTHORIZED, no capture attempted", async () => {
    const attemptId = await buildAuthorizedAttempt({ packageType: "TICKET_HOTEL_FLIGHT" });
    const result = await progressCapturedCheckoutAttempt(attemptId);
    expect(result.outcome).toBe("blocked");
    expect(vi.mocked(captureAuthorization)).not.toHaveBeenCalled();

    const attempt = await prisma.checkoutAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    expect(attempt.status).toBe("payment_authorized");
  });

  it("createPaymentAuthorization itself refuses to authorize a NEW payment for TICKET_HOTEL", async () => {
    const attempt = await createCheckoutAttempt({ tripId, packageType: "TICKET_HOTEL", partySize: 1 });
    for (const step of ["revalidating", "ready_to_pay"] as const) {
      await transitionCheckoutAttempt(attempt.id, step);
    }
    await prisma.checkoutAttempt.update({
      where: { id: attempt.id },
      data: {
        finalQuoteSnapshot: serializeFinalQuoteSnapshot({
          ticket: [{ eventId, ticketOfferId: "offer_placeholder", category: "General", quantity: 1, costNetPerUnit: 50, currency: "EUR" }],
          hotel: null,
          flight: null,
          commercial: { costTicketNet: 50, costHotelNet: 0, costFlightNet: 0, orgFee: 10, buffer: 0, pvpTotal: 60, pvpPerPerson: 60, currency: "EUR" },
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
