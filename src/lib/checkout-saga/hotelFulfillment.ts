import type { CheckoutAttempt } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recordCheckoutAttemptEvent } from "./events";
import { parseFinalQuoteSnapshot, type FinalQuoteSnapshot, type FinalQuoteSnapshotHotel } from "./finalQuoteSnapshot";
import { bookPrebook, findHotelBookingByClientReference, cancelHotelBooking } from "@/lib/providers/hotels/nuitee";
import type { HotelBookingGuest, HotelBookingResult } from "@/lib/providers/hotels/nuitee/types";
import { ProviderError } from "@/lib/providers/errors";
import { cancelAuthorization } from "@/lib/providers/payments/stripe/authorization";

/**
 * Fase 3B.2 — everything about actually getting a Nuitee SANDBOX hotel
 * booked, called exclusively from capture.ts's `fulfilling` step, BEFORE
 * Stripe capture is ever attempted (§1 "Nuitee BOOK ANTES DE Stripe
 * CAPTURE"). Mirrors capture.ts's own capturePaymentIntent() in spirit:
 * this module only ever RETURNS an outcome and mutates hotelStatus/
 * hotelClientReference/hotelBookSnapshot/hotelProviderReference plus
 * provider-side actions (BOOK/cancel/void) it directly owns — it NEVER
 * calls transitionCheckoutAttempt() itself; every CheckoutAttempt.status
 * transition stays capture.ts's job, exactly like capturePaymentIntent's
 * own division of labor for Stripe capture.
 *
 * §19 — no Prisma transaction is ever held open across a Nuitee HTTP call:
 * every mutation here is its own short `update`/`updateMany`, and the
 * provider call itself always happens outside any transaction.
 */

export type HotelFulfillmentOutcome =
  | { outcome: "not_applicable" } // TICKET_ONLY — no hotel component at all
  | { outcome: "confirmed" } // hotel already CONFIRMED (idempotent short-circuit, or just became so)
  | { outcome: "in_progress" } // another concurrent call already claimed the BOOK step
  | { outcome: "retry" } // ambiguous BOOK call + confirmed absence -> safe to retry with the SAME clientReference
  | { outcome: "not_auto_bookable" } // this rate never qualified for 3B.2 auto-booking — Stripe voided, attempt failed
  | { outcome: "window_expired" } // safe-cancellation window no longer covers the remaining flow — Stripe voided, attempt failed
  | { outcome: "recovery_required"; reason: string }
  | { outcome: "failed_confirmed_absent" }; // BOOK definitively failed with confirmed absence — Stripe voided, attempt failed

export type HotelCompensationOutcome = { outcome: "compensated_clean" } | { outcome: "recovery_required"; reason: string };

/** Fase 3B.2 §7 — deterministic, persisted once, never regenerated for a retry of the SAME attempt+quote version. */
function hotelClientReferenceFor(checkoutAttemptId: string, quoteVersion: number): string {
  return `cdf_hotel_${checkoutAttemptId}_v${quoteVersion}`;
}

/**
 * Best-effort: reaching here means the PaymentIntent should never be
 * captured, but it may already be voided/expired on Stripe's side — same
 * "best-effort, never fatal" convention as payment.ts's own superseded-
 * PaymentIntent cancel.
 */
async function voidStripeAuthorizationBestEffort(attempt: Pick<CheckoutAttempt, "stripePaymentIntentId">): Promise<void> {
  if (!attempt.stripePaymentIntentId) return;
  try {
    await cancelAuthorization(attempt.stripePaymentIntentId);
  } catch {
    // best-effort only.
  }
}

/**
 * §10 — CDF's own roomingIntent (from the accepted FinalQuoteSnapshot)
 * maps directly to Nuitee's occupancyNumber the same way
 * roomMixToOccupancies already does elsewhere: room index i (0-based) ->
 * occupancyNumber i+1. Every traveler sharing a room shares that room's
 * occupancyNumber. Never reconstructed from BOOK's own response.
 */
