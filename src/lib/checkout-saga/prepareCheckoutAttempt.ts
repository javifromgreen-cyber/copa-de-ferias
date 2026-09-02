import type { PackageType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createCheckoutAttempt } from "./createCheckoutAttempt";
import { transitionCheckoutAttempt } from "./transitions";
import { recordCheckoutAttemptEvent } from "./events";
import { validateCheckoutAttemptTravelers, type CheckoutAttemptTravelerInput } from "./travelerValidation";
import { persistCheckoutAttemptTravelers } from "./checkoutAttemptTravelers";
import { validateCheckoutAttemptBuyer, persistCheckoutAttemptBuyer, type CheckoutAttemptBuyerInput } from "./checkoutAttemptBuyer";
import { isFlightPackageEligible } from "@/lib/checkout-atu-aire/countries";
import { runQuoteRevalidation } from "./quoteRevalidation";
import type { FinalQuoteSnapshot } from "./finalQuoteSnapshot";

/**
 * Fase 2 — the new, real pre-payment saga: CONFIGURACIÓN -> CONTINUAR ->
 * revalidación real de proveedores -> READY_TO_PAY. Stops there —
 * nothing in here charges a payment, books a hotel, or issues a flight
 * Order. This is deliberately SEPARATE from src/server/actions/
 * atu-aire-booking.ts's createAtuAireBooking (the legacy demo flow, which
 * still creates a Booking + "charges" synchronously in one shot with no
 * saga/provider integration) — see this repo's Fase 2 report for exactly
 * which parts of the live checkout stay on the legacy path vs. this one.
 *
 * Fase 2.5 §5/§6 — buyer data is now validated AND persisted here too,
 * alongside travelers, before any provider is touched — the same
 * REVALIDATING-time, single-source-of-truth treatment CheckoutAttemptTraveler
 * already got in Fase 2. finalize.ts no longer accepts buyer as an
 * argument at all; it reads the persisted CheckoutAttempt.buyer* fields
 * directly.
 */
export type PrepareCheckoutAttemptHotelInput = {
  /** Nuitee HotelRate.offerId from SEARCH — the whole multi-room combination, never one offer per room. */
  offerId: string;
  /** What the customer saw at SEARCH time — used only to detect a material PREBOOK change (§16), never trusted as the final price. */
  expectedTotalPrice: number;
  expectedRooms: { roomName: string; occupancyNumber: number }[];
  /** Not present on HotelPrebook — carried through separately for the snapshot. */
  hotelName: string;
};

/**
 * Fase 2.6 §2/§6 — the client sends only an opaque searchSessionId (from
 * searchViableFlightOrigins, see real-checkout-search.ts) plus the single
 * offerId/slice keys it resolved in the UI — never offerRequestId,
 * passengerIds, or the original price. All of those are looked up
 * server-side from the FlightSearchSession row and cross-checked against
 * what the client claims (see the flight branch below) before anything
 * is trusted.
 */
export type PrepareCheckoutAttemptFlightInput = {
  searchSessionId: string;
  /** The single round-trip offerId already resolved (or explicitly chosen from a Tarifa/Condiciones step) in an earlier UI step — never two independent offerIds. */
  offerId: string;
  outboundSliceKey: string;
  returnSliceKey: string;
};

export type PrepareCheckoutAttemptInput = {
  tripId: string;
  packageType: PackageType;
  partySize: number;
  /**
   * Fase 2.6 §3 — the ISO country code the traveler is flying FROM
   * ("¿Desde qué país viajas?"), a distinct concept from
   * CheckoutAttemptTravelerInput.nationality (a per-traveler document
   * fact). This is the ONLY input isFlightPackageEligible() is ever
   * evaluated against, both here (server-side gate below) and in the UI.
   */
  travelOriginCountry: string;
  buyer: CheckoutAttemptBuyerInput;
  travelers: CheckoutAttemptTravelerInput[];
  ticket: { ticketOfferId: string; quantity: number };
  hotel?: PrepareCheckoutAttemptHotelInput;
  flight?: PrepareCheckoutAttemptFlightInput;
  /** Threaded to both the Duffel and Nuitee HTTP calls — tests inject a stub here; this function never touches the real network on its own. */
  fetchImpl?: typeof fetch;
};

export type PrepareCheckoutAttemptResult =
  | { ok: true; checkoutAttemptId: string; status: "ready_to_pay"; finalQuoteSnapshot: FinalQuoteSnapshot; accessToken: string }
  | { ok: false; checkoutAttemptId: string | null; status: "failed"; error: string };

