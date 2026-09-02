import { prisma } from "@/lib/db";
import { transitionCheckoutAttempt } from "./transitions";
import { recordCheckoutAttemptEvent } from "./events";
import { runQuoteRevalidation, type QuoteRevalidationHotelInput, type QuoteRevalidationFlightInput, type QuoteRevalidationTicketInput } from "./quoteRevalidation";
import { parseFinalQuoteSnapshot, type FinalQuoteSnapshot } from "./finalQuoteSnapshot";
import { toStripeMinorUnits } from "@/lib/providers/payments/stripe/amount";
import { paymentIntentCreateIdempotencyKey } from "@/lib/providers/payments/stripe/idempotency";
import { createAuthorization, getAuthorization, cancelAuthorization } from "@/lib/providers/payments/stripe/authorization";
import type { PaymentAuthorization } from "@/lib/providers/payments/stripe/types";
import { stripeConfig } from "@/lib/env";

/**
 * Fase 3A — the payment-authorization saga step: READY_TO_PAY -> Stripe
 * TEST manual-capture authorization -> PAYMENT_AUTHORIZED. Stops there —
 * nothing here ever calls PaymentIntent.capture(), books a hotel, issues
 * a flight Order, or creates a Booking (those are Fase 3B+). Reuses the
 * saga's existing engines (transitionCheckoutAttempt, runQuoteRevalidation)
 * rather than inventing parallel ones.
 */

/** §14 — how long an in-progress Stripe authorization attempt (Payment Element mounted, possibly mid-3DS) is given before it's eligible for abandonment review. Generous enough for a real 3DS challenge; a purely internal, conservative choice (same "not derived from any provider" convention as TICKET_HOLD_TTL_MS). */
const PAYMENT_AUTHORIZATION_WINDOW_MS = 15 * 60 * 1000;

/** §7 — TICKET_HOTEL (no flight) additional freshness bound: Nuitee's PREBOOK response carries no expiry of its own (see quoteValidity.ts's own doc comment), so latestSafePaymentAt alone is not a real guarantee the hotel price/availability still holds. This is a second, internal, DELIBERATELY SHORTER window measured from the snapshot's own createdAt — crossing it forces a fresh hotel prebook via runQuoteRevalidation before a PaymentIntent is ever created. */
const HOTEL_ONLY_SAFE_PAYMENT_WINDOW_MS = 10 * 60 * 1000;

function parseSelectionJson<T>(raw: string): T | undefined {
  if (!raw) return undefined;
  return JSON.parse(raw) as T;
}

export type EnsureCheckoutAttemptPayableResult = { ok: true; snapshot: FinalQuoteSnapshot; quoteVersion: number; refreshed: boolean } | { ok: false; error: string };

/**
 * Fase 3A §7 — the explicit "is this attempt still safe to authorize a
 * payment against, right now" gate, called immediately before
 * createPaymentAuthorization ever builds a Stripe request. Three
 * outcomes:
 *  - fresh enough as-is -> returns the CURRENT snapshot/version, no
 *    provider calls made.
 *  - stale (latestSafePaymentAt passed, OR a hotel-only attempt past its
 *    own shorter internal window) -> replays the ORIGINAL selection
 *    through runQuoteRevalidation on this SAME attempt (never a new
 *    CheckoutAttempt), producing a NEW snapshot/version; the caller
 *    (createPaymentAuthorization) picks that fresh price back up
 *    automatically, but the CUSTOMER must still explicitly press PAGAR
 *    again against it — this function alone never authorizes anything.
 *  - genuinely can't be made payable (revalidation itself failed — stock
 *    gone, provider rejected, reversibility gate, etc.) -> ok:false; the
 *    attempt has already been transitioned to FAILED by
 *    runQuoteRevalidation's own failure path.
 */
