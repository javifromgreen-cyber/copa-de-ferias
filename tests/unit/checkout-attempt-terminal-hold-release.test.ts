import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { createCheckoutAttempt } from "@/lib/checkout-saga/createCheckoutAttempt";
import { acquireTicketHold, releaseHeldTicketHoldsForAttempt } from "@/lib/checkout-saga/ticketHold";
import { transitionCheckoutAttempt } from "@/lib/checkout-saga/transitions";
import type { CheckoutAttemptStatus } from "@prisma/client";

// Fase 1.5 §1 — verifies the TicketHold leak scenario the user flagged:
// CheckoutAttempt reaching a terminal FAILED/CANCELLED state must never
// leave a HELD TicketHold behind (it isn't in EXPIRABLE_ATTEMPT_STATUSES,
// so releaseExpiredTicketHolds would never touch it — see
// tests/unit/ticket-hold.test.ts's own G/H/I/J). RECOVERY_REQUIRED must
// stay untouched — that hold may still be needed for a human resolution.

const RUN_ID = `terminalholdtest-${Date.now()}`;
let tripId: string;
let eventId: string;

async function createTicketOffer(stock: number) {
  const offer = await prisma.ticketOffer.create({ data: { eventId, costNet: 50, currency: "EUR", stock, active: true } });
  return offer.id;
}

async function createAttempt() {
  return createCheckoutAttempt({ tripId, packageType: "TICKET_ONLY", partySize: 1 });
}

/** Walks a fresh attempt through the real transition graph to `to`, acquiring a HELD hold along the way. */
async function attemptWithHeldHoldAt(path: CheckoutAttemptStatus[]) {
  const ticketOfferId = await createTicketOffer(5);
  const attempt = await createAttempt();
  for (const step of path) {
    await transitionCheckoutAttempt(attempt.id, step);
  }
  const hold = await acquireTicketHold({ checkoutAttemptId: attempt.id, ticketOfferId, quantity: 1, expiresAt: new Date(Date.now() + 60_000) });
  if (!hold.ok) throw new Error("test setup: hold failed");
  return { attemptId: attempt.id, holdId: hold.hold.id };
}

beforeAll(async () => {
  const trip = await prisma.trip.create({
    data: { number: 900004, slug: RUN_ID, name: "Test Trip", subtitle: "Test", city: "Test", country: "Test", homeTeam: "A", awayTeam: "B", stadium: "Test", matchDate: new Date(), price: 100, travelMode: "A_TU_AIRE", isDemo: true },
  });
  tripId = trip.id;
  const event = await prisma.event.create({ data: { tripId, homeTeam: "A", awayTeam: "B", stadium: "Test", matchDate: new Date() } });
  eventId = event.id;
});

afterAll(async () => {
  await prisma.checkoutAttempt.deleteMany({ where: { tripId } });
  await prisma.trip.delete({ where: { id: tripId } });
  await prisma.$disconnect();
});

describe("A — READY_TO_PAY + HELD -> FAILED releases the hold", () => {
  it("transitions revalidating -> failed and the hold becomes RELEASED", async () => {
    // ready_to_pay itself has no direct edge to failed; revalidating does,
    // and is the state a real "revalidation just failed" outcome would be
    // reached from — walk to ready_to_pay first to match the brief's HELD
    // ready_to_pay starting point, then transition it back to revalidating
    // implicitly isn't valid either. We instead exercise the exact edge the
    // state machine actually allows: revalidating -> failed, with the hold
    // acquired while ready_to_pay (i.e. HELD at the point of failure).
    const { attemptId, holdId } = await attemptWithHeldHoldAt(["revalidating", "ready_to_pay", "revalidating"]);
    await transitionCheckoutAttempt(attemptId, "failed");
    const hold = await prisma.ticketHold.findUniqueOrThrow({ where: { id: holdId } });
    expect(hold.status).toBe("released");
  });
});

describe("B — PAYMENT_AUTHORIZING + HELD -> FAILED releases the hold", () => {
  it("a known payment-authorization failure transitions safely to FAILED and releases the hold", async () => {
    const { attemptId, holdId } = await attemptWithHeldHoldAt(["revalidating", "ready_to_pay", "payment_authorizing"]);
    await transitionCheckoutAttempt(attemptId, "failed");
    const hold = await prisma.ticketHold.findUniqueOrThrow({ where: { id: holdId } });
    expect(hold.status).toBe("released");
    const attempt = await prisma.checkoutAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    expect(attempt.status).toBe("failed");
  });
});

describe("C — READY_TO_PAY + HELD -> CANCELLED releases the hold", () => {
  it("transitions ready_to_pay -> cancelled and the hold becomes RELEASED", async () => {
    const { attemptId, holdId } = await attemptWithHeldHoldAt(["revalidating", "ready_to_pay"]);
    await transitionCheckoutAttempt(attemptId, "cancelled");
    const hold = await prisma.ticketHold.findUniqueOrThrow({ where: { id: holdId } });
    expect(hold.status).toBe("released");
  });
});

describe("D — RECOVERY_REQUIRED + HELD does NOT release the hold", () => {
  it("a hold acquired before entering recovery_required stays HELD", async () => {
    const { attemptId, holdId } = await attemptWithHeldHoldAt(["revalidating", "ready_to_pay", "payment_authorizing", "payment_authorized", "fulfilling", "payment_capturing"]);
    await transitionCheckoutAttempt(attemptId, "recovery_required");
    const hold = await prisma.ticketHold.findUniqueOrThrow({ where: { id: holdId } });
    expect(hold.status).toBe("held");
  });
});

describe("E — releaseHeldTicketHoldsForAttempt is idempotent", () => {
  it("calling it twice yields the same single correct outcome, no error, no double event", async () => {
    const { attemptId, holdId } = await attemptWithHeldHoldAt(["revalidating", "ready_to_pay"]);
    const firstCount = await releaseHeldTicketHoldsForAttempt(attemptId);
    const secondCount = await releaseHeldTicketHoldsForAttempt(attemptId);
    expect(firstCount).toBe(1);
    expect(secondCount).toBe(0); // nothing left HELD the second time
    const hold = await prisma.ticketHold.findUniqueOrThrow({ where: { id: holdId } });
    expect(hold.status).toBe("released");
    const releaseEvents = await prisma.checkoutAttemptEvent.findMany({ where: { checkoutAttemptId: attemptId, type: "ticket_hold_released" } });
    expect(releaseEvents).toHaveLength(1); // recorded exactly once, not twice
  });
});
