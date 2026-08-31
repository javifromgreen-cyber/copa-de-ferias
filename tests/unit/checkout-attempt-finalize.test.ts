import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { createCheckoutAttempt } from "@/lib/checkout-saga/createCheckoutAttempt";
import { acquireTicketHold } from "@/lib/checkout-saga/ticketHold";
import { transitionCheckoutAttempt } from "@/lib/checkout-saga/transitions";
import { finalizeConfirmedCheckoutAttempt } from "@/lib/checkout-saga/finalize";
import { persistCheckoutAttemptBuyer, type CheckoutAttemptBuyerInput } from "@/lib/checkout-saga/checkoutAttemptBuyer";
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

const BUYER: CheckoutAttemptBuyerInput = { firstName: "Test", lastName: "Sandbox", email: "test.sandbox@example.com", phone: "+34600000000" };

/** Fase 2 §6/§26 — travelers now come exclusively from CheckoutAttemptTraveler, never supplied to finalize(). */
async function persistTravelers(checkoutAttemptId: string, names: { firstName: string; lastName: string }[]) {
  await prisma.checkoutAttemptTraveler.createMany({
    data: names.map((n, index) => ({ checkoutAttemptId, order: index, firstName: n.firstName, lastName: n.lastName })),
  });
}

/**
 * Walks a fresh attempt through the real transition graph up to (but not
 * through) FINALIZING, with a HELD ticket hold, a persisted buyer (Fase
 * 2.5 §5/§6 — mirrors what prepareCheckoutAttempt does in REVALIDATING),
 * and a snapshot in place — mirrors what a real orchestrator would have
 * done by that point.
 */
async function buildAttemptReadyToFinalize(
  opts: { partySize?: number; paymentStatus?: "captured" | "authorized"; withHeldHold?: boolean; withSnapshot?: boolean; withBuyer?: boolean; travelerCount?: number } = {},
) {
  const { partySize = 1, paymentStatus = "captured", withHeldHold = true, withSnapshot = true, withBuyer = true, travelerCount = partySize } = opts;
  const attempt = await createCheckoutAttempt({ tripId, packageType: "TICKET_ONLY", partySize });
  for (const step of ["revalidating", "ready_to_pay", "payment_authorizing", "payment_authorized", "fulfilling", "payment_capturing", "finalizing"] as const) {
    await transitionCheckoutAttempt(attempt.id, step);
  }

  const ticketOffer = await prisma.ticketOffer.create({ data: { eventId, costNet: 50, currency: "EUR", stock: 10, active: true } });

  if (withHeldHold) {
    const hold = await acquireTicketHold({ checkoutAttemptId: attempt.id, ticketOfferId: ticketOffer.id, quantity: 1, expiresAt: new Date(Date.now() + 60_000) });
    if (!hold.ok) throw new Error("test setup: hold failed");
  }

  if (travelerCount > 0) {
    await persistTravelers(
      attempt.id,
      Array.from({ length: travelerCount }, (_, i) => ({ firstName: `Test${i}`, lastName: "Sandbox" })),
    );
  }

  if (withBuyer) {
    await persistCheckoutAttemptBuyer(attempt.id, BUYER);
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
    const result = await finalizeConfirmedCheckoutAttempt(attemptId);
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
    const result = await finalizeConfirmedCheckoutAttempt(attemptId);
    expect(result.ok).toBe(false);
    const attempt = await prisma.checkoutAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    expect(attempt.bookingId).toBeNull();
  });

  it("refuses when flightStatus is set but not confirmed", async () => {
    const attemptId = await buildAttemptReadyToFinalize();
    await prisma.checkoutAttempt.update({ where: { id: attemptId }, data: { flightStatus: "unknown" } });
    const result = await finalizeConfirmedCheckoutAttempt(attemptId);
    expect(result.ok).toBe(false);
    const attempt = await prisma.checkoutAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    expect(attempt.bookingId).toBeNull();
  });

  it("refuses when there is no HELD ticket hold to confirm", async () => {
    const attemptId = await buildAttemptReadyToFinalize({ withHeldHold: false });
    const result = await finalizeConfirmedCheckoutAttempt(attemptId);
    expect(result.ok).toBe(false);
  });

  it("refuses when no FinalQuoteSnapshot exists", async () => {
    const attemptId = await buildAttemptReadyToFinalize({ withSnapshot: false });
    const result = await finalizeConfirmedCheckoutAttempt(attemptId);
    expect(result.ok).toBe(false);
  });
});

describe("M — valid finalization", () => {
  it("confirms the TicketHold, creates a Booking, and transitions the attempt to CONFIRMED", async () => {
    const attemptId = await buildAttemptReadyToFinalize();
    const result = await finalizeConfirmedCheckoutAttempt(attemptId);
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
    // §5/§6 — buyer fields on the Booking come from the persisted
    // CheckoutAttempt buyer, never from any argument to finalize().
    expect(booking.buyerFirstName).toBe(BUYER.firstName);
    expect(booking.buyerLastName).toBe(BUYER.lastName);
    expect(booking.buyerEmail).toBe(BUYER.email);
    expect(booking.buyerPhone).toBe(BUYER.phone);
  });
});