export async function ensureCheckoutAttemptPayable(checkoutAttemptId: string, fetchImpl?: typeof fetch): Promise<EnsureCheckoutAttemptPayableResult> {
  const attempt = await prisma.checkoutAttempt.findUnique({ where: { id: checkoutAttemptId } });
  if (!attempt || attempt.status !== "ready_to_pay") {
    return { ok: false, error: "Este intento no está en READY_TO_PAY." };
  }
  const snapshot = parseFinalQuoteSnapshot(attempt.finalQuoteSnapshot);
  if (!snapshot || !attempt.latestSafePaymentAt) {
    return { ok: false, error: "Este intento no tiene una cotización válida." };
  }

  const now = Date.now();
  const withinGlobalBound = now < attempt.latestSafePaymentAt.getTime();
  const withinHotelOnlyBound = snapshot.flight || !snapshot.hotel ? true : now < new Date(snapshot.createdAt).getTime() + HOTEL_ONLY_SAFE_PAYMENT_WINDOW_MS;

  if (withinGlobalBound && withinHotelOnlyBound) {
    return { ok: true, snapshot, quoteVersion: attempt.finalQuoteSnapshotVersion, refreshed: false };
  }

  // Stale — replay the ORIGINAL selection through the shared revalidation
  // engine, on this SAME attempt (never a new CheckoutAttempt id).
  await transitionCheckoutAttempt(checkoutAttemptId, "revalidating");
  await recordCheckoutAttemptEvent(checkoutAttemptId, "quote_refresh_started", { sanitizedDetail: JSON.stringify({ reason: withinGlobalBound ? "hotel_only_window_expired" : "latest_safe_payment_at_expired" }) });

  const ticket = parseSelectionJson<QuoteRevalidationTicketInput>(attempt.ticketSelectionJson);
  if (!ticket) {
    await transitionCheckoutAttempt(checkoutAttemptId, "failed");
    return { ok: false, error: "No se pudo recuperar la selección original de entradas." };
  }
  const hotel = parseSelectionJson<QuoteRevalidationHotelInput>(attempt.hotelSelectionJson);
  const flight = parseSelectionJson<QuoteRevalidationFlightInput>(attempt.flightSelectionJson);

  const result = await runQuoteRevalidation({
    checkoutAttemptId,
    tripId: attempt.tripId,
    packageType: attempt.packageType,
    partySize: attempt.partySize,
    ticket,
    hotel,
    flight,
    fetchImpl,
  });
  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  await recordCheckoutAttemptEvent(checkoutAttemptId, "quote_refreshed", { sanitizedDetail: JSON.stringify({ pvpTotal: result.snapshot.commercial.pvpTotal, quoteVersion: result.quoteVersion }) });
  return { ok: true, snapshot: result.snapshot, quoteVersion: result.quoteVersion, refreshed: true };
}

export type CreatePaymentAuthorizationResult =
  | { ok: true; status: "action_required"; checkoutAttemptId: string; clientSecret: string; publishableKey: string; refreshed: boolean }
  | { ok: true; status: "already_authorized"; checkoutAttemptId: string }
  | { ok: false; error: string };

/**
 * Fase 3A §1/§3-§9/§13/§18 — the "customer pressed PAGAR" entry point.
 * Handles, in order: freshness (ensureCheckoutAttemptPayable), the
 * ready_to_pay -> payment_authorizing transition, a superseded
 * PaymentIntent from an earlier quote version (best-effort canceled),
 * amount derivation strictly from the server-side snapshot (never a
 * client-supplied number), and the actual manual-capture PaymentIntent
 * creation — restricted to `card` (§3), idempotent by construction
 * (§5/§16 — see idempotency.ts's own doc comment).
 *
 * Re-entrant: a double PAGAR click, or a remount after a refresh, while
 * this SAME attempt is already `payment_authorizing` at the SAME quote
 * version and still within its authorization window, re-fetches and
 * returns the SAME PaymentIntent's client_secret rather than creating a
 * second one — Stripe's own idempotency key would already prevent a
 * literal duplicate, but this additionally avoids the extra network
 * round-trip and correctly reports "already_authorized" if Stripe
 * resolved in the meantime.
 */
