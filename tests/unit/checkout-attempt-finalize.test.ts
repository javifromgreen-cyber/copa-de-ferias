import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { createCheckoutAttempt } from "@/lib/checkout-saga/createCheckoutAttempt";
import { acquireTicketHold } from "@/lib/checkout-saga/ticketHold";
import { transitionCheckoutAttempt } from "@/lib/checkout-saga/transitions";
import { finalizeConfirmedCheckoutAttempt, type FinalizeInput } from "@/lib/checkout-saga/finalize";
import { serializeFinalQuoteSnapshot, type FinalQuoteSnapshot } from "@/lib/checkout-saga/finalQuoteSnapshot";

const RUN_ID = `finalizetest-${Date.now()}`;
let tripId: string;
let eventId: string;

beforeAll(async () => {
  const trip = await prisma.trip.create({
    data: { number: 900003, slug: RUN_ID, name: "Test Trip", subtitle: "Test", city: "Test", country: "Test", homeTeam: "A", awayTeam: "B", stadium: "Test", matchDate: new Date(), price: 100, travelMode: "A_TU_AIRE", isDemo: true },
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

function snapshot(overrides: Partial<FinalQuoteSnapshot> = {}): FinalQuoteSnapshot {
  const now = new Date();
  return {
    ticket: [{ eventId, ticketOfferId: "offer_placeholder", category: "General", quantity: 1, costNetPerUnit: 50, currency: "EUR" }],
    hotel: null,
    flight: null,
    commercial: { costTicketNet: 50, costHotelNet: 0, costFlightNet: 0, orgFee: 49, buffer: 0, pvpTotal: 99, pvpPerPerson: 99, currency: "EUR" },
    travelersCount: 1,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 3_600_000).toISOString(),
    ...overrides,
  };
}

const BUYER: FinalizeInput["buyer"] = { buyerFirstName: "Test", buyerLastName: "Sandbox", buyerEmail: "test.sandbox@example.com", buyerPhone: "+34600000000", paymentProvider: "demo" };
const ONE_TRAVELER: FinalizeInput["travelers"] = [{ firstName: "Test", lastName: "Sandbox" }];

/** Walks a fresh attempt through the real transition graph up to (but not through) FINALIZING, with a HELD ticket hold and a snapshot in place — mirrors what a real orchestrator would have done by that point. */
async function buildAttemptReadyToFinalize(opts: { partySize?: number; paymentStatus?: "captured" | "authorized"; withHeldHold?: boolean; withSnapshot?: boolean } = {}) {
  const { partySize = 1, paymentStatus = "captured", withHeldHold = true, withSnapshot = true } = opts;
  const attempt = await createCheckoutAttempt({ tripId, packageType: "TICKET_ONLY", partySize });
  for (const step of ["revalidating", "ready_to_pay", "payment_authorizing", "payment_authorized", "fulfilling", "payment_capturing", "finalizing"] as const) {
    await transitionCheckoutAttempt(attempt.id, step);
  }

  const ticketOffer = await prisma.ticketOffer.create({ data: { eventId, costNet: 50, currency: "EUR", stock: 10, active: true } });

  if (withHeldHold) {
    const hold = await acquireTicketHold({ checkoutAttemptId: attempt.id, ticketOfferId: ticketOffer.id, quantity: 1, expiresAt: new Date(Date.now() + 60_000) });
    if (!hold.ok) throw new Error("test setup: hold failed");
  }

  await prisma.checkoutAttempt.update({
    where: { id: attempt.id },
    data: {
      paymentStatus,
      finalQuoteSnapshot: withSnapshot ? serializeFinalQuoteSnapshot(snapshot({ ticket: [{ eventId, ticketOfferId: ticketOffer.id, category: "General", quantity: 1, costNetPerUnit: 50, currency: "EUR" }] })) : "",
    },
  });

  return attempt.id;
}

describe("K — finalization rejected when payment is not CAPTURED", () => {
  it("refuses and makes no writes", async () => {
    const attemptId = await buildAttemptReadyToFinalize({ paymentStatus: "authorized" });
    const result = await finalizeConfirmedCheckoutAttempt(attemptId, { buyer: BUYER, travelers: ONE_TRAVELER });
    expect(result.ok).toBe(false);
    const attempt = await prisma.checkoutAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    expect(attempt.status).toBe("finalizing");
    expect(attempt.bookingId).toBeNull();
  });
});

describe("L — finalization rejected when a required external component isn't CONFIRMED", () => {
  it("refuses when hotelStatus is set but not confirmed", async () => {
    const attemptId = await buildAttemptReadyToFinalize();
    await prisma.checkoutAttempt.update({ where: { id: attemptId }, data: { hotelStatus: "booking" } });
    const result = await finalizeConfirmedCheckoutAttempt(attemptId, { buyer: BUYER, travelers: ONE_TRAVELER });
    expect(result.ok).toBe(false);
    const attempt = await prisma.checkoutAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    expect(attempt.bookingId).toBeNull();
  });

  it("refuses when flightStatus is set but not confirmed", async () => {
    const attemptId = await buildAttemptReadyToFinalize();
    await prisma.checkoutAttempt.update({ where: { id: attemptId }, data: { flightStatus: "unknown" } });
    const result = await finalizeConfirmedCheckoutAttempt(attemptId, { buyer: BUYER, travelers: ONE_TRAVELER });
    expect(result.ok).toBe(false);
    const attempt = await prisma.checkoutAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    expect(attempt.bookingId).toBeNull();
  });

  it("refuses when there is no HELD ticket hold to confirm", async () => {
    const attemptId = await buildAttemptReadyToFinalize({ withHeldHold: false });
    const result = await finalizeConfirmedCheckoutAttempt(attemptId, { buyer: BUYER, travelers: ONE_TRAVELER });
    expect(result.ok).toBe(false);
  });

  it("refuses when no FinalQuoteSnapshot exists", async () => {
    const attemptId = await buildAttemptReadyToFinalize({ withSnapshot: false });
    const result = await finalizeConfirmedCheckoutAttempt(attemptId, { buyer: BUYER, travelers: ONE_TRAVELER });
    expect(result.ok).toBe(false);
  });
});

describe("M — valid finalization", () => {
  it("confirms the TicketHold, creates a Booking, and transitions the attempt to CONFIRMED", async () => {
    const attemptId = await buildAttemptReadyToFinalize();
    const result = await finalizeConfirmedCheckoutAttempt(attemptId, { buyer: BUYER, travelers: ONE_TRAVELER });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const attempt = await prisma.checkoutAttempt.findUniqueOrThrow({ where: { id: attemptId }, include: { ticketHolds: true } });
    expect(attempt.status).toBe("confirmed");
    expect(attempt.bookingId).toBe(result.bookingId);
    expect(attempt.ticketHolds.every((h) => h.status === "confirmed")).toBe(true);

    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: result.bookingId }, include: { travelers: true } });
    expect(booking.reference).toBe(result.reference);
    expect(booking.accessToken).toBe(result.accessToken);
    expect(booking.bookingStatus).toBe("confirmed");
    expect(booking.paymentStatus).toBe("paid");
    expect(booking.travelers).toHaveLength(1);
  });
});

