import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { createCheckoutAttempt } from "@/lib/checkout-saga/createCheckoutAttempt";
import { acquireTicketHold, releaseExpiredTicketHolds } from "@/lib/checkout-saga/ticketHold";
import { transitionCheckoutAttempt } from "@/lib/checkout-saga/transitions";
import type { CheckoutAttemptStatus } from "@prisma/client";

const RUN_ID = `holdtest-${Date.now()}`;
let tripId: string;
let eventId: string;

async function createTicketOffer(stock: number) {
  const offer = await prisma.ticketOffer.create({ data: { eventId, costNet: 50, currency: "EUR", stock, active: true } });
  return offer.id;
}

async function createAttempt() {
  return createCheckoutAttempt({ tripId, packageType: "TICKET_ONLY", partySize: 1 });
}

beforeAll(async () => {
  const trip = await prisma.trip.create({
    data: { number: 900002, slug: RUN_ID, name: "Test Trip", subtitle: "Test", city: "Test", country: "Test", homeTeam: "A", awayTeam: "B", stadium: "Test", matchDate: new Date(), price: 100, travelMode: "A_TU_AIRE", isDemo: true },
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

describe("C/D — acquireTicketHold: creation + idempotency", () => {
  it("creates a HELD hold when stock is available", async () => {
    const ticketOfferId = await createTicketOffer(5);
    const attempt = await createAttempt();
    const result = await acquireTicketHold({ checkoutAttemptId: attempt.id, ticketOfferId, quantity: 1, expiresAt: new Date(Date.now() + 60_000) });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.hold.status).toBe("held");
  });

  it("is idempotent for the same (checkoutAttemptId, ticketOfferId) — calling twice returns the same hold, never a duplicate", async () => {
    const ticketOfferId = await createTicketOffer(5);
    const attempt = await createAttempt();
    const first = await acquireTicketHold({ checkoutAttemptId: attempt.id, ticketOfferId, quantity: 1, expiresAt: new Date(Date.now() + 60_000) });
    const second = await acquireTicketHold({ checkoutAttemptId: attempt.id, ticketOfferId, quantity: 1, expiresAt: new Date(Date.now() + 60_000) });
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) expect(first.hold.id).toBe(second.hold.id);
    const count = await prisma.ticketHold.count({ where: { checkoutAttemptId: attempt.id, ticketOfferId } });
    expect(count).toBe(1);
  });
});

describe("E — insufficient stock", () => {
  it("refuses to create a hold when requested quantity exceeds real availability", async () => {
    const ticketOfferId = await createTicketOffer(1);
    const attemptA = await createAttempt();
    const attemptB = await createAttempt();
    const first = await acquireTicketHold({ checkoutAttemptId: attemptA.id, ticketOfferId, quantity: 1, expiresAt: new Date(Date.now() + 60_000) });
    expect(first.ok).toBe(true);
    const second = await acquireTicketHold({ checkoutAttemptId: attemptB.id, ticketOfferId, quantity: 1, expiresAt: new Date(Date.now() + 60_000) });
    expect(second).toEqual({ ok: false, reason: "insufficient_stock" });
  });

  it("accounts for CONFIRMED holds (real sales) as consumed stock, not just HELD ones", async () => {
    const ticketOfferId = await createTicketOffer(1);
    const attemptA = await createAttempt();
    const first = await acquireTicketHold({ checkoutAttemptId: attemptA.id, ticketOfferId, quantity: 1, expiresAt: new Date(Date.now() + 60_000) });
    expect(first.ok).toBe(true);
    if (first.ok) await prisma.ticketHold.update({ where: { id: first.hold.id }, data: { status: "confirmed" } });

    const attemptB = await createAttempt();
    const second = await acquireTicketHold({ checkoutAttemptId: attemptB.id, ticketOfferId, quantity: 1, expiresAt: new Date(Date.now() + 60_000) });
    expect(second).toEqual({ ok: false, reason: "insufficient_stock" });
  });
});

describe("F — two attempts competing for the last unit of stock (REAL PostgreSQL concurrency, no mocking)", () => {
  it("stock=1 + two genuinely concurrent acquireTicketHold calls -> exactly one HELD, the other insufficient_stock", async () => {
    // This runs against a real Postgres connection (see prisma/schema.prisma
    // and .env's DATABASE_URL) — the two acquireTicketHold calls below
    // truly race at the database level via Promise.all, and correctness
    // here depends on acquireTicketHold's own `SELECT ... FOR UPDATE`
    // transaction (ticketHold.ts), not on any test-level mocking or
    // artificial serialization.
    const ticketOfferId = await createTicketOffer(1);
    const attemptA = await createAttempt();
    const attemptB = await createAttempt();

    const [resultA, resultB] = await Promise.all([
      acquireTicketHold({ checkoutAttemptId: attemptA.id, ticketOfferId, quantity: 1, expiresAt: new Date(Date.now() + 60_000) }),
      acquireTicketHold({ checkoutAttemptId: attemptB.id, ticketOfferId, quantity: 1, expiresAt: new Date(Date.now() + 60_000) }),
    ]);

    const results = [resultA, resultB];
    const succeeded = results.filter((r) => r.ok);
    const failed = results.filter((r) => !r.ok);
    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(failed[0]).toEqual({ ok: false, reason: "insufficient_stock" });

    const totalHeld = await prisma.ticketHold.aggregate({ where: { ticketOfferId, status: "held" }, _sum: { quantity: true } });
    expect(totalHeld._sum.quantity).toBe(1);
  });
});

describe("G/H/I/J — releaseExpiredTicketHolds respects the saga's own state, never a bare expiresAt check", () => {
  const PAST = new Date(Date.now() - 60_000);

  async function createExpiredHeldHoldFor(status: CheckoutAttemptStatus) {
    const ticketOfferId = await createTicketOffer(5);
    const attempt = await createAttempt();
    if (status !== "draft") {
      // Walk through the real transition graph rather than writing status directly.
      const path: Record<Exclude<CheckoutAttemptStatus, "draft">, CheckoutAttemptStatus[]> = {
        revalidating: ["revalidating"],
        ready_to_pay: ["revalidating", "ready_to_pay"],
        payment_authorizing: ["revalidating", "ready_to_pay", "payment_authorizing"],
        payment_authorized: ["revalidating", "ready_to_pay", "payment_authorizing", "payment_authorized"],
        fulfilling: ["revalidating", "ready_to_pay", "payment_authorizing", "payment_authorized", "fulfilling"],
        payment_capturing: ["revalidating", "ready_to_pay", "payment_authorizing", "payment_authorized", "fulfilling", "payment_capturing"],
        finalizing: ["revalidating", "ready_to_pay", "payment_authorizing", "payment_authorized", "fulfilling", "payment_capturing", "finalizing"],
        recovery_required: ["revalidating", "ready_to_pay", "payment_authorizing", "payment_authorized", "fulfilling", "payment_capturing", "recovery_required"],
        confirmed: ["revalidating", "ready_to_pay", "payment_authorizing", "payment_authorized", "fulfilling", "payment_capturing", "finalizing", "confirmed"],
        failed: ["revalidating", "failed"],
        cancelled: ["cancelled"],
        compensating: ["revalidating", "ready_to_pay", "payment_authorizing", "payment_authorized", "fulfilling", "compensating"],
      };
      for (const step of path[status]) {
        await transitionCheckoutAttempt(attempt.id, step);
      }
    }
    const holdResult = await acquireTicketHold({ checkoutAttemptId: attempt.id, ticketOfferId, quantity: 1, expiresAt: PAST });
    if (!holdResult.ok) throw new Error("test setup failed to acquire hold");
    return { attemptId: attempt.id, holdId: holdResult.hold.id };
  }

  it("G — READY_TO_PAY + expired -> released", async () => {
    const { holdId } = await createExpiredHeldHoldFor("ready_to_pay");
    await releaseExpiredTicketHolds(new Date());
    const hold = await prisma.ticketHold.findUniqueOrThrow({ where: { id: holdId } });
    expect(hold.status).toBe("expired");
  });

  it("H — PAYMENT_AUTHORIZED + expired -> NOT released", async () => {
    const { holdId } = await createExpiredHeldHoldFor("payment_authorized");
    await releaseExpiredTicketHolds(new Date());
    const hold = await prisma.ticketHold.findUniqueOrThrow({ where: { id: holdId } });
    expect(hold.status).toBe("held");
  });

  it("I — FULFILLING + expired -> NOT released", async () => {
    const { holdId } = await createExpiredHeldHoldFor("fulfilling");
    await releaseExpiredTicketHolds(new Date());
    const hold = await prisma.ticketHold.findUniqueOrThrow({ where: { id: holdId } });
    expect(hold.status).toBe("held");
  });

  it("J — RECOVERY_REQUIRED + expired -> NOT released", async () => {
    const { holdId } = await createExpiredHeldHoldFor("recovery_required");
    await releaseExpiredTicketHolds(new Date());
    const hold = await prisma.ticketHold.findUniqueOrThrow({ where: { id: holdId } });
    expect(hold.status).toBe("held");
  });

  it("also never releases while PAYMENT_AUTHORIZING, PAYMENT_CAPTURING, FINALIZING or COMPENSATING", async () => {
    for (const status of ["payment_authorizing", "payment_capturing", "finalizing", "compensating"] as const) {
      const { holdId } = await createExpiredHeldHoldFor(status);
      await releaseExpiredTicketHolds(new Date());
      const hold = await prisma.ticketHold.findUniqueOrThrow({ where: { id: holdId } });
      expect(hold.status).toBe("held");
    }
  });
});
