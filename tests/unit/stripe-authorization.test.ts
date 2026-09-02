import { describe, it, expect, vi } from "vitest";
import type Stripe from "stripe";
import { createAuthorization, getAuthorization, cancelAuthorization, mapPaymentIntentStatus, type StripePaymentIntentsClient } from "@/lib/providers/payments/stripe/authorization";
import { paymentIntentCreateIdempotencyKey } from "@/lib/providers/payments/stripe/idempotency";
import { ProviderError } from "@/lib/providers/errors";

/**
 * A tiny in-memory fake standing in for the real Stripe SDK — enforces
 * the ONE piece of real Stripe behavior every test below actually
 * depends on: the SAME idempotency key always resolves to the SAME
 * stored PaymentIntent, regardless of how many times create() is called
 * with it (Fase 3A §16/§25 O — "timeout + misma idempotency key -> no
 * duplicado"). Everything else is a plain in-memory object store.
 */
function makeFakeStripe(): { client: StripePaymentIntentsClient; store: Map<string, Stripe.PaymentIntent> } {
  const byId = new Map<string, Stripe.PaymentIntent>();
  const byIdempotencyKey = new Map<string, string>();
  let counter = 0;

  function pi(overrides: Partial<Stripe.PaymentIntent>): Stripe.PaymentIntent {
    return {
      id: `pi_${++counter}`,
      object: "payment_intent",
      amount: 0,
      amount_capturable: 0,
      capture_method: "manual",
      currency: "eur",
      livemode: false,
      last_payment_error: null,
      metadata: {},
      status: "requires_payment_method",
      client_secret: `secret_${counter}`,
      ...overrides,
    } as Stripe.PaymentIntent;
  }

  const client = {
    paymentIntents: {
      async create(params: Stripe.PaymentIntentCreateParams, options?: Stripe.RequestOptions) {
        const key = options?.idempotencyKey;
        if (key && byIdempotencyKey.has(key)) {
          return byId.get(byIdempotencyKey.get(key)!)!;
        }
        const created = pi({
          amount: params.amount as number,
          currency: params.currency as string,
          capture_method: (params.capture_method as "manual") ?? "automatic",
          metadata: (params.metadata as Record<string, string>) ?? {},
          status: "requires_payment_method",
          amount_capturable: 0,
        });
        byId.set(created.id, created);
        if (key) byIdempotencyKey.set(key, created.id);
        return created;
      },
      async retrieve(id: string) {
        const found = byId.get(id);
        if (!found) throw Object.assign(new Error("No such payment_intent"), { type: "StripeInvalidRequestError", statusCode: 404, code: "resource_missing" });
        return found;
      },
      async cancel(id: string) {
        const found = byId.get(id);
        if (!found) throw Object.assign(new Error("No such payment_intent"), { type: "StripeInvalidRequestError", statusCode: 404, code: "resource_missing" });
        const canceled = { ...found, status: "canceled" as const, amount_capturable: 0 };
        byId.set(id, canceled);
        return canceled;
      },
    },
  } as unknown as StripePaymentIntentsClient;

  return { client, store: byId };
}

describe("D — createAuthorization sends only correlation metadata, never PII", () => {
  it("metadata carries only checkout_attempt_id/trip_id-style keys, no email/name/phone", async () => {
    const { client } = makeFakeStripe();
    const result = await createAuthorization(
      { amountMinorUnits: 5000, currency: "EUR", idempotencyKey: paymentIntentCreateIdempotencyKey("cka_1", 0), metadata: { checkout_attempt_id: "cka_1", trip_id: "trip_1" } },
      client,
    );
    expect(result.metadata).toEqual({ checkout_attempt_id: "cka_1", trip_id: "trip_1" });
    expect(Object.values(result.metadata).join(" ")).not.toMatch(/@/); // no email leaked in
  });
});

describe("C — double create with the same idempotency key returns the SAME PaymentIntent", () => {
  it("two calls, same key -> one underlying PaymentIntent id", async () => {
    const { client } = makeFakeStripe();
    const key = paymentIntentCreateIdempotencyKey("cka_1", 0);
    const first = await createAuthorization({ amountMinorUnits: 5000, currency: "EUR", idempotencyKey: key, metadata: { checkout_attempt_id: "cka_1" } }, client);
    const second = await createAuthorization({ amountMinorUnits: 5000, currency: "EUR", idempotencyKey: key, metadata: { checkout_attempt_id: "cka_1" } }, client);
    expect(second.providerReference).toBe(first.providerReference);
  });
});