describe("N — finalization called twice is idempotent: exactly one Booking, same result", () => {
  it("second call returns the same booking, no duplicate created", async () => {
    const attemptId = await buildAttemptReadyToFinalize();
    const first = await finalizeConfirmedCheckoutAttempt(attemptId, { buyer: BUYER, travelers: ONE_TRAVELER });
    const second = await finalizeConfirmedCheckoutAttempt(attemptId, { buyer: BUYER, travelers: ONE_TRAVELER });
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.alreadyFinalized).toBe(true);
      expect(second.bookingId).toBe(first.bookingId);
      expect(second.reference).toBe(first.reference);
    }
    const bookingCount = await prisma.booking.count({ where: { id: first.ok ? first.bookingId : undefined } });
    expect(bookingCount).toBe(1);
    if (first.ok) {
      const travelerCount = await prisma.traveler.count({ where: { bookingId: first.bookingId } });
      expect(travelerCount).toBe(1); // never duplicated by the second call
    }
  });
});

describe("O — a local failure during finalization never triggers external compensation and is safely retryable", () => {
  it("a traveler-count mismatch rolls back cleanly, leaves the attempt in FINALIZING, and a corrected retry then succeeds", async () => {
    const attemptId = await buildAttemptReadyToFinalize({ partySize: 2 });

    const failed = await finalizeConfirmedCheckoutAttempt(attemptId, { buyer: BUYER, travelers: ONE_TRAVELER /* only 1, but partySize is 2 */ });
    expect(failed.ok).toBe(false);

    const afterFailure = await prisma.checkoutAttempt.findUniqueOrThrow({ where: { id: attemptId }, include: { ticketHolds: true } });
    expect(afterFailure.status).toBe("finalizing"); // never auto-moved to failed/recovery_required
    expect(afterFailure.bookingId).toBeNull();
    expect(afterFailure.ticketHolds.every((h) => h.status === "held")).toBe(true); // never confirmed by the rolled-back attempt

    const failureEvents = await prisma.checkoutAttemptEvent.findMany({ where: { checkoutAttemptId: attemptId, type: "finalization_failed" } });
    expect(failureEvents).toHaveLength(1);

    const retried = await finalizeConfirmedCheckoutAttempt(attemptId, { buyer: BUYER, travelers: [{ firstName: "Test", lastName: "One" }, { firstName: "Test", lastName: "Two" }] });
    expect(retried.ok).toBe(true);
    if (retried.ok) {
      const booking = await prisma.booking.findUniqueOrThrow({ where: { id: retried.bookingId }, include: { travelers: true } });
      expect(booking.travelers).toHaveLength(2);
    }
  });
});