function buildBookingGuests(roomingIntent: FinalQuoteSnapshotHotel["roomingIntent"], travelers: { firstName: string; lastName: string; email: string }[], buyerEmail: string): HotelBookingGuest[] {
  const guests: HotelBookingGuest[] = [];
  roomingIntent.forEach((room, i) => {
    const occupancyNumber = i + 1;
    for (const travelerIndex of room.travelerIndices) {
      const t = travelers[travelerIndex];
      if (!t) continue;
      guests.push({ occupancyNumber, firstName: t.firstName, lastName: t.lastName, email: t.email || buyerEmail });
    }
  });
  return guests;
}

function isConfirmedBookingStatus(status: string): boolean {
  return status.toUpperCase().includes("CONFIRM");
}

/**
 * §11 — post-BOOK validation against what the customer actually accepted.
 * The price tolerance is deliberately NOT a fabricated fixed euro amount
 * (explicitly forbidden by the brief): it reuses this specific booking's
 * own already-computed commercial margin (orgFee + buffer) as the ceiling
 * a provider-side price increase may consume before it must block capture
 * — a real, domain-grounded number, never an invented one. A price
 * DECREASE never blocks (it only improves our own margin, never changes
 * the customer's already-authorized PVP).
 */
function validateBookedAgainstAccepted(hotel: FinalQuoteSnapshotHotel, snapshot: FinalQuoteSnapshot, bookResult: HotelBookingResult): { ok: true } | { ok: false; reason: string } {
  if (!isConfirmedBookingStatus(bookResult.status)) return { ok: false, reason: `unconfirmed_status:${bookResult.status}` };
  if (bookResult.currency && bookResult.currency !== hotel.price.currency) return { ok: false, reason: "currency_mismatch" };
  if (bookResult.totalPrice > 0) {
    const allowedDelta = snapshot.commercial.orgFee + snapshot.commercial.buffer;
    const delta = bookResult.totalPrice - hotel.price.total;
    if (delta > allowedDelta) return { ok: false, reason: "price_exceeds_allowed_margin" };
  }
  return { ok: true };
}

function buildHotelBookSnapshotJson(hotel: FinalQuoteSnapshotHotel, bookResult: HotelBookingResult): string {
  return JSON.stringify({
    bookingId: bookResult.bookingId,
    supplierBookingId: bookResult.supplierBookingId,
    hotelConfirmationCode: bookResult.hotelConfirmationCode,
    status: bookResult.status,
    bookedAt: new Date().toISOString(),
    hotelId: hotel.hotelId,
    name: hotel.name,
    address: hotel.address,
    checkIn: hotel.checkIn,
    checkOut: hotel.checkOut,
    roomMix: hotel.roomMix,
    roomingIntent: hotel.roomingIntent,
    board: hotel.board,
    price: { total: bookResult.totalPrice > 0 ? bookResult.totalPrice : hotel.price.total, currency: bookResult.currency || hotel.price.currency },
    includedTaxesAndFees: hotel.includedTaxesAndFees,
    excludedTaxesAndFees: hotel.excludedTaxesAndFees,
    refundable: hotel.refundable,
  });
}

/** §17/§5 — reached only when we KNOW for certain no BOOK will ever be attempted or none exists: void Stripe, mark the hotel component failed. Never touches CheckoutAttempt.status — the caller transitions to "failed". */
async function refuseAndFail(attempt: Pick<CheckoutAttempt, "id" | "stripePaymentIntentId">, eventReason: string): Promise<void> {
  await voidStripeAuthorizationBestEffort(attempt);
  await prisma.checkoutAttempt.update({ where: { id: attempt.id }, data: { hotelStatus: "failed" } });
  await recordCheckoutAttemptEvent(attempt.id, "hotel_book_failed", { sanitizedDetail: JSON.stringify({ reason: eventReason }) });
}

