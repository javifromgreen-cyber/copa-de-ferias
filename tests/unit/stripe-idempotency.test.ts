import { describe, it, expect } from "vitest";
import { paymentIntentCreateIdempotencyKey, paymentIntentCancelIdempotencyKey } from "@/lib/providers/payments/stripe/idempotency";

// Fase 3A §5/§8/§16 — deterministic, version-scoped idempotency keys.

describe("paymentIntentCreateIdempotencyKey", () => {
  it("is stable for the same (attempt, version) pair", () => {
    const a = paymentIntentCreateIdempotencyKey("cka_1", 0);
    const b = paymentIntentCreateIdempotencyKey("cka_1", 0);
    expect(a).toBe(b);
  });

  it("changes when the quote version changes (a stale amount is never reused)", () => {
    const v0 = paymentIntentCreateIdempotencyKey("cka_1", 0);
    const v1 = paymentIntentCreateIdempotencyKey("cka_1", 1);
    expect(v0).not.toBe(v1);
  });

  it("changes when the checkout attempt changes", () => {
    const a = paymentIntentCreateIdempotencyKey("cka_1", 0);
    const b = paymentIntentCreateIdempotencyKey("cka_2", 0);
    expect(a).not.toBe(b);
  });

  it("never embeds anything beyond the attempt id and version — no PII possible by construction", () => {
    const key = paymentIntentCreateIdempotencyKey("cka_1", 3);
    expect(key).toBe("cdf:cka_1:payment-intent:create:v3");
  });
});

describe("paymentIntentCancelIdempotencyKey never collides with a create key", () => {
  it("uses a distinct action namespace", () => {
    const create = paymentIntentCreateIdempotencyKey("cka_1", 0);
    const cancel = paymentIntentCancelIdempotencyKey("cka_1", 0);
    expect(cancel).not.toBe(create);
  });
});
