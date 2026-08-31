"use server";

import { prisma } from "@/lib/db";
import { prepareCheckoutAttempt, type PrepareCheckoutAttemptResult, type PrepareCheckoutAttemptHotelInput, type PrepareCheckoutAttemptFlightInput } from "@/lib/checkout-saga/prepareCheckoutAttempt";
import type { CheckoutAttemptTravelerInput } from "@/lib/checkout-saga/travelerValidation";
import type { CheckoutAttemptBuyerInput } from "@/lib/checkout-saga/checkoutAttemptBuyer";
import type { PackageType } from "@prisma/client";

/**
 * Fase 2 §24/§25 — the NEW real pre-payment flow's only server entry
 * point, deliberately separate from createAtuAireBooking
 * (src/server/actions/atu-aire-booking.ts, the LEGACY demo flow: creates
 * a Booking + "charges" synchronously in one call, no saga, no real
 * provider integration, still backing the live `/reservar` route and its
 * whole existing e2e suite — left completely untouched). This action is
 * the thin server-boundary wrapper around prepareCheckoutAttempt
 * (src/lib/checkout-saga/prepareCheckoutAttempt.ts, where all the actual
 * saga logic lives) for the new `/reservar-real` route. It stops at
 * READY_TO_PAY — no Booking, no payment, no provider booking/order.
 */
export type PrepareRealCheckoutInput = {
  tripSlug: string;
  packageType: PackageType;
  partySize: number;
  buyer: CheckoutAttemptBuyerInput;
  travelers: CheckoutAttemptTravelerInput[];
  ticketOfferId: string;
  ticketQuantity: number;
  /** Only for TICKET_HOTEL / TICKET_HOTEL_FLIGHT — the hotel selection made in the UI's hotel picker step. */
  hotel?: PrepareCheckoutAttemptHotelInput;
  /** Only for TICKET_HOTEL_FLIGHT — the ONE round-trip offer resolved by the UI's ida/vuelta picker step. */
  flight?: PrepareCheckoutAttemptFlightInput;
};

/**
 * Fase 2.5 §15 — this action is a thin boundary: it accepts only
 * identifiers/selections the backend can (and does, inside
 * prepareCheckoutAttempt) revalidate against the real providers. It never
 * trusts a client-supplied price, cost, fee, or reversibility — those are
 * always recomputed server-side.
 */
export async function prepareRealCheckoutAttempt(input: PrepareRealCheckoutInput): Promise<PrepareCheckoutAttemptResult> {
  const trip = await prisma.trip.findUnique({ where: { slug: input.tripSlug } });
  if (!trip || !trip.published || trip.travelMode !== "A_TU_AIRE") {
    return { ok: false, checkoutAttemptId: null, status: "failed", error: "Este producto no está disponible." };
  }

  return prepareCheckoutAttempt({
    tripId: trip.id,
    packageType: input.packageType,
    partySize: input.partySize,
    buyer: input.buyer,
    travelers: input.travelers,
    ticket: { ticketOfferId: input.ticketOfferId, quantity: input.ticketQuantity },
    hotel: input.hotel,
    flight: input.flight,
  });
}

export type RealCheckoutTicketOption = { ticketOfferId: string; eventLabel: string; category: string; costNet: number; currency: string };

/** Real, active TicketOffers for this trip's events — the only source the new page's ticket selector reads from. */
export async function getRealCheckoutTicketOptions(tripSlug: string): Promise<RealCheckoutTicketOption[]> {
  const trip = await prisma.trip.findUnique({
    where: { slug: tripSlug },
    include: { events: { include: { ticketOffers: { where: { active: true }, orderBy: { costNet: "asc" } } } } },
  });
  if (!trip) return [];
  return trip.events.flatMap((event) =>
    event.ticketOffers.map((offer) => ({
      ticketOfferId: offer.id,
      eventLabel: `${event.homeTeam} vs ${event.awayTeam}`,
      category: offer.category,
      costNet: offer.costNet,
      currency: offer.currency,
    })),
  );
}