export async function prepareCheckoutAttempt(input: PrepareCheckoutAttemptInput): Promise<PrepareCheckoutAttemptResult> {
  const requiresHotel = input.packageType !== "TICKET_ONLY";
  const requiresFlight = input.packageType === "TICKET_HOTEL_FLIGHT";

  // §1 step 1 — validate client/traveler/buyer data BEFORE touching the DB at all.
  const buyerValidation = validateCheckoutAttemptBuyer(input.buyer);
  if (!buyerValidation.ok) {
    return { ok: false, checkoutAttemptId: null, status: "failed", error: buyerValidation.errors.join(" ") };
  }
  if (input.travelers.length !== input.partySize) {
    return { ok: false, checkoutAttemptId: null, status: "failed", error: `partySize (${input.partySize}) no coincide con el número de viajeros indicados (${input.travelers.length}).` };
  }
  const travelerValidation = validateCheckoutAttemptTravelers(input.travelers, { requiresFlightFields: requiresFlight });
  if (!travelerValidation.ok) {
    return { ok: false, checkoutAttemptId: null, status: "failed", error: travelerValidation.errors.join(" ") };
  }
  if (requiresHotel && !input.hotel) {
    return { ok: false, checkoutAttemptId: null, status: "failed", error: "Falta la selección de hotel para esta modalidad." };
  }
  if (requiresFlight && !input.flight) {
    return { ok: false, checkoutAttemptId: null, status: "failed", error: "Falta la selección de vuelo para esta modalidad." };
  }
  if (!input.travelOriginCountry?.trim()) {
    return { ok: false, checkoutAttemptId: null, status: "failed", error: "Falta indicar el país desde el que viajas." };
  }
  // §3/§6 — server-side re-check of the exact same rule the UI already
  // gates on: never trust the client's own eligibility decision alone.
  if (requiresFlight && !isFlightPackageEligible(input.travelOriginCountry)) {
    return { ok: false, checkoutAttemptId: null, status: "failed", error: "El paquete con vuelo no está disponible para el país de origen indicado." };
  }

  // §1 step 2 — create CheckoutAttempt (DRAFT).
  const attempt = await createCheckoutAttempt({ tripId: input.tripId, packageType: input.packageType, partySize: input.partySize });
  const checkoutAttemptId = attempt.id;

  // §2 — DRAFT -> REVALIDATING. From here on every failure path uses the
  // already-atomic transitionCheckoutAttempt(..., "failed") (Fase 1.5/1.6),
  // which also releases any TicketHold that made it to HELD.
  await transitionCheckoutAttempt(checkoutAttemptId, "revalidating");
  await recordCheckoutAttemptEvent(checkoutAttemptId, "quote_revalidation_started");

  // §5/§6, extended in Fase 2.6 §3/§8 — persist buyer + travelers +
  // travelOriginCountry now, inside REVALIDATING, before any Booking
  // exists — travelOriginCountry is part of the revalidated
  // configuration, same treatment as buyer, and READY_TO_PAY reads it
  // back from here (getReadyToPayView), never from client state.
  await persistCheckoutAttemptBuyer(checkoutAttemptId, input.buyer);
  await persistCheckoutAttemptTravelers(checkoutAttemptId, input.travelers);
  // Fase 3A §7/§8 — also persist the ORIGINAL ticket/hotel/flight
  // selection as plain JSON, alongside travelOriginCountry: this is what
  // lets a later ensureCheckoutAttemptPayable() refresh replay the exact
  // same selection through runQuoteRevalidation on this SAME attempt,
  // without the customer re-entering CONFIGURACIÓN.
  await prisma.checkoutAttempt.update({
    where: { id: checkoutAttemptId },
    data: {
      travelOriginCountry: input.travelOriginCountry,
      ticketSelectionJson: JSON.stringify(input.ticket),
      hotelSelectionJson: input.hotel ? JSON.stringify(input.hotel) : "",
      flightSelectionJson: input.flight ? JSON.stringify(input.flight) : "",
    },
  });
  await recordCheckoutAttemptEvent(checkoutAttemptId, "travelers_validated", { sanitizedDetail: JSON.stringify({ count: input.travelers.length }) });

  // §1 steps 3-11 — ticket/hotel/flight revalidation, quote computation,
  // reversibility gate, TicketHold, FinalQuoteSnapshot, ->READY_TO_PAY —
  // all in the shared engine (quoteRevalidation.ts) so a later refresh
  // (Fase 3A §7) never duplicates this logic.
  const revalidation = await runQuoteRevalidation({
    checkoutAttemptId,
    tripId: input.tripId,
    packageType: input.packageType,
    partySize: input.partySize,
    ticket: input.ticket,
    hotel: input.hotel,
    flight: input.flight,
    fetchImpl: input.fetchImpl,
  });
  if (!revalidation.ok) {
    return { ok: false, checkoutAttemptId, status: "failed", error: revalidation.error };
  }

  // §1 step 12 — showing the payment screen is a frontend concern (see
  // the new checkout page); this function's job ends at READY_TO_PAY.
  // §22 — accessToken lets the UI build a resumable URL
  // (?attempt=<token>) without ever exposing the raw id.
  return { ok: true, checkoutAttemptId, status: "ready_to_pay", finalQuoteSnapshot: revalidation.snapshot, accessToken: attempt.accessToken };
}
