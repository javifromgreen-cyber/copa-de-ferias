/**
 * Fase 3A §5/§8/§16 — deterministic Stripe idempotency keys, derived only
 * from CheckoutAttempt.id (never guessable PII, never random) plus the
 * quote version the request is being made against
 * (CheckoutAttempt.finalQuoteSnapshotVersion — see finalQuoteSnapshot.ts's
 * own doc comment and prepareCheckoutAttempt.ts).
 *
 * Why the version is embedded, not just the attempt id: Stripe's
 * idempotency guarantee is "the same key returns the same response,
 * regardless of what params you send this time" — so if the key did NOT
 * change when the quote's price changed (a revalidation refresh), a
 * double-click after a price change could resolve to Stripe's CACHED
 * response for the OLD amount instead of creating a new PaymentIntent for
 * the new one. Bumping the version on every new snapshot (see
 * quoteRevalidation.ts) automatically produces a fresh key, which is
 * exactly the "never autoriza silenciosamente un importe distinto" (§7)
 * guarantee this key format exists to uphold — enforced by construction,
 * not by a runtime check.
 *
 * Conversely, the SAME (checkoutAttemptId, version) pair always produces
 * the SAME key — so a double PAGAR click, a page refresh mid-authorization,
 * or a retried server action after a network timeout (§5/§16/§17) all
 * resolve to the exact same Stripe request, and Stripe's own idempotency
 * layer (not any bookkeeping of ours) guarantees at most one PaymentIntent
 * is ever created for that pair.
 */
export function paymentIntentCreateIdempotencyKey(checkoutAttemptId: string, quoteVersion: number): string {
  return `cdf:${checkoutAttemptId}:payment-intent:create:v${quoteVersion}`;
}

/** Same construction, for the (rare) explicit cancel-of-a-superseded-PaymentIntent call — a distinct action namespace so it can never collide with a create key even if reused programmatically. */
export function paymentIntentCancelIdempotencyKey(checkoutAttemptId: string, quoteVersion: number): string {
  return `cdf:${checkoutAttemptId}:payment-intent:cancel:v${quoteVersion}`;
}