async function markHotelUnknown(checkoutAttemptId: string, reason: string): Promise<void> {
  await prisma.checkoutAttempt.update({ where: { id: checkoutAttemptId }, data: { hotelStatus: "unknown" } });
  await recordCheckoutAttemptEvent(checkoutAttemptId, "hotel_book_ambiguous", { sanitizedDetail: JSON.stringify({ reason }) });
}

async function confirmBooking(attempt: Pick<CheckoutAttempt, "id">, hotel: FinalQuoteSnapshotHotel, bookResult: HotelBookingResult, eventType: "hotel_booked" | "hotel_book_reconciled"): Promise<void> {
  await prisma.checkoutAttempt.update({
    where: { id: attempt.id },
    data: { hotelStatus: "confirmed", hotelProviderReference: bookResult.bookingId, hotelBookSnapshot: buildHotelBookSnapshotJson(hotel, bookResult) },
  });
  await recordCheckoutAttemptEvent(attempt.id, eventType, { providerReference: bookResult.bookingId, sanitizedDetail: JSON.stringify({ status: bookResult.status }) });
}

/**
 * §8 — the recovery procedure for a BOOK call whose outcome we could not
 * observe directly (a thrown error of ANY kind — network/timeout, or a
 * definitive-looking provider rejection like error 4005). NEVER assumes
 * success or failure on its own: always asks Nuitee, by clientReference,
 * what actually happened.
 *
 * `wasAmbiguousError` distinguishes the two cases §8 and §17 actually
 * need told apart once the lookup confirms ABSENCE: a communication
 * failure (we never learned whether Nuitee even processed the request)
 * makes a retry with the SAME clientReference safe (§8.3); a definitive
 * provider rejection that the lookup then confirms produced no booking is
 * §17's "BOOK falla definitivamente" — safe to fail and void Stripe,
 * never to retry.
 */
async function reconcileByClientReference(attempt: CheckoutAttempt, hotel: FinalQuoteSnapshotHotel, clientReference: string, wasAmbiguousError: boolean, fetchImpl?: typeof fetch): Promise<HotelFulfillmentOutcome> {
  if (!clientReference) {
    await markHotelUnknown(attempt.id, "no_client_reference_to_reconcile");
    return { outcome: "recovery_required", reason: "no_client_reference_to_reconcile" };
  }

  let matches: HotelBookingResult[];
  try {
    matches = await findHotelBookingByClientReference(clientReference, fetchImpl);
  } catch {
    await markHotelUnknown(attempt.id, "lookup_unreachable");
    return { outcome: "recovery_required", reason: "lookup_unreachable" };
  }

  const confirmed = matches.filter((m) => isConfirmedBookingStatus(m.status));
  if (confirmed.length === 1) {
    await confirmBooking(attempt, hotel, confirmed[0], "hotel_book_reconciled");
    return { outcome: "confirmed" };
  }
  if (matches.length === 0) {
    // Reliable, confirmed absence.
    if (wasAmbiguousError) {
      // §8.3 — release the claim so a future progress call retries BOOK
      // with this SAME clientReference; never a second, different one.
      await prisma.checkoutAttempt.update({ where: { id: attempt.id }, data: { hotelStatus: "prebooked" } });
      await recordCheckoutAttemptEvent(attempt.id, "hotel_book_ambiguous", { sanitizedDetail: JSON.stringify({ reason: "confirmed_absent_after_network_error_safe_to_retry" }) });
      return { outcome: "retry" };
    }
    await refuseAndFail(attempt, "confirmed_absent_after_definitive_rejection");
    return { outcome: "failed_confirmed_absent" };
  }
  // >1 confirmed, or matches exist but none confirmed — genuinely ambiguous.
  await markHotelUnknown(attempt.id, "ambiguous_lookup_result");
  return { outcome: "recovery_required", reason: "ambiguous_lookup_result" };
}

