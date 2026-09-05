import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";

// Fase 3A §11/§12/§13/§25 L/M — the Stripe webhook route: signature
// verification, minimal event-type handling, idempotency via
// CheckoutAttemptEvent.providerEventId. constructStripeWebhookEvent and
// the Stripe adapter are mocked; verifyAndApplyAuthorization runs for
// real against the test DB so the "one transition per event" claim is
// actually exercised, not just assumed.

vi.mock("@/lib/providers/payments/stripe/client", () => ({
  constructStripeWebhookEvent: vi.fn(),
}));
vi.mock("@/lib/providers/payments/stripe/authorization", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/providers/payments/stripe/authorization")>();
  return { ...actual, getAuthorization: vi.fn() };
});
// Fase 3B.1 — payment_intent.succeeded is routed to
// progressCapturedCheckoutAttempt (capture.ts). Mocked here so these
// tests stay focused on the ROUTE's own claim/dedup/dispatch behavior —
// capture.ts's own logic is exhaustively covered by checkout-capture.test.ts.
vi.mock("@/lib/checkout-saga/capture", () => ({ progressCapturedCheckoutAttempt: vi.fn() }));

import { constructStripeWebhookEvent } from "@/lib/providers/payments/stripe/client";
import { getAuthorization } from "@/lib/providers/payments/stripe/authorization";
import { progressCapturedCheckoutAttempt } from "@/lib/checkout-saga/capture";
import type { PaymentAuthorization } from "@/lib/providers/payments/stripe/types";

const RUN_ID = `stripe-webhook-${Date.now()}`;
let tripId: string;
let checkoutAttemptId: string;

