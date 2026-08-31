import type { PaymentProviderKind } from "@prisma/client";
import { prisma } from "@/lib/db";
import { generateAccessToken, generateBookingReference } from "@/lib/utils";
import { parseFinalQuoteSnapshot } from "./finalQuoteSnapshot";
import { confirmTicketHold } from "./ticketHold";
import { transitionCheckoutAttempt } from "./transitions";
import { recordCheckoutAttemptEvent } from "./events";

export type FinalizeBuyerInput = {
  buyerFirstName: string;
  buyerLastName: string;
  buyerEmail: string;
  buyerPhone: string;
  originCity?: string;
  billingAddress?: string;
  // Caller's choice — this phase never actually calls Stripe/PayPal; the
  // value is only recorded on the resulting Booking for consistency with
  // the existing model.
  paymentProvider: PaymentProviderKind;
};

export type FinalizeInput = { buyer: FinalizeBuyerInput };

export type FinalizeResult = { ok: true; alreadyFinalized: boolean; bookingId: string; reference: string; accessToken: string } | { ok: false; error: string };

/**
 * §13/§14/§15 of this phase's brief. Preconditions (read-only, no writes,
 * no event recorded — these are "should we even try", not "we tried and
 * failed"):
 *   - already confirmed with a bookingId -> idempotent short-circuit,
 *     returns the existing Booking, no new work.
 *   - status must be `finalizing`.
 *   - paymentStatus must be `captured`.
 *   - hotelStatus/flightStatus, when not null (i.e. this modality has
 *     that component), must be `confirmed`.
 *   - a FinalQuoteSnapshot must exist and parse.
 *   - at least one HELD TicketHold must exist to confirm.
 *
 * Once those pass, `finalization_started` is recorded (its own write,
 * always committed regardless of what happens next) and the actual
 * mutation — confirm ticket hold(s), create Booking + Travelers, link
 * CheckoutAttempt.bookingId, transition to CONFIRMED — runs inside ONE
 * Prisma transaction. If ANYTHING inside that transaction throws (e.g.
 * a traveler-count mismatch caught mid-transaction, or a genuine local DB
 * error), the whole transaction rolls back atomically: no Booking, no
 * Traveler rows, the TicketHold stays HELD, and CheckoutAttempt.status is
 * simply never touched — it stays `finalizing`. Per §15, this function
 * NEVER transitions the attempt to failed/recovery_required on a local
 * failure, and NEVER calls anything external (there is nothing external
 * to call in this phase) — a local failure here is always safe to retry
 * by calling this function again with corrected input.
 *
 * Fase 2 §6/§26 — travelers are no longer supplied by the caller. They
 * come exclusively from CheckoutAttemptTraveler, persisted earlier in the
 * saga by prepareCheckoutAttempt (see prepareCheckoutAttempt.ts) — a
 * single source of truth for pre-payment traveler PII, never re-supplied
 * or re-typed at finalization time. The FinalizeInput type reflects this:
 * it now carries only `buyer` (still not persisted anywhere pre-payment —
 * see prepareCheckoutAttempt.ts's own doc comment on that scope
 * boundary).
 */