export async function progressHotelFulfillment(checkoutAttemptId: string, fetchImpl?: typeof fetch): Promise<HotelFulfillmentOutcome> {
  const attempt = await prisma.checkoutAttempt.findUniqueOrThrow({ where: { id: checkoutAttemptId } });

  if (attempt.hotelStatus === null) return { outcome: "not_applicable" };
  if (attempt.hotelStatus === "confirmed") return { outcome: "confirmed" };
  if (attempt.hotelStatus === "booking") return { outcome: "in_progress" };
  if (attempt.hotelStatus === "failed" || attempt.hotelStatus === "cancelled") return { outcome: "recovery_required", reason: `hotel_status_${attempt.hotelStatus}` };

  const snapshot = parseFinalQuoteSnapshot(attempt.finalQuoteSnapshot);
  const hotel = snapshot?.hotel ?? null;
  if (!snapshot || !hotel) {
    await markHotelUnknown(checkoutAttemptId, "no_hotel_in_snapshot");
    return { outcome: "recovery_required", reason: "no_hotel_in_snapshot" };
  }

  if (attempt.hotelStatus === "unknown") {
    return reconcileByClientReference(attempt, hotel, attempt.hotelClientReference, true, fetchImpl);
  }

  // attempt.hotelStatus === "prebooked" or "validated" — the fresh path.
  if (!hotel.autoBookability.autoBookable) {
    await refuseAndFail(attempt, `not_auto_bookable:${hotel.autoBookability.level}`);
    return { outcome: "not_auto_bookable" };
  }
  const safeUntil = hotel.autoBookability.hotelSafeCancellationUntil;
  if (!safeUntil || new Date(safeUntil).getTime() <= Date.now()) {
    await refuseAndFail(attempt, "hotel_safe_window_expired");
    return { outcome: "window_expired" };
  }

  let clientReference = attempt.hotelClientReference;
  if (!clientReference) {
    clientReference = hotelClientReferenceFor(checkoutAttemptId, attempt.finalQuoteSnapshotVersion);
    await prisma.checkoutAttempt.updateMany({ where: { id: checkoutAttemptId, hotelClientReference: "" }, data: { hotelClientReference: clientReference } });
  }

  // §19 — the atomic claim: only the caller whose updateMany actually
  // flips prebooked -> booking proceeds to call Nuitee. A concurrent
  // caller that loses the race observes count !== 1 and backs off.
  const claim = await prisma.checkoutAttempt.updateMany({ where: { id: checkoutAttemptId, hotelStatus: "prebooked" }, data: { hotelStatus: "booking" } });
  if (claim.count !== 1) return { outcome: "in_progress" };

  await recordCheckoutAttemptEvent(checkoutAttemptId, "hotel_book_started", { providerReference: clientReference });

  const travelers = await prisma.checkoutAttemptTraveler.findMany({ where: { checkoutAttemptId }, orderBy: { order: "asc" } });
  const guests = buildBookingGuests(hotel.roomingIntent, travelers, attempt.buyerEmail);
  const holder = { firstName: attempt.buyerFirstName, lastName: attempt.buyerLastName, email: attempt.buyerEmail };

  let bookResult: HotelBookingResult;
  try {
    bookResult = await bookPrebook(hotel.prebookId, clientReference, holder, guests, fetchImpl);
  } catch (err) {
    // §8/§7 — NEVER assume outcome from a thrown error, whatever its
    // shape: always reconcile by clientReference. Only a confirmed
    // NETWORK_ERROR (no response ever arrived) counts as the "safe to
    // retry on confirmed absence" case (§8.3); everything else Nuitee
    // actually answered with (including error 4005) is a definitive
    // response and, if absence is then confirmed, §17's failure path.
    const wasAmbiguous = err instanceof ProviderError && err.code === "NETWORK_ERROR";
    return reconcileByClientReference(attempt, hotel, clientReference, wasAmbiguous, fetchImpl);
  }

  const validation = validateBookedAgainstAccepted(hotel, snapshot, bookResult);
  if (!validation.ok) {
    const compensation = await compensateConfirmedHotelBooking(checkoutAttemptId, bookResult.bookingId, fetchImpl);
    if (compensation.outcome === "compensated_clean") {
      await refuseAndFail(attempt, `book_conditions_worse_than_accepted:${validation.reason}`);
      return { outcome: "failed_confirmed_absent" };
    }
    return { outcome: "recovery_required", reason: `book_conditions_worse_than_accepted:${validation.reason}:${compensation.reason}` };
  }

  await confirmBooking(attempt, hotel, bookResult, "hotel_booked");
  return { outcome: "confirmed" };
}

