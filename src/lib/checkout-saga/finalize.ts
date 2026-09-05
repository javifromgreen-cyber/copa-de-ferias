import { prisma } from "@/lib/db";
import { generateAccessToken, generateBookingReference } from "@/lib/utils";
import { parseFinalQuoteSnapshot } from "./finalQuoteSnapshot";
import { confirmTicketHold } from "./ticketHold";
import { transitionCheckoutAttempt } from "./transitions";
import { recordCheckoutAttemptEvent } from "./events";

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
 * or re-typed at finalization time.
 *
 * Fase 2.5 §6 — the buyer is now the same story: this function takes NO
 * second argument at all. Buyer fields are read exclusively from the
 * CheckoutAttempt row itself (persisted earlier by
 * persistCheckoutAttemptBuyer, called from prepareCheckoutAttempt — see
 * checkoutAttemptBuyer.ts), so a caller can no longer substitute a
 * different buyer at finalize time than the one the customer actually
 * validated pre-payment. If that data is somehow missing (e.g. an old
 * attempt from before this phase, or a bug upstream), finalization refuses
 * rather than falling back to blank/invented values.
 */
export async function finalizeConfirmedCheckoutAttempt(checkoutAttemptId: string): Promise<FinalizeResult> {
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
  if (!attempt.buyerEmail || !attempt.buyerFirstName || !attempt.buyerLastName || !attempt.buyerPhone) {
    return { ok: false, error: "No buyer has been persisted for this attempt — refusing to finalize." };
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
      // Fase 3B.1 audit finding — the preconditions above were all
      // checked OUTSIDE this transaction, against a snapshot of `attempt`
      // read before it started. Two genuinely concurrent calls to this
      // function (a double "confirmar reserva" click, or the browser and
      // the payment_intent.succeeded webhook both reconciling the same
      // attempt at once) could both pass those checks, both reach here,
      // and — without this lock — both create their own Booking for the
      // same CheckoutAttempt (CheckoutAttempt.bookingId being `@unique`
      // does NOT prevent this: each transaction sets it to a DIFFERENT,
      // newly-created booking id, so the uniqueness constraint never
      // fires). `SELECT ... FOR UPDATE` on the CheckoutAttempt row itself
      // closes that gap exactly like acquireTicketHold's own row lock
      // does for stock (ticketHold.ts): the second transaction blocks
      // here until the first commits, then the re-check just below sees
      // the now-committed bookingId and returns the SAME booking instead
      // of creating a second one.
      await tx.$executeRaw`SELECT "id" FROM "CheckoutAttempt" WHERE "id" = ${checkoutAttemptId} FOR UPDATE`;
      const lockedAttempt = await tx.checkoutAttempt.findUniqueOrThrow({ where: { id: checkoutAttemptId } });
      if (lockedAttempt.status === "confirmed" && lockedAttempt.bookingId) {
        const existingBooking = await tx.booking.findUniqueOrThrow({ where: { id: lockedAttempt.bookingId } });
        return { bookingId: existingBooking.id, reference: existingBooking.reference, accessToken: existingBooking.accessToken, alreadyFinalized: true };
      }

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
          buyerFirstName: attempt.buyerFirstName,
          buyerLastName: attempt.buyerLastName,
          buyerEmail: attempt.buyerEmail,
          buyerPhone: attempt.buyerPhone,
          originCity: attempt.buyerOriginCity,
          billingAddress: attempt.buyerBillingAddress,
          travelersCount: attempt.partySize,
          totalPrice: snapshot.commercial.pvpTotal,
          currency: snapshot.commercial.currency,
          paymentProvider: attempt.paymentProviderChoice,
          paymentStatus: "paid",
          bookingStatus: "confirmed",
          accessToken,
          packageType: attempt.packageType,
          partySize: attempt.partySize,
          ticketCount: attempt.partySize,
          hotelSelectionSnapshot: snapshot.hotel ? JSON.stringify(snapshot.hotel) : "",
          flightSelectionSnapshot: snapshot.flight ? JSON.stringify(snapshot.flight) : "",
          roomingSnapshot: snapshot.hotel ? JSON.stringify(snapshot.hotel.roomingIntent) : "",
          // Fase 3B.1 audit finding — this must match the shape Mi Viaje
          // actually reads (PriceBreakdownSnapshot in
          // src/lib/mi-viaje/atuAireSnapshots.ts: { perPerson, total,
          // ticketSelections }), NOT FinalQuoteSnapshot.commercial's own
          // shape verbatim — those are two different, unrelated JSON
          // schemas that happen to share this one column. Writing
          // snapshot.commercial directly here (as this function did
          // before this audit) would silently break buildAtuAireMiViajeView's
          // ticket rendering for every booking created through this real
          // checkout saga: ticketSelections would parse as undefined, and
          // no ticket/category would ever show in Mi Viaje.
          priceBreakdownSnapshot: JSON.stringify({
            perPerson: snapshot.commercial.pvpPerPerson,
            total: snapshot.commercial.pvpTotal,
            ticketSelections: Object.fromEntries(snapshot.ticket.map((line) => [line.eventId, line.category])),
          }),
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

      return { bookingId: booking.id, reference: booking.reference, accessToken: booking.accessToken, alreadyFinalized: false };
    });

    if (!result.alreadyFinalized) {
      await recordCheckoutAttemptEvent(checkoutAttemptId, "finalization_completed", { providerReference: result.reference });
    }
    return { ok: true, ...result };
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