describe("N — finalization called twice is idempotent: exactly one Booking, same result", () => {
  it("second call returns the same booking, no duplicate created", async () => {
    const attemptId = await buildAttemptReadyToFinalize();
    const first = await finalizeConfirmedCheckoutAttempt(attemptId);
    const second = await finalizeConfirmedCheckoutAttempt(attemptId);
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
  it("a persisted-traveler-count mismatch rolls back cleanly, leaves the attempt in FINALIZING, and a corrected retry then succeeds", async () => {
    // partySize=2, but only 1 CheckoutAttemptTraveler row exists yet.
    const attemptId = await buildAttemptReadyToFinalize({ partySize: 2, travelerCount: 1 });

    const failed = await finalizeConfirmedCheckoutAttempt(attemptId);
    expect(failed.ok).toBe(false);

    const afterFailure = await prisma.checkoutAttempt.findUniqueOrThrow({ where: { id: attemptId }, include: { ticketHolds: true } });
    expect(afterFailure.status).toBe("finalizing"); // never auto-moved to failed/recovery_required
    expect(afterFailure.bookingId).toBeNull();
    expect(afterFailure.ticketHolds.every((h) => h.status === "held")).toBe(true); // never confirmed by the rolled-back attempt

    const failureEvents = await prisma.checkoutAttemptEvent.findMany({ where: { checkoutAttemptId: attemptId, type: "finalization_failed" } });
    expect(failureEvents).toHaveLength(1);

    // Corrected retry: persist the missing second traveler, then retry with no new input other than buyer.
    await prisma.checkoutAttemptTraveler.create({ data: { checkoutAttemptId: attemptId, order: 1, firstName: "Test1", lastName: "Sandbox" } });
    const retried = await finalizeConfirmedCheckoutAttempt(attemptId);
    expect(retried.ok).toBe(true);
    if (retried.ok) {
      const booking = await prisma.booking.findUniqueOrThrow({ where: { id: retried.bookingId }, include: { travelers: true } });
      expect(booking.travelers).toHaveLength(2);
    }
  });
});

describe("H — FINALIZING uses persisted CheckoutAttemptTraveler rows, never external input", () => {
  it("the resulting Booking.Traveler names come from the persisted rows, in order — finalize() takes no traveler argument at all", async () => {
    const attemptId = await buildAttemptReadyToFinalize({ partySize: 2, travelerCount: 0 });
    await persistTravelers(attemptId, [
      { firstName: "Ada", lastName: "Lovelace" },
      { firstName: "Alan", lastName: "Turing" },
    ]);

    const result = await finalizeConfirmedCheckoutAttempt(attemptId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: result.bookingId }, include: { travelers: { orderBy: { order: "asc" } } } });
    expect(booking.travelers.map((t) => `${t.firstName} ${t.lastName}`)).toEqual(["Ada Lovelace", "Alan Turing"]);
  });
});

describe("F — buyer is persisted on CheckoutAttempt before finalization, and finalize() has no way to receive a different one", () => {
  it("finalizeConfirmedCheckoutAttempt takes only a checkoutAttemptId — no second argument exists to smuggle in a substitute buyer", async () => {
    const attemptId = await buildAttemptReadyToFinalize();
    // Type-level guarantee, exercised at runtime: this call compiles with
    // exactly one argument. Fase 2.5 §6 explicitly requires the buyer be
    // unreachable from the call site — there is no `{ buyer: ... }` (or
    // any other) second parameter to pass, substitute, or omit.
    expect(finalizeConfirmedCheckoutAttempt.length).toBe(1);
    const result = await finalizeConfirmedCheckoutAttempt(attemptId);
    expect(result.ok).toBe(true);
  });
});

describe("G — a refreshed/resumed attempt still finalizes correctly from its persisted buyer", () => {
  it("re-reading the attempt from the DB (simulating a fresh request after a refresh) still finalizes with the originally persisted buyer", async () => {
    const attemptId = await buildAttemptReadyToFinalize();
    // Simulate a refresh: nothing in memory survives except the id — the
    // next call re-reads everything (including buyer) straight from the DB.
    const reloaded = await prisma.checkoutAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    expect(reloaded.buyerEmail).toBe(BUYER.email);

    const result = await finalizeConfirmedCheckoutAttempt(attemptId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: result.bookingId } });
    expect(booking.buyerEmail).toBe(BUYER.email);
  });
});

describe("I — finalization refuses when no buyer was ever persisted for the attempt", () => {
  it("refuses and makes no writes when buyer fields are still blank", async () => {
    const attemptId = await buildAttemptReadyToFinalize({ withBuyer: false });
    const result = await finalizeConfirmedCheckoutAttempt(attemptId);
    expect(result.ok).toBe(false);
    const attempt = await prisma.checkoutAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    expect(attempt.status).toBe("finalizing");
    expect(attempt.bookingId).toBeNull();
  });
});