export async function finalizeConfirmedCheckoutAttempt(checkoutAttemptId: string, input: FinalizeInput): Promise<FinalizeResult> {
  const attempt = await prisma.checkoutAttempt.findUniqueOrThrow({ where: { id: checkoutAttemptId }, include: { ticketHolds: true } });

  if (attempt.status === "confirmed" && attempt.bookingId) {
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: attempt.bookingId } });
    return { ok: true, alreadyFinalized: true, bookingId: booking.id, reference: booking.reference, accessToken: booking.accessToken };
  }

  if (attempt.status !== "finalizing") {
    return { ok: false, error: `CheckoutAttempt is in ${attempt.status}, not finalizing — refusing to finalize.` };
  }
  if (attempt.paymentStatus !== "captured") {
    return { ok: false, error: `Payment is ${attempt.paymentStatus}, not captured — refusing to finalize.` };
  }
  if (attempt.hotelStatus !== null && attempt.hotelStatus !== "confirmed") {
    return { ok: false, error: `Hotel component is ${attempt.hotelStatus}, not confirmed — refusing to finalize.` };
  }
  if (attempt.flightStatus !== null && attempt.flightStatus !== "confirmed") {
    return { ok: false, error: `Flight component is ${attempt.flightStatus}, not confirmed — refusing to finalize.` };
  }
  const snapshot = parseFinalQuoteSnapshot(attempt.finalQuoteSnapshot);
  if (!snapshot) {
    return { ok: false, error: "No FinalQuoteSnapshot exists for this attempt — refusing to finalize." };
  }
  const heldHolds = attempt.ticketHolds.filter((h) => h.status === "held");
  if (heldHolds.length === 0) {
    return { ok: false, error: "No HELD TicketHold to confirm for this attempt — refusing to finalize." };
  }

  await recordCheckoutAttemptEvent(checkoutAttemptId, "finalization_started");

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Re-read the persisted travelers INSIDE the transaction — a real
      // local data-integrity precondition, and (deliberately) the one
      // check capable of throwing mid-transaction to exercise a genuine
      // rollback, per test scenario O.
      const persistedTravelers = await tx.checkoutAttemptTraveler.findMany({ where: { checkoutAttemptId }, orderBy: { order: "asc" } });
      if (persistedTravelers.length !== attempt.partySize) {
        throw new Error(`Expected ${attempt.partySize} persisted CheckoutAttemptTraveler rows, found ${persistedTravelers.length}.`);
      }

      for (const hold of heldHolds) {
        await confirmTicketHold(hold.id, tx);
      }

      const reference = generateBookingReference();
      const accessToken = generateAccessToken();

      const booking = await tx.booking.create({
        data: {
          reference,
          tripId: attempt.tripId,
          buyerFirstName: input.buyer.buyerFirstName,
          buyerLastName: input.buyer.buyerLastName,
          buyerEmail: input.buyer.buyerEmail,
          buyerPhone: input.buyer.buyerPhone,
          originCity: input.buyer.originCity ?? "",
          billingAddress: input.buyer.billingAddress ?? "",
          travelersCount: attempt.partySize,
          totalPrice: snapshot.commercial.pvpTotal,
          currency: snapshot.commercial.currency,
          paymentProvider: input.buyer.paymentProvider,
          paymentStatus: "paid",
          bookingStatus: "confirmed",
          accessToken,
          packageType: attempt.packageType,
          partySize: attempt.partySize,
          ticketCount: attempt.partySize,
          hotelSelectionSnapshot: snapshot.hotel ? JSON.stringify(snapshot.hotel) : "",
          flightSelectionSnapshot: snapshot.flight ? JSON.stringify(snapshot.flight) : "",
          roomingSnapshot: snapshot.hotel ? JSON.stringify(snapshot.hotel.roomingIntent) : "",
          priceBreakdownSnapshot: JSON.stringify(snapshot.commercial),
        },
      });

      await tx.traveler.createMany({
        data: persistedTravelers.map((t, index) => ({
          bookingId: booking.id,
          firstName: t.firstName,
          lastName: t.lastName,
          birthDate: t.birthDate,
          nationality: t.nationality,
          docType: t.docType,
          docNumber: t.docNumber,
          docExpiry: t.docExpiry,
          docCountry: t.docCountry,
          phone: t.phone,
          emergencyContactName: t.emergencyContactName,
          emergencyContactPhone: t.emergencyContactPhone,
          originAirport: t.originAirport,
          title: t.title,
          gender: t.gender,
          email: t.email,
          order: index,
        })),
      });

      await tx.checkoutAttempt.update({ where: { id: checkoutAttemptId }, data: { bookingId: booking.id } });
      await transitionCheckoutAttempt(checkoutAttemptId, "confirmed", tx);

      return { bookingId: booking.id, reference: booking.reference, accessToken: booking.accessToken };
    });

    await recordCheckoutAttemptEvent(checkoutAttemptId, "finalization_completed", { providerReference: result.reference });
    return { ok: true, alreadyFinalized: false, ...result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordCheckoutAttemptEvent(checkoutAttemptId, "finalization_failed", { sanitizedDetail: JSON.stringify({ message }) });
    // Deliberately no status transition here — the attempt stays
    // `finalizing`, exactly as §15 requires: no external service was
    // touched, so there is nothing to compensate, and calling this
    // function again with corrected input is always safe.
    return { ok: false, error: "Finalization failed locally; the attempt remains retryable. No external service was contacted." };
  }
}
