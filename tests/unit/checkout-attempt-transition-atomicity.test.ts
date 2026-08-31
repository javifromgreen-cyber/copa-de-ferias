import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { createCheckoutAttempt } from "@/lib/checkout-saga/createCheckoutAttempt";
import { acquireTicketHold } from "@/lib/checkout-saga/ticketHold";
import { transitionCheckoutAttempt } from "@/lib/checkout-saga/transitions";
import type { CheckoutAttemptStatus } from "@prisma/client";

// Fase 1.6 §1 — before this block, transitionCheckoutAttempt wrote
// CheckoutAttempt.status, then (separately, NOT atomically) recorded a
// state_changed event, then — for a terminal transition — released any
// HELD TicketHold. A crash between the status write and the release could
// leave CheckoutAttempt=FAILED with a TicketHold stuck HELD forever. These
// tests prove the whole sequence is now one atomic Prisma transaction.

const RUN_ID = `atomicitytest-${Date.now()}`;
let tripId: string;
let eventId: string;

async function createTicketOffer(stock: number) {
  const offer = await prisma.ticketOffer.create({ data: { eventId, costNet: 50, currency: "EUR", stock, active: true } });
  return offer.id;
}

async function createAttempt() {
  return createCheckoutAttempt({ tripId, packageType: "TICKET_ONLY", partySize: 1 });
}

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
    data: { number: 900005, slug: RUN_ID, name: "Test Trip", subtitle: "Test", city: "Test", country: "Test", homeTeam: "A", awayTeam: "B", stadium: "Test", matchDate: new Date(), price: 100, travelMode: "A_TU_AIRE", isDemo: true },
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

describe("A — normal transition to FAILED: status FAILED + hold RELEASED, both committed together", () => {
  it("both changes are visible after the call", async () => {
    const { attemptId, holdId } = await attemptWithHeldHoldAt(["revalidating", "ready_to_pay", "payment_authorizing"]);
    await transitionCheckoutAttempt(attemptId, "failed");
    const attempt = await prisma.checkoutAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    const hold = await prisma.ticketHold.findUniqueOrThrow({ where: { id: holdId } });
    expect(attempt.status).toBe("failed");
    expect(hold.status).toBe("released");
  });
});

describe("B — normal transition to CANCELLED: status CANCELLED + hold RELEASED, both committed together", () => {
  it("both changes are visible after the call", async () => {
    const { attemptId, holdId } = await attemptWithHeldHoldAt(["revalidating", "ready_to_pay"]);
    await transitionCheckoutAttempt(attemptId, "cancelled");
    const attempt = await prisma.checkoutAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    const hold = await prisma.ticketHold.findUniqueOrThrow({ where: { id: holdId } });
    expect(attempt.status).toBe("cancelled");
    expect(hold.status).toBe("released");
  });
});

describe("C — a local failure right after the transition rolls back EVERYTHING", () => {
  it("wrapping transitionCheckoutAttempt(tx) in an outer transaction that then throws leaves status AND hold completely untouched", async () => {
    const { attemptId, holdId } = await attemptWithHeldHoldAt(["revalidating", "ready_to_pay", "payment_authorizing"]);

    // Composing transitionCheckoutAttempt into a caller-owned transaction
    // (passing `tx`, exactly like finalize.ts does for "confirmed") is a
    // real, supported usage — it runs the status write + event + hold
    // release directly against that `tx`, taking no transaction of its
    // own. Throwing right after simulates "a local failure happened before
    // this was durably committed": Prisma rolls back the ENTIRE outer
    // transaction, i.e. every write transitionCheckoutAttempt just made.
    await expect(
      prisma.$transaction(async (tx) => {
        await transitionCheckoutAttempt(attemptId, "failed", tx);
        throw new Error("simulated local crash after the transition ran, before commit");
      }),
    ).rejects.toThrow("simulated local crash");

    const attempt = await prisma.checkoutAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    const hold = await prisma.ticketHold.findUniqueOrThrow({ where: { id: holdId } });
    expect(attempt.status).toBe("payment_authorizing"); // unchanged — rolled back to the PREVIOUS status
    expect(hold.status).toBe("held"); // unchanged — never released
    const failedEvents = await prisma.checkoutAttemptEvent.count({ where: { checkoutAttemptId: attemptId, type: "state_changed", sanitizedDetail: { contains: '"to":"failed"' } } });
    expect(failedEvents).toBe(0); // the state_changed event was rolled back too, not just the status column
  });
});

describe("D — a subsequent retry completes the transition correctly", () => {
  it("after the simulated crash, calling transitionCheckoutAttempt for real succeeds", async () => {
    const { attemptId, holdId } = await attemptWithHeldHoldAt(["revalidating", "ready_to_pay", "payment_authorizing"]);

    await expect(
      prisma.$transaction(async (tx) => {
        await transitionCheckoutAttempt(attemptId, "failed", tx);
        throw new Error("simulated crash");
      }),
    ).rejects.toThrow();

    // Retry — the attempt is still in its pre-crash status, so the exact
    // same transition is valid again.
    await transitionCheckoutAttempt(attemptId, "failed");

    const attempt = await prisma.checkoutAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    const hold = await prisma.ticketHold.findUniqueOrThrow({ where: { id: holdId } });
    expect(attempt.status).toBe("failed");
    expect(hold.status).toBe("released");
  });
});

describe("E — RECOVERY_REQUIRED never releases the hold, even with the new atomic wrapping", () => {
  it("hold stays HELD", async () => {
    const { attemptId, holdId } = await attemptWithHeldHoldAt(["revalidating", "ready_to_pay", "payment_authorizing", "payment_authorized", "fulfilling", "payment_capturing"]);
    await transitionCheckoutAttempt(attemptId, "recovery_required");
    const hold = await prisma.ticketHold.findUniqueOrThrow({ where: { id: holdId } });
    expect(hold.status).toBe("held");
  });
});