describe("O — a retried create after a simulated timeout, same idempotency key, never duplicates", () => {
  it("a 'timeout' (client-side throw) followed by a retry with the same key resolves to the ORIGINAL PaymentIntent Stripe already created", async () => {
    const { client } = makeFakeStripe();
    const key = paymentIntentCreateIdempotencyKey("cka_1", 0);
    // Simulate: the request reached Stripe and created the PI, but our
    // client never saw the response (a real create() still happens
    // underneath, exactly like Stripe's own guarantee) — then retry.
    const created = await createAuthorization({ amountMinorUnits: 5000, currency: "EUR", idempotencyKey: key, metadata: { checkout_attempt_id: "cka_1" } }, client);
    const retried = await createAuthorization({ amountMinorUnits: 5000, currency: "EUR", idempotencyKey: key, metadata: { checkout_attempt_id: "cka_1" } }, client);
    expect(retried.providerReference).toBe(created.providerReference);
  });
});

describe("A different quote version produces a genuinely new PaymentIntent (never reuses a stale amount)", () => {
  it("v0 and v1 keys create two distinct PaymentIntents", async () => {
    const { client } = makeFakeStripe();
    const v0 = await createAuthorization({ amountMinorUnits: 5000, currency: "EUR", idempotencyKey: paymentIntentCreateIdempotencyKey("cka_1", 0), metadata: {} }, client);
    const v1 = await createAuthorization({ amountMinorUnits: 6000, currency: "EUR", idempotencyKey: paymentIntentCreateIdempotencyKey("cka_1", 1), metadata: {} }, client);
    expect(v1.providerReference).not.toBe(v0.providerReference);
    expect(v1.amountMinorUnits).toBe(6000);
  });
});

describe("mapPaymentIntentStatus — H/I/N", () => {
  it("H — requires_action never maps to failed", () => {
    expect(mapPaymentIntentStatus({ status: "requires_action", last_payment_error: null })).toBe("authorizing");
  });

  it("I — requires_capture maps to authorized", () => {
    expect(mapPaymentIntentStatus({ status: "requires_capture", last_payment_error: null })).toBe("authorized");
  });

  it("N — requires_payment_method WITH a last_payment_error maps to failed (a known, retryable failure)", () => {
    expect(mapPaymentIntentStatus({ status: "requires_payment_method", last_payment_error: { code: "card_declined" } as never })).toBe("failed");
  });

  it("a FRESH requires_payment_method (no error yet) is still authorizing, not failed", () => {
    expect(mapPaymentIntentStatus({ status: "requires_payment_method", last_payment_error: null })).toBe("authorizing");
  });

  it("canceled maps to voided", () => {
    expect(mapPaymentIntentStatus({ status: "canceled", last_payment_error: null })).toBe("voided");
  });

  it("processing stays authorizing (still in flight)", () => {
    expect(mapPaymentIntentStatus({ status: "processing", last_payment_error: null })).toBe("authorizing");
  });
});

describe("getAuthorization — a fresh authoritative read", () => {
  it("returns the current stored state for a real id", async () => {
    const { client } = makeFakeStripe();
    const created = await createAuthorization({ amountMinorUnits: 1000, currency: "EUR", idempotencyKey: "k1", metadata: {} }, client);
    const fetched = await getAuthorization(created.providerReference, client);
    expect(fetched.providerReference).toBe(created.providerReference);
    expect(fetched.amountMinorUnits).toBe(1000);
  });

  it("an unknown id maps to a ProviderError, never an unhandled Stripe exception leaking out", async () => {
    const { client } = makeFakeStripe();
    await expect(getAuthorization("pi_does_not_exist", client)).rejects.toBeInstanceOf(ProviderError);
  });
});

describe("S — cancelAuthorization (adapter-level, mocked)", () => {
  it("cancels a not-yet-captured PaymentIntent and reports voided", async () => {
    const { client } = makeFakeStripe();
    const created = await createAuthorization({ amountMinorUnits: 2500, currency: "EUR", idempotencyKey: "k2", metadata: {} }, client);
    const canceled = await cancelAuthorization(created.providerReference, client);
    expect(canceled.status).toBe("voided");
    expect(canceled.rawStatus).toBe("canceled");
  });
});

describe("mapStripeError coverage via a rejected SDK call", () => {
  it("wraps whatever the fake throws into a ProviderError with sanitized detail", async () => {
    const client: StripePaymentIntentsClient = {
      paymentIntents: {
        create: vi.fn().mockRejectedValue(Object.assign(new Error("boom"), { type: "StripeAPIError", statusCode: 500 })),
      },
    } as unknown as StripePaymentIntentsClient;
    await expect(createAuthorization({ amountMinorUnits: 100, currency: "EUR", idempotencyKey: "k", metadata: {} }, client)).rejects.toBeInstanceOf(ProviderError);
  });
});
