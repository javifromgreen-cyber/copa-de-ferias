import type { PackageType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { transitionCheckoutAttempt } from "./transitions";
import { acquireTicketHold } from "./ticketHold";
import { recordCheckoutAttemptEvent } from "./events";
import { computeLatestSafePaymentAt } from "./quoteValidity";
import { classifyHotelReversibility, classifyFlightReversibility, isNoViableReversibilityCombination, type ReversibilityLevel } from "./reversibility";
import { serializeFinalQuoteSnapshot, type FinalQuoteSnapshot, type FinalQuoteSnapshotFlightSegment } from "./finalQuoteSnapshot";
import { computeRequiredRoomMix } from "@/lib/pricing/roomMix";
import { assignTravelersToRooms } from "@/lib/checkout-atu-aire/rooming";
import { computeOrganizationFee, type OrganizationFeeGlobalConfig } from "@/lib/pricing/organizationFee";
import { computeQuote } from "@/lib/pricing/quote";
import { prebookOffer, evaluatePrebookChange } from "@/lib/providers/hotels/nuitee/prebook";
import type { HotelPrebook } from "@/lib/providers/hotels/nuitee/types";
import { revalidateRoundTripOffer } from "@/lib/providers/flights/duffel/revalidate";
import { revalidatedOfferMatchesSelectedItinerary } from "@/lib/providers/flights/duffel/roundTripSelection";
import type { FlightSegment, RoundTripFlightOffer } from "@/lib/providers/flights/duffel/types";
import { dtoSliceKey, type StoredFlightOffer } from "./flightSearchSession";

/**
 * Fase 2 (prepareCheckoutAttempt.ts), factored out in Fase 3A §7 —
 * everything from "revalidate the ticket against the DB" through
 * "freeze a FinalQuoteSnapshot and transition to READY_TO_PAY", as its
 * own reusable step. Two callers now compose it:
 *
 *  - prepareCheckoutAttempt.ts: the FIRST run, on a brand-new
 *    CheckoutAttempt (already in REVALIDATING) that has never had a
 *    snapshot.
 *  - ensureCheckoutAttemptPayable() (payment.ts): a REFRESH run, when a
 *    CheckoutAttempt's existing READY_TO_PAY snapshot is no longer safe
 *    to authorize a payment against (§7) — same engines, same inputs
 *    (replayed from CheckoutAttempt.ticket/hotel/flightSelectionJson),
 *    on the SAME attempt, producing a NEW finalQuoteSnapshotVersion
 *    rather than a new CheckoutAttempt. "No dupliques motores" (§7) is
 *    the whole reason this file exists instead of two copies of this
 *    logic.
 *
 * Callers are responsible for: the attempt already being in
 * REVALIDATING when this is invoked, and for persisting
 * ticket/hotel/flightSelectionJson themselves (this function only READS
 * them as plain typed input — it has no opinion on where they came
 * from).
 */
export type QuoteRevalidationTicketInput = { ticketOfferId: string; quantity: number };
export type QuoteRevalidationHotelInput = {
  offerId: string;
  expectedTotalPrice: number;
  expectedRooms: { roomName: string; occupancyNumber: number }[];
  hotelName: string;
};
export type QuoteRevalidationFlightInput = {
  searchSessionId: string;
  offerId: string;
  outboundSliceKey: string;
  returnSliceKey: string;
};

export type QuoteRevalidationInput = {
  checkoutAttemptId: string;
  tripId: string;
  packageType: PackageType;
  partySize: number;
  ticket: QuoteRevalidationTicketInput;
  hotel?: QuoteRevalidationHotelInput;
  flight?: QuoteRevalidationFlightInput;
  /** Threaded to the Duffel/Nuitee HTTP calls — tests inject a stub here. */
  fetchImpl?: typeof fetch;
};

export type QuoteRevalidationResult = { ok: true; snapshot: FinalQuoteSnapshot; quoteVersion: number } | { ok: false; error: string };

const TICKET_HOLD_TTL_MS = 15 * 60 * 1000;

function toSnapshotSegment(s: FlightSegment): FinalQuoteSnapshotFlightSegment {
  return { originAirport: s.originIata, destinationAirport: s.destinationIata, departure: s.departingAt.toISOString(), arrival: s.arrivingAt.toISOString(), carrier: s.marketingCarrier.iata };
}

function roomKey(rooms: { roomName: string; occupancyNumber: number }[]): string {
  return [...rooms]
    .sort((a, b) => a.occupancyNumber - b.occupancyNumber)
    .map((r) => `${r.occupancyNumber}:${r.roomName}`)
    .join("|");
}

export async function runQuoteRevalidation(input: QuoteRevalidationInput): Promise<QuoteRevalidationResult> {
  const { checkoutAttemptId } = input;

  async function fail(reason: string): Promise<QuoteRevalidationResult> {
    await transitionCheckoutAttempt(checkoutAttemptId, "failed");
    return { ok: false, error: reason };
  }

  const trip = await prisma.trip.findUnique({ where: { id: input.tripId }, include: { events: true } });
  if (!trip) {
    return fail("El viaje ya no existe.");
  }

  const ticketOffer = await prisma.ticketOffer.findUnique({ where: { id: input.ticket.ticketOfferId } });
  if (!ticketOffer || !ticketOffer.active) {
    return fail("La oferta de entradas seleccionada ya no está disponible.");
  }
  await recordCheckoutAttemptEvent(checkoutAttemptId, "ticket_validated", { providerReference: ticketOffer.id });

  let hotelPrebook: HotelPrebook | null = null;
  if (input.hotel) {
    let rawPrebook: HotelPrebook;
    try {
      rawPrebook = await prebookOffer(input.hotel.offerId, input.fetchImpl);
    } catch (err) {
      return fail(`El hotel seleccionado ya no está disponible: ${err instanceof Error ? err.message : String(err)}`);
    }
    const changeEval = evaluatePrebookChange(input.hotel.expectedTotalPrice, rawPrebook);
    if (changeEval.cancellationChanged || changeEval.boardChanged) {
      return fail("Las condiciones del hotel (cancelación o régimen) cambiaron entre la búsqueda y el prebook — no se puede continuar automáticamente.");
    }
    if (roomKey(input.hotel.expectedRooms) !== roomKey(rawPrebook.rooms)) {
      return fail("La combinación de habitaciones cambió entre la búsqueda y el prebook — no se puede continuar automáticamente.");
    }
    hotelPrebook = rawPrebook;
    await prisma.checkoutAttempt.update({ where: { id: checkoutAttemptId }, data: { hotelStatus: "prebooked" } });
    await recordCheckoutAttemptEvent(checkoutAttemptId, "hotel_prebook_confirmed", {
      providerReference: hotelPrebook.prebookId,
      sanitizedDetail: JSON.stringify({ priceDifferencePercent: hotelPrebook.priceDifferencePercent }),
    });
  }

  let flightOffer: RoundTripFlightOffer | null = null;
  if (input.flight) {
    const session = await prisma.flightSearchSession.findUnique({ where: { id: input.flight.searchSessionId } });
    if (!session || session.expiresAt.getTime() <= Date.now()) {
      return fail("La búsqueda de vuelos ha caducado — vuelve a elegir aeropuerto de salida.");
    }
    if (session.tripId !== input.tripId) {
      return fail("La búsqueda de vuelos no corresponde a este viaje.");
    }
    if (session.partySize !== input.partySize) {
      return fail(`El número de viajeros (${input.partySize}) no coincide con la búsqueda de vuelos original (${session.partySize}).`);
    }
    const storedOffers = JSON.parse(session.offersJson) as StoredFlightOffer[];
    const storedOffer = storedOffers.find((o) => o.offerId === input.flight!.offerId);
    if (!storedOffer) {
      return fail("La oferta de vuelo seleccionada no pertenece a la búsqueda realizada — vuelve a elegir.");
    }
    if (dtoSliceKey(storedOffer.outbound) !== input.flight.outboundSliceKey || dtoSliceKey(storedOffer.return) !== input.flight.returnSliceKey) {
      return fail("La selección de ida/vuelta no coincide con la oferta indicada — vuelve a elegir.");
    }
    const passengerIds = JSON.parse(session.passengerIds) as string[];

    const revalidation = await revalidateRoundTripOffer(storedOffer.offerId, storedOffer.totalAmount, session.offerRequestId, passengerIds, input.fetchImpl);
    if (revalidation.status === "expired" || revalidation.status === "not_found" || !revalidation.offer) {
      return fail("La oferta de vuelo ya no está disponible — es necesario volver a buscar.");
    }
    if (!revalidatedOfferMatchesSelectedItinerary(revalidation.offer, input.flight.outboundSliceKey, input.flight.returnSliceKey)) {
      return fail("El itinerario del vuelo revalidado ya no coincide con el seleccionado — es necesario volver a elegir ida/vuelta.");
    }
    if (revalidation.offer.passengerIds.length !== input.partySize) {
      return fail(`El número de pasajeros de Duffel (${revalidation.offer.passengerIds.length}) no coincide con partySize (${input.partySize}).`);
    }
    flightOffer = revalidation.offer;
    await prisma.checkoutAttempt.update({ where: { id: checkoutAttemptId }, data: { flightStatus: "validated" } });
    await recordCheckoutAttemptEvent(checkoutAttemptId, "flight_revalidated", { providerReference: flightOffer.offerId, sanitizedDetail: JSON.stringify({ status: revalidation.status }) });
  }

  const feeConfig = await prisma.organizationFeeConfig.upsert({ where: { id: "default" }, create: { id: "default" }, update: {} });
  const global: OrganizationFeeGlobalConfig = feeConfig;
  const matchCount = trip.events.length;
  const ticketCostNetTotal = ticketOffer.costNet * input.ticket.quantity;
  const hotelCostNetTotal = hotelPrebook ? hotelPrebook.price.total : 0;
  const flightCostNetTotal = flightOffer ? flightOffer.totalAmount : 0;

  const orgFee = computeOrganizationFee({
    packageType: input.packageType,
    partySize: input.partySize,
    matchCount,
    global,
    overrides: {
      orgFeeTicketOnlyOverride: trip.orgFeeTicketOnlyOverride,
      orgFeeHotelTiersOverride: trip.orgFeeHotelTiersOverride,
      orgFeeHotelFlightTiersOverride: trip.orgFeeHotelFlightTiersOverride,
      additionalMatchFeeOverride: trip.additionalMatchFeeOverride,
    },
  });
  const quote = computeQuote({ costs: { ticketCostNetTotal, hotelCostNetTotal, flightCostNetTotal, hostCostNetTotal: 0 }, orgFee, buffer: 0, paymentMethodInternalCost: 0 });

  const hotelReversibility: ReversibilityLevel | null = hotelPrebook ? classifyHotelReversibility(hotelPrebook.rooms) : null;
  const flightReversibility: ReversibilityLevel | null = flightOffer ? classifyFlightReversibility(flightOffer.commercialProduct) : null;
  if (isNoViableReversibilityCombination(hotelReversibility, flightReversibility)) {
    return fail("Esta combinación de hotel y vuelo no es automatizable de forma segura para el MVP (ambos componentes son irreversibles o de reversibilidad desconocida) — vuelve a la selección.");
  }

  const ticketHoldExpiresAt = new Date(Date.now() + TICKET_HOLD_TTL_MS);
  const holdResult = await acquireTicketHold({ checkoutAttemptId, ticketOfferId: input.ticket.ticketOfferId, quantity: input.ticket.quantity, expiresAt: ticketHoldExpiresAt });
  if (!holdResult.ok) {
    return fail("Las entradas seleccionadas ya no tienen stock disponible.");
  }

  const roomMix = input.hotel ? computeRequiredRoomMix(input.partySize) : [];
  const roomingIntent = input.hotel ? assignTravelersToRooms(input.partySize, roomMix) : [];
  const latestSafePaymentAt = computeLatestSafePaymentAt({ ticketHoldExpiresAt, flightExpiresAt: flightOffer?.expiresAt ?? null });
  const now = new Date();

  const snapshot: FinalQuoteSnapshot = {
    ticket: [{ eventId: ticketOffer.eventId, ticketOfferId: ticketOffer.id, category: ticketOffer.category, quantity: input.ticket.quantity, costNetPerUnit: ticketOffer.costNet, currency: ticketOffer.currency }],
    hotel:
      hotelPrebook && input.hotel
        ? {
            provider: "nuitee",
            hotelId: hotelPrebook.hotelId,
            name: input.hotel.hotelName,
            offerId: hotelPrebook.offerId,
            prebookId: hotelPrebook.prebookId,
            checkIn: hotelPrebook.checkin,
            checkOut: hotelPrebook.checkout,
            roomMix,
            roomingIntent,
            price: hotelPrebook.price,
            includedTaxesAndFees: hotelPrebook.rooms.flatMap((r) => r.includedTaxesAndFees),
            excludedTaxesAndFees: hotelPrebook.rooms.flatMap((r) => r.excludedTaxesAndFees),
            refundable: hotelReversibility === "FULLY_REVERSIBLE",
          }
        : null,
    flight: flightOffer
      ? {
          provider: "duffel",
          offerId: flightOffer.offerId,
          offerRequestId: flightOffer.offerRequestId,
          passengerIds: flightOffer.passengerIds,
          expiresAt: flightOffer.expiresAt.toISOString(),
          totalPrice: flightOffer.totalAmount,
          pricePerPerson: flightOffer.totalAmount / input.partySize,
          currency: flightOffer.currency,
          outbound: { segments: flightOffer.outbound.segments.map(toSnapshotSegment) },
          return: { segments: flightOffer.return.segments.map(toSnapshotSegment) },
          commercialProduct: flightOffer.commercialProduct,
        }
      : null,
    commercial: {
      costTicketNet: ticketCostNetTotal,
      costHotelNet: hotelCostNetTotal,
      costFlightNet: flightCostNetTotal,
      orgFee: orgFee.total,
      buffer: 0,
      pvpTotal: quote.commercialTotal,
      pvpPerPerson: quote.commercialTotal / input.partySize,
      currency: trip.currency,
    },
    travelersCount: input.partySize,
    createdAt: now.toISOString(),
    expiresAt: latestSafePaymentAt.toISOString(),
  };

  const updated = await prisma.checkoutAttempt.update({
    where: { id: checkoutAttemptId },
    data: { finalQuoteSnapshot: serializeFinalQuoteSnapshot(snapshot), finalQuoteSnapshotVersion: { increment: 1 }, latestSafePaymentAt, ticketStatus: "held" },
  });
  await recordCheckoutAttemptEvent(checkoutAttemptId, "quote_snapshot_created", { sanitizedDetail: JSON.stringify({ pvpTotal: quote.commercialTotal, currency: trip.currency }) });

  await transitionCheckoutAttempt(checkoutAttemptId, "ready_to_pay");

  return { ok: true, snapshot, quoteVersion: updated.finalQuoteSnapshotVersion };
}