export async function createPaymentAuthorization(checkoutAttemptId: string, fetchImpl?: typeof fetch): Promise<CreatePaymentAuthorizationResult> {
  const attempt = await prisma.checkoutAttempt.findUnique({ where: { id: checkoutAttemptId } });
  if (!attempt) {
    return { ok: false, error: "Intento de compra no encontrado." };
  }

  if (attempt.status === "payment_authorized") {
    return { ok: true, status: "already_authorized", checkoutAttemptId };
  }

  if (attempt.status === "payment_authorizing") {
    if (!attempt.stripePaymentIntentId || attempt.paymentIntentQuoteVersion !== attempt.finalQuoteSnapshotVersion || !attempt.paymentAuthorizationExpiresAt || attempt.paymentAuthorizationExpiresAt.getTime() <= Date.now()) {
      return { ok: false, error: "Ya hay una autorización de pago en curso para este intento — espera unos segundos o recarga la página." };
    }
    let authorization: PaymentAuthorization;
    try {
      authorization = await getAuthorization(attempt.stripePaymentIntentId);
    } catch {
      return { ok: false, error: "No se pudo comprobar el estado del pago con Stripe — inténtalo de nuevo." };
    }
    if (authorization.status === "authorized") {
      const outcome = await verifyAndApplyAuthorization(checkoutAttemptId, authorization);
      if (outcome.outcome === "authorized") {
        return { ok: true, status: "already_authorized", checkoutAttemptId };
      }
    }
    if (!authorization.clientSecret) {
      return { ok: false, error: "No se pudo recuperar el pago en curso — inténtalo de nuevo." };
    }
    return { ok: true, status: "action_required", checkoutAttemptId, clientSecret: authorization.clientSecret, publishableKey: stripeConfig.publishableKey, refreshed: false };
  }

  if (attempt.status !== "ready_to_pay") {
    return { ok: false, error: "Este intento no está listo para pagar." };
  }

  const payable = await ensureCheckoutAttemptPayable(checkoutAttemptId, fetchImpl);
  if (!payable.ok) {
    return { ok: false, error: payable.error };
  }

  let amountMinorUnits: number;
  try {
    amountMinorUnits = toStripeMinorUnits(payable.snapshot.commercial.pvpTotal, payable.snapshot.commercial.currency);
  } catch (err) {
    await transitionCheckoutAttempt(checkoutAttemptId, "failed");
    return { ok: false, error: err instanceof Error ? err.message : "Moneda no soportada para el pago." };
  }

  // §8 — a PaymentIntent left over from a superseded quote version is
  // never reused: best-effort cancel it before creating the current one.
  // Failure to cancel (already succeeded/canceled at Stripe) is not
  // fatal — the NEW idempotency key below guarantees a fresh
  // PaymentIntent regardless.
  const freshAttempt = await prisma.checkoutAttempt.findUniqueOrThrow({ where: { id: checkoutAttemptId } });
  if (freshAttempt.stripePaymentIntentId && freshAttempt.paymentIntentQuoteVersion !== payable.quoteVersion) {
    try {
      await cancelAuthorization(freshAttempt.stripePaymentIntentId);
    } catch {
      // best-effort only — see doc comment above.
    }
  }

  await transitionCheckoutAttempt(checkoutAttemptId, "payment_authorizing");
  const paymentAuthorizationExpiresAt = new Date(Date.now() + PAYMENT_AUTHORIZATION_WINDOW_MS);
  await prisma.checkoutAttempt.update({ where: { id: checkoutAttemptId }, data: { paymentStatus: "authorizing", paymentAuthorizationExpiresAt } });

  const idempotencyKey = paymentIntentCreateIdempotencyKey(checkoutAttemptId, payable.quoteVersion);
  let authorization: PaymentAuthorization;
  try {
    authorization = await createAuthorization({
      amountMinorUnits,
      currency: payable.snapshot.commercial.currency,
      idempotencyKey,
      // §6 — correlation only, never PII (no email/name/phone).
      metadata: { checkout_attempt_id: checkoutAttemptId, trip_id: attempt.tripId },
    });
  } catch (err) {
    await transitionCheckoutAttempt(checkoutAttemptId, "failed");
    await recordCheckoutAttemptEvent(checkoutAttemptId, "payment_failed", { sanitizedDetail: JSON.stringify({ reason: err instanceof Error ? err.message : String(err) }) });
    return { ok: false, error: "No se pudo iniciar el pago con Stripe. Inténtalo de nuevo." };
  }

  await prisma.checkoutAttempt.update({ where: { id: checkoutAttemptId }, data: { stripePaymentIntentId: authorization.providerReference, paymentIntentQuoteVersion: payable.quoteVersion } });
  await recordCheckoutAttemptEvent(checkoutAttemptId, "payment_authorization_created", { providerReference: authorization.providerReference, sanitizedDetail: JSON.stringify({ rawStatus: authorization.rawStatus, quoteVersion: payable.quoteVersion }) });

  if (!authorization.clientSecret) {
    return { ok: false, error: "Stripe no devolvió un client_secret." };
  }
  return { ok: true, status: "action_required", checkoutAttemptId, clientSecret: authorization.clientSecret, publishableKey: stripeConfig.publishableKey, refreshed: payable.refreshed };
}

