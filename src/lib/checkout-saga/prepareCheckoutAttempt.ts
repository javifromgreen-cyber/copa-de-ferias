import type { PackageType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createCheckoutAttempt } from "./createCheckoutAttempt";
import { transitionCheckoutAttempt } from "./transitions";
import { acquireTicketHold } from "./ticketHold";
import { recordCheckoutAttemptEvent } from "./events";
import { validateCheckoutAttemptTravelers, type CheckoutAttemptTravelerInput } from "./travelerValidation";
import { persistCheckoutAttemptTravelers } from "./checkoutAttemptTravelers";
import { validateCheckoutAttemptBuyer, persistCheckoutAttemptBuyer, type CheckoutAttemptBuyerInput } from "./checkoutAttemptBuyer";
import { isFlightPackageEligible } from "@/lib/checkout-atu-aire/countries";
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

/** §15 minutes — our own conservative stock-protection window; not derived from any provider, an internal operational choice (see quoteValidity.ts's own doc comment on why this, not Nuitee, bounds a TICKET_HOTEL attempt with no flight). */
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

  async function failAttempt(reason: string): Promise<PrepareCheckoutAttemptResult> {
    await transitionCheckoutAttempt(checkoutAttemptId, "failed");
    return { ok: false, checkoutAttemptId, status: "failed", error: reason };
  }

  // §5/§6, extended in Fase 2.6 §3/§8 — persist buyer + travelers +
  // travelOriginCountry now, inside REVALIDATING, before any Booking
  // exists — travelOriginCountry is part of the revalidated
  // configuration, same treatment as buyer, and READY_TO_PAY reads it
  // back from here (getReadyToPayView), never from client state.
  await persistCheckoutAttemptBuyer(checkoutAttemptId, input.buyer);
  await persistCheckoutAttemptTravelers(checkoutAttemptId, input.travelers);
  await prisma.checkoutAttempt.update({ where: { id: checkoutAttemptId }, data: { travelOriginCountry: input.travelOriginCountry } });
  await recordCheckoutAttemptEvent(checkoutAttemptId, "travelers_validated", { sanitizedDetail: JSON.stringify({ count: input.travelers.length }) });

  const trip = await prisma.trip.findUnique({ where: { id: input.tripId }, include: { events: true } });
  if (!trip) {
    return failAttempt("El viaje ya no existe.");
  }

  // §1 step 3 — revalidate the TicketOffer.
  const ticketOffer = await prisma.ticketOffer.findUnique({ where: { id: input.ticket.ticketOfferId } });
  if (!ticketOffer || !ticketOffer.active) {
    return failAttempt("La oferta de entradas seleccionada ya no está disponible.");
  }
  await recordCheckoutAttemptEvent(checkoutAttemptId, "ticket_validated", { providerReference: ticketOffer.id });

  // §1 step 4 / §12/§16 — PREBOOK Nuitee when this modality has a hotel.
  let hotelPrebook: HotelPrebook | null = null;
  if (input.hotel) {
    let rawPrebook: HotelPrebook;
    try {
      rawPrebook = await prebookOffer(input.hotel.offerId, input.fetchImpl);
    } catch (err) {
      return failAttempt(`El hotel seleccionado ya no está disponible: ${err instanceof Error ? err.message : String(err)}`);
    }
    const changeEval = evaluatePrebookChange(input.hotel.expectedTotalPrice, rawPrebook);
    // §16 — material changes to cancellation/board are never accepted
    // silently, even though the customer hasn't seen the final price yet
    // (a price-only difference IS allowed to flow straight into the
    // final quote below — see §16's own instruction).
    if (changeEval.cancellationChanged || changeEval.boardChanged) {
      return failAttempt("Las condiciones del hotel (cancelación o régimen) cambiaron entre la búsqueda y el prebook — no se puede continuar automáticamente.");
    }
    // §16 — "room type changed" isn't covered by Nuitee's own
    // evaluatePrebookChange (only price/cancellation/board), so it's
    // checked explicitly here: the set of (occupancyNumber, roomName)
    // pairs must be identical to what the customer selected at SEARCH.
    if (roomKey(input.hotel.expectedRooms) !== roomKey(rawPrebook.rooms)) {
      return failAttempt("La combinación de habitaciones cambió entre la búsqueda y el prebook — no se puede continuar automáticamente.");
    }
    hotelPrebook = rawPrebook;
    await prisma.checkoutAttempt.update({ where: { id: checkoutAttemptId }, data: { hotelStatus: "prebooked" } });
    await recordCheckoutAttemptEvent(checkoutAttemptId, "hotel_prebook_confirmed", {
      providerReference: hotelPrebook.prebookId,
      sanitizedDetail: JSON.stringify({ priceDifferencePercent: hotelPrebook.priceDifferencePercent }),
    });
  }

  // §1 step 5/6 / §14/§15, corrected in Fase 2.6 §2/§6 — the client never
  // supplies offerRequestId/passengerIds/originalTotalAmount directly.
  // Instead it names the FlightSearchSession it browsed and the single
  // offerId/slice keys it resolved; everything Duffel-sensitive is looked
  // up server-side from that session row and cross-checked against the
  // client's claim before revalidation even runs.
  let flightOffer: RoundTripFlightOffer | null = null;
  if (input.flight) {
    const session = await prisma.flightSearchSession.findUnique({ where: { id: input.flight.searchSessionId } });
    if (!session || session.expiresAt.getTime() <= Date.now()) {
      return failAttempt("La búsqueda de vuelos ha caducado — vuelve a elegir aeropuerto de salida.");
    }
    if (session.tripId !== input.tripId) {
      return failAttempt("La búsqueda de vuelos no corresponde a este viaje.");
    }
    if (session.partySize !== input.partySize) {
      return failAttempt(`El número de viajeros (${input.partySize}) no coincide con la búsqueda de vuelos original (${session.partySize}).`);
    }
    const storedOffers = JSON.parse(session.offersJson) as StoredFlightOffer[];
    const storedOffer = storedOffers.find((o) => o.offerId === input.flight!.offerId);
    if (!storedOffer) {
      return failAttempt("La oferta de vuelo seleccionada no pertenece a la búsqueda realizada — vuelve a elegir.");
    }
    if (dtoSliceKey(storedOffer.outbound) !== input.flight.outboundSliceKey || dtoSliceKey(storedOffer.return) !== input.flight.returnSliceKey) {
      return failAttempt("La selección de ida/vuelta no coincide con la oferta indicada — vuelve a elegir.");
    }
    const passengerIds = JSON.parse(session.passengerIds) as string[];

    const revalidation = await revalidateRoundTripOffer(storedOffer.offerId, storedOffer.totalAmount, session.offerRequestId, passengerIds, input.fetchImpl);
    if (revalidation.status === "expired" || revalidation.status === "not_found" || !revalidation.offer) {
      return failAttempt("La oferta de vuelo ya no está disponible — es necesario volver a buscar.");
    }
    if (!revalidatedOfferMatchesSelectedItinerary(revalidation.offer, input.flight.outboundSliceKey, input.flight.returnSliceKey)) {
      return failAttempt("El itinerario del vuelo revalidado ya no coincide con el seleccionado — es necesario volver a elegir ida/vuelta.");
    }
    // §15 — partySize must equal the Duffel passengerIds count for this modality.
    if (revalidation.offer.passengerIds.length !== input.partySize) {
      return failAttempt(`El número de pasajeros de Duffel (${revalidation.offer.passengerIds.length}) no coincide con partySize (${input.partySize}).`);
    }
    flightOffer = revalidation.offer;
    await prisma.checkoutAttempt.update({ where: { id: checkoutAttemptId }, data: { flightStatus: "validated" } });
    await recordCheckoutAttemptEvent(checkoutAttemptId, "flight_revalidated", { providerReference: flightOffer.offerId, sanitizedDetail: JSON.stringify({ status: revalidation.status }) });
  }

  // §1 step 7 — compute the final commercial quote (never duplicating pricing logic).
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
  // buffer/paymentMethodInternalCost: same 0 default the live A_TU_AIRE
  // checkout already uses (see quoteBuilder.ts) — not configured yet
  // anywhere in this codebase, never invented here.
  const quote = computeQuote({ costs: { ticketCostNetTotal, hotelCostNetTotal, flightCostNetTotal, hostCostNetTotal: 0 }, orgFee, buffer: 0, paymentMethodInternalCost: 0 });

  // §1 step 8 / §17/§18 — reversibility gate. Only blocks when BOTH a
  // hotel AND a flight are present and both are irreversible-for-risk.
  const hotelReversibility: ReversibilityLevel | null = hotelPrebook ? classifyHotelReversibility(hotelPrebook.rooms) : null;
  const flightReversibility: ReversibilityLevel | null = flightOffer ? classifyFlightReversibility(flightOffer.commercialProduct) : null;
  if (isNoViableReversibilityCombination(hotelReversibility, flightReversibility)) {
    return failAttempt("Esta combinación de hotel y vuelo no es automatizable de forma segura para el MVP (ambos componentes son irreversibles o de reversibilidad desconocida) — vuelve a la selección.");
  }

  // §1 step 9 / §20 — acquire the TicketHold ONLY now, after every provider
  // check and the viability gate passed — never earlier, so stock isn't
  // blocked while we wait on providers.
  const ticketHoldExpiresAt = new Date(Date.now() + TICKET_HOLD_TTL_MS);
  const holdResult = await acquireTicketHold({ checkoutAttemptId, ticketOfferId: input.ticket.ticketOfferId, quantity: input.ticket.quantity, expiresAt: ticketHoldExpiresAt });
  if (!holdResult.ok) {
    return failAttempt("Las entradas seleccionadas ya no tienen stock disponible.");
  }

  // §1 step 10 / §21/§22 — freeze FinalQuoteSnapshot.
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

  await prisma.checkoutAttempt.update({
    where: { id: checkoutAttemptId },
    data: { finalQuoteSnapshot: serializeFinalQuoteSnapshot(snapshot), latestSafePaymentAt, ticketStatus: "held" },
  });
  await recordCheckoutAttemptEvent(checkoutAttemptId, "quote_snapshot_created", { sanitizedDetail: JSON.stringify({ pvpTotal: quote.commercialTotal, currency: trip.currency }) });

  // §1 step 11 — REVALIDATING -> READY_TO_PAY.
  await transitionCheckoutAttempt(checkoutAttemptId, "ready_to_pay");

  // §1 step 12 — showing the payment screen is a frontend concern (see
  // the new checkout page); this function's job ends at READY_TO_PAY.
  // §22 — accessToken lets the UI build a resumable URL
  // (?attempt=<token>) without ever exposing the raw id.
  return { ok: true, checkoutAttemptId, status: "ready_to_pay", finalQuoteSnapshot: snapshot, accessToken: attempt.accessToken };
}