beforeAll(async () => {
  const trip = await prisma.trip.create({
    data: {
      number: 900009,
      slug: RUN_ID,
      name: "Test",
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
  const ticketOffer = await prisma.ticketOffer.create({ data: { eventId: event.id, costNet: 50, currency: "EUR", stock: 5, active: true } });
  const attempt = await prisma.checkoutAttempt.create({
    data: {
      tripId,
      packageType: "TICKET_ONLY",
      partySize: 1,
      status: "payment_authorizing",
      paymentStatus: "authorizing",
      finalQuoteSnapshot: JSON.stringify({
        ticket: [{ eventId: event.id, ticketOfferId: ticketOffer.id, category: "General", quantity: 1, costNetPerUnit: 50, currency: "EUR" }],
        hotel: null,
        flight: null,
        commercial: { costTicketNet: 50, costHotelNet: 0, costFlightNet: 0, orgFee: 10, buffer: 0, pvpTotal: 60, pvpPerPerson: 60, currency: "EUR" },
        travelersCount: 1,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 900_000).toISOString(),
      }),
      finalQuoteSnapshotVersion: 1,
      stripePaymentIntentId: "pi_webhook_test",
      paymentIntentQuoteVersion: 1,
      accessToken: `token_${RUN_ID}`,
    },
  });
  checkoutAttemptId = attempt.id;
});

afterAll(async () => {
  await prisma.webhookEventClaim.deleteMany({ where: { id: { in: ["evt_authorize_1", "evt_succeeded_1", "evt_concurrent_1", "evt_retry_1"] } } });
  await prisma.checkoutAttemptEvent.deleteMany({ where: { checkoutAttemptId } });
  await prisma.checkoutAttempt.delete({ where: { id: checkoutAttemptId } });
  await prisma.trip.delete({ where: { id: tripId } });
  await prisma.$disconnect();
});

beforeEach(() => {
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_fake_for_unit_tests_only");
  vi.mocked(constructStripeWebhookEvent).mockReset();
  vi.mocked(getAuthorization).mockReset();
  vi.mocked(progressCapturedCheckoutAttempt).mockReset();
});
afterEach(() => vi.unstubAllEnvs());

function fakePi(overrides: Partial<PaymentAuthorization>): PaymentAuthorization {
  return {
    providerReference: "pi_webhook_test",
    status: "authorized",
    rawStatus: "requires_capture",
    amountMinorUnits: 6000,
    currency: "EUR",
    amountCapturableMinorUnits: 6000,
    amountReceivedMinorUnits: 0,
    captureMethod: "manual",
    livemode: false,
    hasKnownFailure: false,
    lastPaymentErrorCode: null,
    metadata: { checkout_attempt_id: checkoutAttemptId },
    clientSecret: null,
    ...overrides,
  };
}

function stripeEvent(id: string, type: string, piId = "pi_webhook_test") {
  return { id, type, data: { object: { id: piId } } } as never;
}

function req(body: string, signature = "sig") {
  return new Request("http://localhost/api/webhooks/stripe", { method: "POST", body, headers: { "stripe-signature": signature } });
}

describe("M — an invalid/unverifiable signature is rejected, never processed", () => {
  it("returns 400 and never calls getAuthorization", async () => {
    vi.mocked(constructStripeWebhookEvent).mockImplementation(() => {
      throw new Error("signature mismatch");
    });
    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const res = await POST(req("{}"));
    expect(res.status).toBe(400);
    expect(vi.mocked(getAuthorization)).not.toHaveBeenCalled();
  });

  it("returns 400 when the Stripe-Signature header is missing entirely", async () => {
    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const res = await POST(new Request("http://localhost/api/webhooks/stripe", { method: "POST", body: "{}" }));
    expect(res.status).toBe(400);
  });
});

describe("an unhandled event type is acknowledged but not processed", () => {
  it("payment_intent.created is ignored", async () => {
    vi.mocked(constructStripeWebhookEvent).mockReturnValue(stripeEvent("evt_ignored", "payment_intent.created"));
    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const res = await POST(req("{}"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.handled).toBe(false);
    expect(vi.mocked(getAuthorization)).not.toHaveBeenCalled();
  });
});

describe("I — amount_capturable_updated authorizes the attempt", () => {
  it("processes the event and transitions to payment_authorized", async () => {
    vi.mocked(constructStripeWebhookEvent).mockReturnValue(stripeEvent("evt_authorize_1", "payment_intent.amount_capturable_updated"));
    vi.mocked(getAuthorization).mockResolvedValue(fakePi({}));
    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const res = await POST(req("{}"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.outcome).toBe("authorized");

    const attempt = await prisma.checkoutAttempt.findUniqueOrThrow({ where: { id: checkoutAttemptId } });
    expect(attempt.status).toBe("payment_authorized");
  });
});

describe("L — a duplicate delivery of the SAME event.id produces only one transition", () => {
  it("re-delivering evt_authorize_1 again is deduplicated, no second processing", async () => {
    vi.mocked(constructStripeWebhookEvent).mockReturnValue(stripeEvent("evt_authorize_1", "payment_intent.amount_capturable_updated"));
    const callsBefore = vi.mocked(getAuthorization).mock.calls.length;
    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const res = await POST(req("{}"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deduplicated).toBe(true);
    expect(vi.mocked(getAuthorization).mock.calls.length).toBe(callsBefore); // no new Stripe call at all
  });
});

describe("Q — payment_intent.succeeded drives the capture/finalize progression, signature verified", () => {
  it("dispatches to progressCapturedCheckoutAttempt (never verifyAndApplyAuthorization) and reports its outcome", async () => {
    vi.mocked(constructStripeWebhookEvent).mockReturnValue(stripeEvent("evt_succeeded_1", "payment_intent.succeeded"));
    vi.mocked(progressCapturedCheckoutAttempt).mockResolvedValueOnce({ outcome: "confirmed", bookingId: "b1", reference: "CDF-TEST1", accessToken: "tok1", alreadyFinalized: false });
    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const res = await POST(req("{}"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.outcome).toBe("confirmed");
    expect(vi.mocked(progressCapturedCheckoutAttempt)).toHaveBeenCalledWith(checkoutAttemptId);
    expect(vi.mocked(getAuthorization)).not.toHaveBeenCalled();

    const events = await prisma.checkoutAttemptEvent.findMany({ where: { providerEventId: "evt_succeeded_1" } });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("payment_webhook_processed");
  });
});

describe("R — two concurrent deliveries of the SAME event.id: only one actually processes", () => {
  it("Promise.all of two identical POSTs calls the underlying logic exactly once", async () => {
    vi.mocked(constructStripeWebhookEvent).mockReturnValue(stripeEvent("evt_concurrent_1", "payment_intent.succeeded"));
    // The winner's processing is deliberately slow, so the loser's claim
    // attempt genuinely races against a still-`processing` row rather
    // than a fast happy path that might finish before the second request
    // even starts.
    vi.mocked(progressCapturedCheckoutAttempt).mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve({ outcome: "confirmed", bookingId: "b2", reference: "CDF-TEST2", accessToken: "tok2", alreadyFinalized: false }), 50)),
    );

    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const [resA, resB] = await Promise.all([POST(req("{}")), POST(req("{}"))]);
    const [bodyA, bodyB] = await Promise.all([resA.json(), resB.json()]);

    expect(vi.mocked(progressCapturedCheckoutAttempt)).toHaveBeenCalledTimes(1);
    const outcomes = [bodyA, bodyB];
    expect(outcomes.filter((b) => b.outcome === "confirmed")).toHaveLength(1);
    expect(outcomes.filter((b) => b.deduplicated === true)).toHaveLength(1);
  });
});

describe("S — a processing failure leaves the claim reclaimable by a later retry", () => {
  it("the first delivery throws (claim -> failed); a second delivery of the SAME event.id is allowed to reprocess", async () => {
    vi.mocked(constructStripeWebhookEvent).mockReturnValue(stripeEvent("evt_retry_1", "payment_intent.succeeded"));
    vi.mocked(progressCapturedCheckoutAttempt).mockRejectedValueOnce(new Error("transient DB error"));
    const { POST } = await import("@/app/api/webhooks/stripe/route");

    await expect(POST(req("{}"))).rejects.toThrow("transient DB error");

    const claimAfterFailure = await prisma.webhookEventClaim.findUniqueOrThrow({ where: { id: "evt_retry_1" } });
    expect(claimAfterFailure.status).toBe("failed");

    // Stripe's own retry: same event.id, now succeeds.
    vi.mocked(progressCapturedCheckoutAttempt).mockResolvedValueOnce({ outcome: "confirmed", bookingId: "b3", reference: "CDF-TEST3", accessToken: "tok3", alreadyFinalized: false });
    const res = await POST(req("{}"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.outcome).toBe("confirmed");
    expect(vi.mocked(progressCapturedCheckoutAttempt)).toHaveBeenCalledTimes(2);

    const claimAfterSuccess = await prisma.webhookEventClaim.findUniqueOrThrow({ where: { id: "evt_retry_1" } });
    expect(claimAfterSuccess.status).toBe("completed");
  });
});
