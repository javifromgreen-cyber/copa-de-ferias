"use server";

import { prisma } from "@/lib/db";
import { atuAireBuyerSchema, atuAireTravelerSchema, type AtuAireBuyerInput, type AtuAireTravelerInput } from "@/lib/validation/schemas";
import { parseRequiredFields } from "@/lib/checkout/travelerFields";
import { getAtuAireCheckoutQuote } from "./atu-aire-checkout";
import { getPaymentProvider } from "@/lib/payments";
import { sendTemplatedEmail, buildBookingEmailVariables } from "@/lib/email";
import { generateAccessToken, generateBookingReference } from "@/lib/utils";
import { packageRequiresHotel } from "@/lib/checkout-atu-aire/packageRequirements";
import { assignTravelersToRooms } from "@/lib/checkout-atu-aire/rooming";
import type { AtuAireSelection } from "@/lib/checkout-atu-aire/types";

export type CreateAtuAireBookingResult =
  | { ok: true; reference: string; accessToken: string; isSimulated: boolean }
  | { ok: false; error: string };

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

class RaceConditionError extends Error {}

function atuAireTravelerFieldValue(t: AtuAireTravelerInput, key: string): string {
  switch (key) {
    case "birthDate":
      return t.birthDate;
    case "nationality":
      return t.nationality;
    case "docType":
      return t.docType;
    case "docNumber":
      return t.docNumber;
    case "docExpiry":
      return t.docExpiry;
    case "docCountry":
      return t.docCountry;
    case "phone":
      return t.phone;
    default:
      return "";
  }
}

function parseFormDate(value: string): Date | null {
  return value ? new Date(value) : null;
}

/**
 * A_TU_AIRE's own "continuar al pago" step (§6) — reuses the existing
 * payment-provider abstraction and Booking/Traveler tables exactly like
 * GROUP_CDF's createBooking, but never GROUP_CDF's fixed-price/fixed-
 * capacity assumptions: the price is whatever the commercial engine says
 * for this selection, re-derived from fresh data, never trusted from the
 * client (§6/§22, same "no second pricing algorithm" rule as the rest of
 * this checkout). A_TU_AIRE has no shared spots pool to oversell, so there
 * is nothing here equivalent to GROUP_CDF's soldSpots race-condition guard
 * — party size is per-booking, not drawn from a shared trip-level pool.
 */
