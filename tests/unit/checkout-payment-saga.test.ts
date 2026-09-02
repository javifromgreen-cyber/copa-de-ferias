import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { prepareCheckoutAttempt, type PrepareCheckoutAttemptInput } from "@/lib/checkout-saga/prepareCheckoutAttempt";
import { ensureCheckoutAttemptPayable, createPaymentAuthorization, verifyAndApplyAuthorization, releaseAbandonedPaymentAuthorizing } from "@/lib/checkout-saga/payment";
import { paymentIntentCreateIdempotencyKey } from "@/lib/providers/payments/stripe/idempotency";
import type { PaymentAuthorization } from "@/lib/providers/payments/stripe/types";
import { startPaymentAuthorization, getPaymentAuthorizationStatus } from "@/server/actions/real-checkout-payment";

// Fase 3A — the payment-authorization saga (payment.ts) and its
// accessToken-gated server actions. Stripe itself is entirely mocked at
// the adapter boundary (createAuthorization/getAuthorization/
// cancelAuthorization) — never real network — the checkout-saga engines
// (prepareCheckoutAttempt, transitions, ticket holds) are exercised for
// real against the test DB, same discipline as
// prepare-checkout-attempt.test.ts.

vi.mock("@/lib/providers/payments/stripe/authorization", () => ({
  createAuthorization: vi.fn(),
  getAuthorization: vi.fn(),
  cancelAuthorization: vi.fn(),
}));
import { createAuthorization, getAuthorization, cancelAuthorization } from "@/lib/providers/payments/stripe/authorization";

const RUN_ID = `checkout-payment-${Date.now()}`;
let tripId: string;
let eventId: string;