export type VerifyAuthorizationOutcome = { outcome: "authorized" } | { outcome: "still_authorizing" } | { outcome: "failed" } | { outcome: "voided" } | { outcome: "rejected"; reason: string };

/**
 * Fase 3A §13 — the ONE place that ever moves CheckoutAttempt into
 * PAYMENT_AUTHORIZED. Called by both the webhook handler and the
 * poll/resume path (§17) with a FRESH PaymentAuthorization (always a
 * just-fetched/just-received Stripe PaymentIntent, never a locally
 * cached copy) — never trusts `authorization.metadata` alone: the
 * PaymentIntent id, amount, currency, capture_method, and metadata are
 * ALL cross-checked against what THIS CheckoutAttempt itself stored
 * before any transition happens. A mismatch on any of those rejects
 * without touching CheckoutAttempt.status at all (§13 K — "PaymentIntent
 * id incorrecto -> no transicionar"). Idempotent: re-applying the same
 * already-resolved status again returns the same outcome without a
 * second write once no longer in payment_authorizing (see the
 * short-circuits below) — safe to call more than once for the same
 * event.
 */
export async function verifyAndApplyAuthorization(checkoutAttemptId: string, authorization: PaymentAuthorization): Promise<VerifyAuthorizationOutcome> {
  async function reject(reason: string): Promise<VerifyAuthorizationOutcome> {
    await recordCheckoutAttemptEvent(checkoutAttemptId, "payment_unverifiable", { providerReference: authorization.providerReference, sanitizedDetail: JSON.stringify({ reason }) });
    return { outcome: "rejected", reason };
  }

  const attempt = await prisma.checkoutAttempt.findUnique({ where: { id: checkoutAttemptId } });
  if (!attempt) return reject("checkout_attempt_not_found");
  if (attempt.stripePaymentIntentId !== authorization.providerReference) return reject("payment_intent_id_mismatch");

  if (attempt.status === "payment_authorized") return { outcome: "authorized" };
  if (attempt.status !== "payment_authorizing") return reject(`unexpected_attempt_status:${attempt.status}`);

  const snapshot = parseFinalQuoteSnapshot(attempt.finalQuoteSnapshot);
  if (!snapshot) return reject("no_snapshot");

  let expectedAmount: number;
  try {
    expectedAmount = toStripeMinorUnits(snapshot.commercial.pvpTotal, snapshot.commercial.currency);
  } catch {
    return reject("unsupported_currency");
  }
  if (authorization.amountMinorUnits !== expectedAmount) return reject("amount_mismatch");
  if (authorization.currency !== snapshot.commercial.currency) return reject("currency_mismatch");
  if (authorization.captureMethod !== "manual") return reject("capture_method_mismatch");
  if (authorization.metadata.checkout_attempt_id !== checkoutAttemptId) return reject("metadata_mismatch");

  switch (authorization.status) {
    case "authorized": {
      if (authorization.amountCapturableMinorUnits !== expectedAmount) return reject("amount_capturable_mismatch");
      await transitionCheckoutAttempt(checkoutAttemptId, "payment_authorized");
      await prisma.checkoutAttempt.update({ where: { id: checkoutAttemptId }, data: { paymentStatus: "authorized" } });
      await recordCheckoutAttemptEvent(checkoutAttemptId, "payment_authorized", { providerReference: authorization.providerReference, sanitizedDetail: JSON.stringify({ rawStatus: authorization.rawStatus }) });
      return { outcome: "authorized" };
    }
    case "authorizing": {
      if (authorization.rawStatus === "requires_action") {
        await recordCheckoutAttemptEvent(checkoutAttemptId, "payment_requires_action", { providerReference: authorization.providerReference });
      }
      return { outcome: "still_authorizing" };
    }
    case "failed": {
      // §15/N — a known, retryable failure: the SAME PaymentIntent stays
      // usable for a retry with a different payment method, so the
      // CheckoutAttempt itself stays in payment_authorizing (never
      // FAILED here — that would release the TicketHold over a single
      // declined card).
      await prisma.checkoutAttempt.update({ where: { id: checkoutAttemptId }, data: { paymentStatus: "failed" } });
      await recordCheckoutAttemptEvent(checkoutAttemptId, "payment_failed", { providerReference: authorization.providerReference, sanitizedDetail: JSON.stringify({ code: authorization.lastPaymentErrorCode }) });
      return { outcome: "failed" };
    }
    case "voided": {
      await transitionCheckoutAttempt(checkoutAttemptId, "failed");
      await prisma.checkoutAttempt.update({ where: { id: checkoutAttemptId }, data: { paymentStatus: "voided" } });
      await recordCheckoutAttemptEvent(checkoutAttemptId, "payment_voided", { providerReference: authorization.providerReference });
      return { outcome: "voided" };
    }
    default:
      return reject("unrecognized_status");
  }
}