export async function createAtuAireBooking(
  tripSlug: string,
  selection: AtuAireSelection,
  buyerInput: AtuAireBuyerInput,
  travelersInput: AtuAireTravelerInput[],
): Promise<CreateAtuAireBookingResult> {
  const parsedBuyer = atuAireBuyerSchema.safeParse(buyerInput);
  if (!parsedBuyer.success) {
    return { ok: false, error: parsedBuyer.error.issues[0]?.message ?? "Datos no válidos" };
  }
  const buyer = parsedBuyer.data;

  const parsedTravelers = atuAireTravelerSchema.array().min(1).max(20).safeParse(travelersInput);
  if (!parsedTravelers.success) {
    return { ok: false, error: parsedTravelers.error.issues[0]?.message ?? "Faltan datos de los viajeros." };
  }
  const travelersData = parsedTravelers.data;

  const trip = await prisma.trip.findUnique({ where: { slug: tripSlug } });
  if (!trip || !trip.published || trip.travelMode !== "A_TU_AIRE") {
    return { ok: false, error: "Este producto no está disponible." };
  }

  // Re-validate the entire quote server-side from fresh offer data — the
  // client's displayed total is never trusted directly.
  const result = await getAtuAireCheckoutQuote(tripSlug, selection, { revalidate: true });
  if (!result.ok) return { ok: false, error: result.error };
  const quote = result.quote;

  if (!selection.packageType || !selection.partySize) {
    return { ok: false, error: "Todavía faltan elecciones por completar antes de poder pagar." };
  }
  if (quote.price.missing.length > 0 || quote.price.totalCommercial === null) {
    return { ok: false, error: `Todavía falta por elegir: ${quote.price.missing.join(", ") || "algunas opciones"}.` };
  }

  const partySize = selection.partySize;

  // Defensive re-check of the global party-size cap (max 6, never trip-
  // specific) — the client already disables past this, but the server
  // never trusts a client-side-only limit for something the price/room
  // mix depend on.
  if (partySize > quote.partySizeLimits.max) {
    return { ok: false, error: `El máximo permitido es ${quote.partySizeLimits.max} viajeros por reserva.` };
  }

  // Exactly one traveler entry per party member (§15) — a mismatch means
  // the client-side resize effect and the server disagree, which should
  // never happen, but is never silently tolerated either.
  if (travelersData.length !== partySize) {
    return { ok: false, error: "El número de viajeros con datos no coincide con el número de plazas seleccionadas." };
  }

  // Server-side enforcement of this trip's required traveler fields — the
  // checkout UI already asks for these, but re-check here so it can't be
  // bypassed (mirrors GROUP_CDF's createBooking — see checkout §14/§15).
  const requiredFields = parseRequiredFields(trip.requiredTravelerFields);
  for (const t of travelersData) {
    const name = `${t.firstName} ${t.lastName}`.trim();
    for (const key of requiredFields) {
      if (key === "emergencyContact") {
        if (!t.emergencyContactName || !t.emergencyContactPhone) {
          return { ok: false, error: `Falta el contacto de emergencia de ${name} para este viaje` };
        }
        continue;
      }
      if (!atuAireTravelerFieldValue(t, key)) {
        return { ok: false, error: `Falta un dato obligatorio de ${name} para este viaje` };
      }
    }
  }
  const totalPrice = quote.price.totalCommercial;
  const selectedHotel = quote.hotelOptions.find((h) => h.offer.id === selection.hotelOfferId && h.valid) ?? null;
  const selectedOutboundLeg = quote.outboundLegs.find((l) => l.id === selection.outboundLegId) ?? null;
  const selectedReturnLeg = quote.returnLegs.find((l) => l.id === selection.returnLegId) ?? null;
  const selectedOrigin = quote.eligibleOrigins.find((o) => o.iata === selection.originAirport) ?? null;

  // Frozen once, here, at the moment of purchase — this is the same
  // checkIn/checkOut window getAtuAireCheckoutQuote used to query hotel
  // offers for this exact booking. Captured into the snapshot so Mi Viaje
  // never has to re-derive it from the Event's current (possibly later
  // changed) schedule (correction microblock §12/§13).
  const eventMatchDates = quote.events.map((e) => e.matchDate).sort((a, b) => a.getTime() - b.getTime());
  const hotelCheckIn = addDays(eventMatchDates[0], -1);
  const hotelCheckOut = addDays(eventMatchDates[eventMatchDates.length - 1], 1);

  // Same room mix + assignment the checkout's own RoomingStep showed the
  // customer, run once here and frozen — never recomputed by Mi Viaje, so
  // a later change to the room-mix business rule can't reshuffle a room
  // already bought (§14/§15). travelerIndices match Traveler.order below.
  const roomingSnapshot =
    packageRequiresHotel(selection.packageType!) && quote.roomMix ? JSON.stringify(assignTravelersToRooms(partySize, quote.roomMix)) : "";

  const reference = generateBookingReference();
  const accessToken = generateAccessToken();

  let bookingId: string;
  try {
    bookingId = await prisma.$transaction(async (tx) => {
      // Re-check the trip is still published/A_TU_AIRE inside the
      // transaction — mirrors the defensive re-read GROUP_CDF's
      // createBooking does before writing.
      const freshTrip = await tx.trip.findUniqueOrThrow({ where: { id: trip.id } });
      if (!freshTrip.published || freshTrip.travelMode !== "A_TU_AIRE") {
        throw new RaceConditionError("Este producto ya no está disponible.");
      }

      const booking = await tx.booking.create({
        data: {
          reference,
          tripId: trip.id,
          buyerFirstName: buyer.buyerFirstName,
          buyerLastName: buyer.buyerLastName,
          buyerEmail: buyer.buyerEmail,
          buyerPhone: buyer.buyerPhone,
          originCity: selectedOrigin?.city ?? "",
          travelersCount: partySize,
          singleRooms: 0,
          totalPrice,
          currency: trip.currency,
          paymentProvider: "demo",
          paymentStatus: "pending",
          bookingStatus: "pending_payment",
          accessToken,
          packageType: selection.packageType,
          partySize,
          ticketCount: partySize,
          hotelSelectionSnapshot: selectedHotel
            ? JSON.stringify({
                hotelOfferId: selectedHotel.offer.id,
                name: selectedHotel.offer.name,
                nights: selection.nights,
                perPersonPrice: selectedHotel.perPersonPrice,
                checkIn: hotelCheckIn,
                checkOut: hotelCheckOut,
              })
            : "",
          roomingSnapshot,
          flightSelectionSnapshot:
            selectedOutboundLeg && selectedReturnLeg
              ? JSON.stringify({
                  outboundLegId: selectedOutboundLeg.id,
                  returnLegId: selectedReturnLeg.id,
                  originAirport: selectedOutboundLeg.originAirport,
                  destinationAirport: selectedOutboundLeg.destinationAirport,
                  outboundDeparture: selectedOutboundLeg.departure,
                  returnDeparture: selectedReturnLeg.departure,
                  outboundPricePerPerson: selectedOutboundLeg.pricePerPerson,
                  returnPricePerPerson: selectedReturnLeg.pricePerPerson,
                })
              : "",
          priceBreakdownSnapshot: JSON.stringify({ perPerson: quote.price.perPerson, total: quote.price.totalCommercial, ticketSelections: selection.ticketSelections }),
        },
      });

      const travelers = travelersData.map((t, index) => ({
        bookingId: booking.id,
        firstName: t.firstName,
        lastName: t.lastName,
        birthDate: parseFormDate(t.birthDate),
        nationality: t.nationality,
        docType: t.docType,
        docNumber: t.docNumber,
        docExpiry: parseFormDate(t.docExpiry),
        docCountry: t.docCountry,
        phone: t.phone,
        emergencyContactName: t.emergencyContactName,
        emergencyContactPhone: t.emergencyContactPhone,
        originAirport: selection.originAirport ?? "",
        order: index,
      }));
      await tx.traveler.createMany({ data: travelers });

      return booking.id;
    });
  } catch (err) {
    if (err instanceof RaceConditionError) return { ok: false, error: err.message };
    throw err;
  }

  const provider = getPaymentProvider("card", { tripIsDemo: trip.isDemo });
  const charge = await provider.charge({
    bookingReference: reference,
    amount: totalPrice,
    currency: "EUR",
    method: "card",
    buyerEmail: buyer.buyerEmail,
    description: `${trip.name} — ${trip.subtitle}`,
  });

  if (!charge.success) {
    await prisma.booking.update({ where: { id: bookingId }, data: { paymentStatus: "failed", bookingStatus: "cancelled" } });
    return { ok: false, error: "No se ha podido procesar el pago. Inténtalo de nuevo." };
  }

  await prisma.booking.update({ where: { id: bookingId }, data: { paymentStatus: "paid", bookingStatus: "confirmed" } });

  await sendTemplatedEmail({
    templateKey: "booking_confirmed",
    to: buyer.buyerEmail,
    bookingId,
    variables: buildBookingEmailVariables(
      { reference, accessToken, buyerFirstName: buyer.buyerFirstName, totalPrice, currency: trip.currency, travelersCount: partySize, partySize },
      trip,
    ),
  });

  return { ok: true, reference, accessToken, isSimulated: charge.isSimulated };
}
