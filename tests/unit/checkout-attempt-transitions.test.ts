import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { isValidGlobalTransition, assertGlobalTransition, transitionCheckoutAttempt, CheckoutSagaTransitionError } from "@/lib/checkout-saga/transitions";
import { createCheckoutAttempt } from "@/lib/checkout-saga/createCheckoutAttempt";
import type { CheckoutAttemptStatus } from "@prisma/client";

const RUN_ID = `transtest-${Date.now()}`;
let tripId: string;

beforeAll(async () => {
  const trip = await prisma.trip.create({
    data: { number: 900001, slug: RUN_ID, name: "Test Trip", subtitle: "Test", city: "Test", country: "Test", homeTeam: "A", awayTeam: "B", stadium: "Test", matchDate: new Date(), price: 100, travelMode: "A_TU_AIRE", isDemo: true },
  });
  tripId = trip.id;
});

afterAll(async () => {
  await prisma.checkoutAttempt.deleteMany({ where: { tripId } });
  await prisma.trip.delete({ where: { id: tripId } });
  await prisma.$disconnect();
});

async function newAttempt() {
  return createCheckoutAttempt({ tripId, packageType: "TICKET_ONLY", partySize: 1 });
}

// --- A. Valid global transitions ------------------------------------------
describe("A — valid global transitions", () => {
  const validPairs: [CheckoutAttemptStatus, CheckoutAttemptStatus][] = [
    ["draft", "revalidating"],
    ["draft", "cancelled"],
    ["revalidating", "ready_to_pay"],
    ["revalidating", "failed"],
    ["revalidating", "cancelled"],
    ["ready_to_pay", "payment_authorizing"],
    ["ready_to_pay", "revalidating"],
    ["ready_to_pay", "cancelled"],
    ["payment_authorizing", "payment_authorized"],
    ["payment_authorizing", "failed"],
    ["payment_authorized", "fulfilling"],
    ["fulfilling", "payment_capturing"],
    ["fulfilling", "compensating"],
    ["payment_capturing", "finalizing"],
    ["payment_capturing", "recovery_required"],
    ["finalizing", "confirmed"],
    ["finalizing", "recovery_required"],
    ["compensating", "failed"],
    ["compensating", "recovery_required"],
    ["recovery_required", "confirmed"],
    ["recovery_required", "failed"],
    ["recovery_required", "cancelled"],
  ];

  for (const [from, to] of validPairs) {
    it(`${from} -> ${to} is allowed`, () => {
      expect(isValidGlobalTransition(from, to)).toBe(true);
      expect(() => assertGlobalTransition(from, to)).not.toThrow();
    });
  }

  it("transitionCheckoutAttempt actually persists the new status and records a state_changed event", async () => {
    const attempt = await newAttempt();
    const updated = await transitionCheckoutAttempt(attempt.id, "revalidating");
    expect(updated.status).toBe("revalidating");
    const fresh = await prisma.checkoutAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
    expect(fresh.status).toBe("revalidating");
    const events = await prisma.checkoutAttemptEvent.findMany({ where: { checkoutAttemptId: attempt.id, type: "state_changed" } });
    expect(events).toHaveLength(1);
    expect(JSON.parse(events[0].sanitizedDetail)).toEqual({ from: "draft", to: "revalidating" });
  });
});

// --- B. Invalid global transitions ------------------------------------------
describe("B — invalid global transitions", () => {
  const invalidPairs: [CheckoutAttemptStatus, CheckoutAttemptStatus][] = [
    ["draft", "confirmed"],
    ["draft", "fulfilling"],
    ["draft", "payment_authorized"],
    ["revalidating", "confirmed"],
    ["revalidating", "payment_authorized"],
    ["ready_to_pay", "fulfilling"],
    ["ready_to_pay", "confirmed"],
    ["payment_authorizing", "fulfilling"],
    ["payment_authorized", "payment_capturing"],
    ["fulfilling", "confirmed"],
    ["payment_capturing", "confirmed"],
    ["finalizing", "fulfilling"],
    ["confirmed", "fulfilling"],
    ["confirmed", "failed"],
    ["failed", "confirmed"],
    ["failed", "revalidating"],
    ["cancelled", "revalidating"],
    ["cancelled", "confirmed"],
  ];

  for (const [from, to] of invalidPairs) {
    it(`${from} -> ${to} is rejected`, () => {
      expect(isValidGlobalTransition(from, to)).toBe(false);
      expect(() => assertGlobalTransition(from, to)).toThrow(CheckoutSagaTransitionError);
    });
  }

  // The exact 4 examples named explicitly in the brief.
  it("CONFIRMED -> FULFILLING is prohibited", () => expect(isValidGlobalTransition("confirmed", "fulfilling")).toBe(false));
  it("FAILED -> PAYMENT_AUTHORIZED is prohibited", () => expect(isValidGlobalTransition("failed", "payment_authorized")).toBe(false));
  it("PAYMENT_AUTHORIZED -> READY_TO_PAY is prohibited", () => expect(isValidGlobalTransition("payment_authorized", "ready_to_pay")).toBe(false));
  it("FINALIZING -> PAYMENT_AUTHORIZING is prohibited", () => expect(isValidGlobalTransition("finalizing", "payment_authorizing")).toBe(false));

  it("transitionCheckoutAttempt throws and never writes on an invalid transition", async () => {
    const attempt = await newAttempt(); // draft
    await expect(transitionCheckoutAttempt(attempt.id, "confirmed")).rejects.toThrow(CheckoutSagaTransitionError);
    const fresh = await prisma.checkoutAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
    expect(fresh.status).toBe("draft");
  });

  it("terminal states (confirmed/failed/cancelled) have no outgoing transitions at all", () => {
    for (const terminal of ["confirmed", "failed", "cancelled"] as const) {
      for (const to of ["draft", "revalidating", "ready_to_pay", "payment_authorizing", "payment_authorized", "fulfilling", "payment_capturing", "finalizing", "compensating", "recovery_required"] as const) {
        expect(isValidGlobalTransition(terminal, to)).toBe(false);
      }
    }
  });
});