export type AbandonmentReleaseOutcome = { released: boolean; reason: string };

/**
 * Fase 3A §14 — reviews ONE CheckoutAttempt currently stuck in
 * payment_authorizing past its own paymentAuthorizationExpiresAt (a
 * customer closed the tab mid-3DS, or simply never came back) and
 * decides, per §14's own domain rules, whether it is SAFE to release —
 * never on elapsed time alone. No cron/scheduler is wired up in this
 * phase (§14 "no implementar todavía un cron sofisticado") — this is a
 * plain, synchronously-callable, fully-testable function a future
 * scheduled sweep can call per attempt.
 */
export async function releaseAbandonedPaymentAuthorizing(checkoutAttemptId: string): Promise<AbandonmentReleaseOutcome> {
  const attempt = await prisma.checkoutAttempt.findUnique({ where: { id: checkoutAttemptId } });
  if (!attempt) return { released: false, reason: "not_found" };
  if (attempt.status !== "payment_authorizing") return { released: false, reason: `not_in_payment_authorizing:${attempt.status}` };
  if (!attempt.paymentAuthorizationExpiresAt || attempt.paymentAuthorizationExpiresAt.getTime() > Date.now()) {
    return { released: false, reason: "window_not_expired" };
  }

  if (!attempt.stripePaymentIntentId) {
    // Never even reached Stripe — trivially safe: nothing to verify.
    await transitionCheckoutAttempt(checkoutAttemptId, "failed");
    await recordCheckoutAttemptEvent(checkoutAttemptId, "payment_abandoned_released", { sanitizedDetail: JSON.stringify({ reason: "no_payment_intent" }) });
    return { released: true, reason: "no_payment_intent" };
  }

  let authorization: PaymentAuthorization;
  try {
    authorization = await getAuthorization(attempt.stripePaymentIntentId);
  } catch {
    // §14/R — Stripe's own result could not be verified: never release
    // blindly (a bank-side hold may still exist). Parks in
    // recovery_required for a future human/admin resolution rather than
    // guessing either way.
    await transitionCheckoutAttempt(checkoutAttemptId, "recovery_required");
    await recordCheckoutAttemptEvent(checkoutAttemptId, "payment_unverifiable", { sanitizedDetail: JSON.stringify({ reason: "stripe_unreachable_during_abandonment_check" }) });
    return { released: false, reason: "stripe_unverifiable" };
  }

  switch (authorization.rawStatus) {
    case "requires_payment_method":
    case "canceled": {
      // §14 — Stripe confirms no authorization ever completed and the
      // window has expired: safe to release. Best-effort cancel at
      // Stripe too (a no-op if it's already canceled).
      try {
        await cancelAuthorization(attempt.stripePaymentIntentId);
      } catch {
        // best-effort only.
      }
      await transitionCheckoutAttempt(checkoutAttemptId, "failed");
      await prisma.checkoutAttempt.update({ where: { id: checkoutAttemptId }, data: { paymentStatus: authorization.rawStatus === "canceled" ? "voided" : "failed" } });
      await recordCheckoutAttemptEvent(checkoutAttemptId, "payment_abandoned_released", { providerReference: authorization.providerReference, sanitizedDetail: JSON.stringify({ stripeStatus: authorization.rawStatus }) });
      return { released: true, reason: authorization.rawStatus };
    }
    case "requires_capture": {
      // §14 Q — Stripe says it IS authorized: self-heal instead of
      // releasing, exactly as if the webhook/poll had reached us in time.
      const outcome = await verifyAndApplyAuthorization(checkoutAttemptId, authorization);
      return { released: false, reason: `self_healed:${outcome.outcome}` };
    }
    default:
      // requires_action / requires_confirmation / processing / an
      // unexpected succeeded — genuinely still in flight (e.g. mid-3DS in
      // another tab): never release.
      return { released: false, reason: `not_safe_to_release:${authorization.rawStatus}` };
  }
}