/**
 * §15 — only an unambiguous CANCELLED (never CANCELLED_WITH_CHARGES)
 * counts as clean, and only when `charges`, if present at all, is not a
 * positive number: Nuitee's own CANCELLED/CANCELLED_WITH_CHARGES status
 * split IS the charge signal (a plain CANCELLED never carries a separate
 * "confirmed zero" field in every shape this codebase has had to
 * consider) — but a status/charges combination that actively
 * CONTRADICTS itself (CANCELLED with a positive charges figure) is never
 * trusted over the more conservative reading.
 */
function isCleanCancel(status: string, charges: number | null): boolean {
  if (status.trim().toUpperCase() !== "CANCELLED") return false;
  if (typeof charges === "number" && charges > 0) return false;
  return true;
}

/**
 * §14/§15, corrected against LiteAPI's verified official docs — cancels
 * an already-CONFIRMED hotel booking (compensation: a definitive Stripe
 * capture failure after the hotel was booked, OR a post-BOOK validation
 * failure per §11). cancelHotelBooking() (book.ts) now owns its OWN full
 * reconciliation (PUT, then GET on 204/failure) and never throws — it
 * always resolves to either a real, nameable status or an explicit
 * "unknown" outcome, so this function's only job is deciding what that
 * outcome means for the CheckoutAttempt. Never touches
 * CheckoutAttempt.status beyond hotelStatus.
 */
export async function compensateConfirmedHotelBooking(checkoutAttemptId: string, hotelBookingId: string, fetchImpl?: typeof fetch): Promise<HotelCompensationOutcome> {
  await prisma.checkoutAttempt.update({ where: { id: checkoutAttemptId }, data: { hotelStatus: "cancelling" } });
  await recordCheckoutAttemptEvent(checkoutAttemptId, "hotel_cancel_started", { providerReference: hotelBookingId });

  const cancelOutcome = await cancelHotelBooking(hotelBookingId, fetchImpl);

  if (cancelOutcome.outcome === "unknown") {
    await recordCheckoutAttemptEvent(checkoutAttemptId, "hotel_cancel_ambiguous", { sanitizedDetail: JSON.stringify({ reason: cancelOutcome.reason }) });
    return { outcome: "recovery_required", reason: "cancel_unverifiable" };
  }

  const { result } = cancelOutcome;
  if (isCleanCancel(result.status, result.charges)) {
    await prisma.checkoutAttempt.update({ where: { id: checkoutAttemptId }, data: { hotelStatus: "cancelled" } });
    await recordCheckoutAttemptEvent(checkoutAttemptId, "hotel_cancelled", { providerReference: hotelBookingId, sanitizedDetail: JSON.stringify({ status: result.status }) });
    return { outcome: "compensated_clean" };
  }

  await recordCheckoutAttemptEvent(checkoutAttemptId, "hotel_cancel_ambiguous", {
    providerReference: hotelBookingId,
    sanitizedDetail: JSON.stringify({ status: result.status, charges: result.charges }),
  });
  return { outcome: "recovery_required", reason: `cancel_not_clean:${result.status}` };
}