beforeAll(async () => {
  const trip = await prisma.trip.create({
    data: {
      number: 900008,
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
  await prisma.checkoutAttemptEvent.deleteMany({ where: { checkoutAttempt: { tripId } } });
  await prisma.checkoutAttempt.deleteMany({ where: { tripId } });
  await prisma.ticketOffer.deleteMany({ where: { eventId } });
  await prisma.trip.delete({ where: { id: tripId } });
  await prisma.$disconnect();
});

beforeEach(() => {
  vi.mocked(createAuthorization).mockReset();
  vi.mocked(getAuthorization).mockReset();
  vi.mocked(cancelAuthorization).mockReset();
});
afterEach(() => vi.restoreAllMocks());

async function createTicketOffer(stock = 10) {
  const offer = await prisma.ticketOffer.create({ data: { eventId, costNet: 50, currency: "EUR", stock, active: true } });
  return offer.id;
}

const BUYER: PrepareCheckoutAttemptInput["buyer"] = { firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", phone: "+34600000001" };

/** A real TICKET_ONLY CheckoutAttempt at READY_TO_PAY — no Duffel/Nuitee network involved at all. */
async function createReadyToPayAttempt() {
  const ticketOfferId = await createTicketOffer();
  const result = await prepareCheckoutAttempt({
    tripId,
    packageType: "TICKET_ONLY",
    partySize: 1,
    travelOriginCountry: "ES",
    buyer: BUYER,
    travelers: [{ firstName: "Ada", lastName: "Lovelace" }],
    ticket: { ticketOfferId, quantity: 1 },
  });
  if (!result.ok) throw new Error(`fixture setup failed: ${result.error}`);
  return result;
}

function fakePi(overrides: Partial<PaymentAuthorization>): PaymentAuthorization {
  return {
    providerReference: "pi_test",
    status: "authorizing",
    rawStatus: "requires_payment_method",
    amountMinorUnits: 5000,
    currency: "EUR",
    amountCapturableMinorUnits: 0,
    captureMethod: "manual",
    livemode: false,
    hasKnownFailure: false,
    lastPaymentErrorCode: null,
    metadata: {},
    clientSecret: "secret_test",
    ...overrides,
  };
}

describe("E — a fresh READY_TO_PAY attempt is payable as-is (no refresh, no provider calls)", () => {
  it("ensureCheckoutAttemptPayable returns the current snapshot unrefreshed", async () => {
    const { checkoutAttemptId, finalQuoteSnapshot } = await createReadyToPayAttempt();
    const result = await ensureCheckoutAttemptPayable(checkoutAttemptId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.refreshed).toBe(false);
    expect(result.snapshot.commercial.pvpTotal).toBe(finalQuoteSnapshot.commercial.pvpTotal);
  });
});

describe("F — an expired quote triggers a refresh instead of authorizing the stale amount", () => {
  it("latestSafePaymentAt in the past -> ensureCheckoutAttemptPayable refreshes on the SAME attempt (new quoteVersion, still ready_to_pay)", async () => {
    const { checkoutAttemptId } = await createReadyToPayAttempt();
    await prisma.checkoutAttempt.update({ where: { id: checkoutAttemptId }, data: { latestSafePaymentAt: new Date(Date.now() - 60_000) } });
    const before = await prisma.checkoutAttempt.findUniqueOrThrow({ where: { id: checkoutAttemptId } });

    const result = await ensureCheckoutAttemptPayable(checkoutAttemptId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.refreshed).toBe(true);
    expect(result.quoteVersion).toBeGreaterThan(before.finalQuoteSnapshotVersion);

    const after = await prisma.checkoutAttempt.findUniqueOrThrow({ where: { id: checkoutAttemptId } });
    expect(after.status).toBe("ready_to_pay"); // back to READY_TO_PAY, never silently authorized
  });
});

describe("G — createPaymentAuthorization always uses the CURRENT quote version's idempotency key, never a stale one", () => {
  it("after a version bump, the Stripe create() call carries a NEW idempotency key embedding the new version", async () => {
    const { checkoutAttemptId } = await createReadyToPayAttempt();
    await prisma.checkoutAttempt.update({ where: { id: checkoutAttemptId }, data: { latestSafePaymentAt: new Date(Date.now() - 60_000) } });

    vi.mocked(createAuthorization).mockResolvedValueOnce(fakePi({ providerReference: "pi_v2" }));
    const result = await createPaymentAuthorization(checkoutAttemptId);
    expect(result.ok).toBe(true);

    const attempt = await prisma.checkoutAttempt.findUniqueOrThrow({ where: { id: checkoutAttemptId } });
    expect(attempt.finalQuoteSnapshotVersion).toBe(attempt.paymentIntentQuoteVersion);
    const call = vi.mocked(createAuthorization).mock.calls[0][0];
    expect(call.idempotencyKey).toBe(paymentIntentCreateIdempotencyKey(checkoutAttemptId, attempt.finalQuoteSnapshotVersion));
  });
});

describe("A — the PaymentIntent amount always comes from the server-side snapshot, never a client input", () => {
  it("createAuthorization is called with the snapshot's own pvpTotal in minor units", async () => {
    const { checkoutAttemptId, finalQuoteSnapshot } = await createReadyToPayAttempt();
    vi.mocked(createAuthorization).mockResolvedValueOnce(fakePi({}));
    await createPaymentAuthorization(checkoutAttemptId);
    const call = vi.mocked(createAuthorization).mock.calls[0][0];
    expect(call.amountMinorUnits).toBe(Math.round(finalQuoteSnapshot.commercial.pvpTotal * 100));
    expect(call.currency).toBe("EUR");
  });
});

describe("D (saga level) — metadata never carries PII", () => {
  it("only checkout_attempt_id/trip_id are sent", async () => {
    const { checkoutAttemptId } = await createReadyToPayAttempt();
    vi.mocked(createAuthorization).mockResolvedValueOnce(fakePi({}));
    await createPaymentAuthorization(checkoutAttemptId);
    const call = vi.mocked(createAuthorization).mock.calls[0][0];
    expect(Object.keys(call.metadata).sort()).toEqual(["checkout_attempt_id", "trip_id"]);
    expect(call.metadata.checkout_attempt_id).toBe(checkoutAttemptId);
  });
});

describe("C — a double PAGAR click never creates two PaymentIntents", () => {
  it("the second createPaymentAuthorization call, while still payment_authorizing at the same version, does not call Stripe create() again", async () => {
    const { checkoutAttemptId } = await createReadyToPayAttempt();
    vi.mocked(createAuthorization).mockResolvedValueOnce(fakePi({ providerReference: "pi_once" }));
    vi.mocked(getAuthorization).mockResolvedValue(fakePi({ providerReference: "pi_once", clientSecret: "secret_once" }));

    const first = await createPaymentAuthorization(checkoutAttemptId);
    const second = await createPaymentAuthorization(checkoutAttemptId);

    expect(first.ok && first.status === "action_required" ? first.clientSecret : null).toBeTruthy();
    expect(second.ok && second.status === "action_required" ? second.clientSecret : null).toBe("secret_once");
    expect(vi.mocked(createAuthorization)).toHaveBeenCalledTimes(1);
  });
});

describe("H — requires_action never marks the attempt FAILED", () => {
  it("verifyAndApplyAuthorization on a requires_action PI leaves CheckoutAttempt in payment_authorizing", async () => {
    const { checkoutAttemptId, finalQuoteSnapshot } = await createReadyToPayAttempt();
    vi.mocked(createAuthorization).mockResolvedValueOnce(fakePi({ providerReference: "pi_h" }));
    await createPaymentAuthorization(checkoutAttemptId);

    const amount = Math.round(finalQuoteSnapshot.commercial.pvpTotal * 100);
    const outcome = await verifyAndApplyAuthorization(
      checkoutAttemptId,
      fakePi({ providerReference: "pi_h", status: "authorizing", rawStatus: "requires_action", amountMinorUnits: amount, metadata: { checkout_attempt_id: checkoutAttemptId } }),
    );

    expect(outcome.outcome).toBe("still_authorizing");
    const after = await prisma.checkoutAttempt.findUniqueOrThrow({ where: { id: checkoutAttemptId } });
    expect(after.status).toBe("payment_authorizing");
  });
});

describe("I — requires_capture -> PAYMENT_AUTHORIZED, TicketHold stays HELD, no Booking", () => {
  it("a matching requires_capture PaymentIntent authorizes the attempt without touching TicketHold/Booking", async () => {
    const { checkoutAttemptId, finalQuoteSnapshot } = await createReadyToPayAttempt();
    vi.mocked(createAuthorization).mockResolvedValueOnce(fakePi({ providerReference: "pi_i" }));
    await createPaymentAuthorization(checkoutAttemptId);

    const amount = Math.round(finalQuoteSnapshot.commercial.pvpTotal * 100);
    const outcome = await verifyAndApplyAuthorization(
      checkoutAttemptId,
      fakePi({ providerReference: "pi_i", status: "authorized", rawStatus: "requires_capture", amountMinorUnits: amount, amountCapturableMinorUnits: amount, metadata: { checkout_attempt_id: checkoutAttemptId } }),
    );
    expect(outcome.outcome).toBe("authorized");

    const attempt = await prisma.checkoutAttempt.findUniqueOrThrow({ where: { id: checkoutAttemptId } });
    expect(attempt.status).toBe("payment_authorized");
    expect(attempt.paymentStatus).toBe("authorized");
    // T/U — TicketHold stays HELD, no Booking exists.
    expect(attempt.bookingId).toBeNull();
    const hold = await prisma.ticketHold.findFirstOrThrow({ where: { checkoutAttemptId } });
    expect(hold.status).toBe("held");
  });
});

describe("K — a PaymentIntent id mismatch never transitions the attempt", () => {
  it("verifyAndApplyAuthorization with a foreign PaymentIntent id rejects without changing status", async () => {
    const { checkoutAttemptId } = await createReadyToPayAttempt();
    vi.mocked(createAuthorization).mockResolvedValueOnce(fakePi({ providerReference: "pi_real" }));
    await createPaymentAuthorization(checkoutAttemptId);

    const before = await prisma.checkoutAttempt.findUniqueOrThrow({ where: { id: checkoutAttemptId } });
    const outcome = await verifyAndApplyAuthorization(checkoutAttemptId, fakePi({ providerReference: "pi_someone_elses", status: "authorized", rawStatus: "requires_capture" }));
    expect(outcome.outcome).toBe("rejected");
    const after = await prisma.checkoutAttempt.findUniqueOrThrow({ where: { id: checkoutAttemptId } });
    expect(after.status).toBe(before.status);
  });
});

describe("J — an amount mismatch never authorizes the attempt", () => {
  it("verifyAndApplyAuthorization with the WRONG amount on the correct PaymentIntent id rejects without transitioning", async () => {
    const { checkoutAttemptId } = await createReadyToPayAttempt();
    vi.mocked(createAuthorization).mockResolvedValueOnce(fakePi({ providerReference: "pi_j" }));
    await createPaymentAuthorization(checkoutAttemptId);

    const outcome = await verifyAndApplyAuthorization(
      checkoutAttemptId,
      fakePi({ providerReference: "pi_j", status: "authorized", rawStatus: "requires_capture", amountMinorUnits: 999999, amountCapturableMinorUnits: 999999, metadata: { checkout_attempt_id: checkoutAttemptId } }),
    );
    expect(outcome.outcome).toBe("rejected");
    const after = await prisma.checkoutAttempt.findUniqueOrThrow({ where: { id: checkoutAttemptId } });
    expect(after.status).toBe("payment_authorizing");
  });
});

describe("N — requires_payment_method with a known failure is a retryable failure, not a dead attempt", () => {
  it("paymentStatus becomes failed, CheckoutAttempt stays payment_authorizing (same PaymentIntent retryable)", async () => {
    const { checkoutAttemptId, finalQuoteSnapshot } = await createReadyToPayAttempt();
    vi.mocked(createAuthorization).mockResolvedValueOnce(fakePi({ providerReference: "pi_n" }));
    await createPaymentAuthorization(checkoutAttemptId);

    const amount = Math.round(finalQuoteSnapshot.commercial.pvpTotal * 100);
    const outcome = await verifyAndApplyAuthorization(
      checkoutAttemptId,
      fakePi({ providerReference: "pi_n", status: "failed", rawStatus: "requires_payment_method", hasKnownFailure: true, lastPaymentErrorCode: "card_declined", amountMinorUnits: amount, metadata: { checkout_attempt_id: checkoutAttemptId } }),
    );
    expect(outcome.outcome).toBe("failed");
    const attempt = await prisma.checkoutAttempt.findUniqueOrThrow({ where: { id: checkoutAttemptId } });
    expect(attempt.status).toBe("payment_authorizing");
    expect(attempt.paymentStatus).toBe("failed");
  });
});

describe("P/Q/R — abandoned payment_authorizing", () => {
  it("P — window expired + Stripe says requires_payment_method -> safely released", async () => {
    const { checkoutAttemptId } = await createReadyToPayAttempt();
    vi.mocked(createAuthorization).mockResolvedValueOnce(fakePi({ providerReference: "pi_p" }));
    await createPaymentAuthorization(checkoutAttemptId);
    await prisma.checkoutAttempt.update({ where: { id: checkoutAttemptId }, data: { paymentAuthorizationExpiresAt: new Date(Date.now() - 1000) } });
    vi.mocked(getAuthorization).mockResolvedValueOnce(fakePi({ providerReference: "pi_p", status: "authorizing", rawStatus: "requires_payment_method" }));
    vi.mocked(cancelAuthorization).mockResolvedValueOnce(fakePi({ providerReference: "pi_p", status: "voided", rawStatus: "canceled" }));

    const outcome = await releaseAbandonedPaymentAuthorizing(checkoutAttemptId);
    expect(outcome.released).toBe(true);

    const attempt = await prisma.checkoutAttempt.findUniqueOrThrow({ where: { id: checkoutAttemptId } });
    expect(attempt.status).toBe("failed");
    const hold = await prisma.ticketHold.findFirstOrThrow({ where: { checkoutAttemptId } });
    expect(hold.status).toBe("released");
  });

  it("Q — window expired but Stripe says requires_capture -> NOT released, self-heals to authorized", async () => {
    const { checkoutAttemptId, finalQuoteSnapshot } = await createReadyToPayAttempt();
    vi.mocked(createAuthorization).mockResolvedValueOnce(fakePi({ providerReference: "pi_q" }));
    await createPaymentAuthorization(checkoutAttemptId);
    await prisma.checkoutAttempt.update({ where: { id: checkoutAttemptId }, data: { paymentAuthorizationExpiresAt: new Date(Date.now() - 1000) } });

    const amount = Math.round(finalQuoteSnapshot.commercial.pvpTotal * 100);
    vi.mocked(getAuthorization).mockResolvedValueOnce(fakePi({ providerReference: "pi_q", status: "authorized", rawStatus: "requires_capture", amountMinorUnits: amount, amountCapturableMinorUnits: amount, metadata: { checkout_attempt_id: checkoutAttemptId } }));

    const outcome = await releaseAbandonedPaymentAuthorizing(checkoutAttemptId);
    expect(outcome.released).toBe(false);

    const attempt = await prisma.checkoutAttempt.findUniqueOrThrow({ where: { id: checkoutAttemptId } });
    expect(attempt.status).toBe("payment_authorized"); // self-healed, hold never released
    const hold = await prisma.ticketHold.findFirstOrThrow({ where: { checkoutAttemptId } });
    expect(hold.status).toBe("held");
  });

  it("R — Stripe unreachable while checking an abandoned attempt -> never released blindly, parks in recovery_required", async () => {
    const { checkoutAttemptId } = await createReadyToPayAttempt();
    vi.mocked(createAuthorization).mockResolvedValueOnce(fakePi({ providerReference: "pi_r" }));
    await createPaymentAuthorization(checkoutAttemptId);
    await prisma.checkoutAttempt.update({ where: { id: checkoutAttemptId }, data: { paymentAuthorizationExpiresAt: new Date(Date.now() - 1000) } });
    vi.mocked(getAuthorization).mockRejectedValueOnce(new Error("network down"));

    const outcome = await releaseAbandonedPaymentAuthorizing(checkoutAttemptId);
    expect(outcome.released).toBe(false);

    const attempt = await prisma.checkoutAttempt.findUniqueOrThrow({ where: { id: checkoutAttemptId } });
    expect(attempt.status).toBe("recovery_required");
    const hold = await prisma.ticketHold.findFirstOrThrow({ where: { checkoutAttemptId } });
    expect(hold.status).toBe("held"); // never released while unverifiable
  });

  it("window not yet expired -> never released even if Stripe would say requires_payment_method", async () => {
    const { checkoutAttemptId } = await createReadyToPayAttempt();
    vi.mocked(createAuthorization).mockResolvedValueOnce(fakePi({ providerReference: "pi_fresh" }));
    await createPaymentAuthorization(checkoutAttemptId);
    // paymentAuthorizationExpiresAt is still in the future by construction.
    const outcome = await releaseAbandonedPaymentAuthorizing(checkoutAttemptId);
    expect(outcome.released).toBe(false);
    expect(outcome.reason).toBe("window_not_expired");
    expect(vi.mocked(getAuthorization)).not.toHaveBeenCalled();
  });
});

describe("X — accessToken-gated server actions never accept a raw id", () => {
  it("a wrong/garbage accessToken cannot start a payment", async () => {
    const result = await startPaymentAuthorization("this-is-not-a-real-token");
    expect(result.ok).toBe(false);
  });

  it("someone else's real CheckoutAttempt.id (not its accessToken) cannot start a payment either", async () => {
    const { checkoutAttemptId } = await createReadyToPayAttempt();
    // Deliberately pass the RAW id where an accessToken is expected.
    const result = await startPaymentAuthorization(checkoutAttemptId);
    expect(result.ok).toBe(false);
  });

  it("the genuine accessToken works", async () => {
    const setup = await createReadyToPayAttempt();
    const attempt = await prisma.checkoutAttempt.findUniqueOrThrow({ where: { id: setup.checkoutAttemptId } });
    vi.mocked(createAuthorization).mockResolvedValueOnce(fakePi({ providerReference: "pi_token_ok" }));
    const result = await startPaymentAuthorization(attempt.accessToken);
    expect(result.ok).toBe(true);
  });
});

describe("Y — refresh/resume reconstructs authorization state from the server, polling Stripe when still in progress", () => {
  it("a webhook that never arrived is still picked up by getPaymentAuthorizationStatus polling Stripe directly", async () => {
    const setup = await createReadyToPayAttempt();
    const attempt = await prisma.checkoutAttempt.findUniqueOrThrow({ where: { id: setup.checkoutAttemptId } });
    vi.mocked(createAuthorization).mockResolvedValueOnce(fakePi({ providerReference: "pi_y" }));
    await createPaymentAuthorization(setup.checkoutAttemptId);

    const amount = Math.round(setup.finalQuoteSnapshot.commercial.pvpTotal * 100);
    vi.mocked(getAuthorization).mockResolvedValueOnce(
      fakePi({ providerReference: "pi_y", status: "authorized", rawStatus: "requires_capture", amountMinorUnits: amount, amountCapturableMinorUnits: amount, metadata: { checkout_attempt_id: setup.checkoutAttemptId } }),
    );

    const view = await getPaymentAuthorizationStatus(attempt.accessToken);
    expect(view.stage).toBe("authorized");

    const after = await prisma.checkoutAttempt.findUniqueOrThrow({ where: { id: setup.checkoutAttemptId } });
    expect(after.status).toBe("payment_authorized");
  });
});
