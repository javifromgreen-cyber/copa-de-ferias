"use server";

import { prisma } from "@/lib/db";
import { atuAireBuyerSchema, type AtuAireBuyerInput } from "@/lib/validation/schemas";
import { getAtuAireCheckoutQuote } from "./atu-aire-checkout";
import { getPaymentProvider } from "@/lib/payments";
import { sendTemplatedEmail } from "@/lib/email";
import { generateAccessToken, generateBookingReference, formatDate } from "@/lib/utils";
import type { AtuAireSelection } from "@/lib/checkout-atu-aire/types";

export type CreateAtuAireBookingResult =
  | { ok: true; reference: string; accessToken: string; isSimulated: boolean }
  | { ok: false; error: string };

class RaceConditionError extends Error {}

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
export async function createAtuAireBooking(tripSlug: string, selection: AtuAireSelection, buyerInput: AtuAireBuyerInput): Promise<CreateAtuAireBookingResult> {
  const parsedBuyer = atuAireBuyerSchema.safeParse(buyerInput);
  if (!parsedBuyer.success) {
    return { ok: false, error: parsedBuyer.error.issues[0]?.message ?? "Datos no válidos" };
  }
  const buyer = parsedBuyer.data;

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
  const totalPrice = quote.price.totalCommercial;
  const selectedHotel = quote.hotelOptions.find((h) => h.offer.id === selection.hotelOfferId && h.valid) ?? null;
  const selectedFlight = quote.flightOffers.find((f) => f.id === selection.flightOfferId) ?? null;
  const selectedOrigin = quote.eligibleOrigins.find((o) => o.iata === selection.originAirport) ?? null;

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
            ? JSON.stringify({ hotelOfferId: selectedHotel.offer.id, name: selectedHotel.offer.name, nights: selection.nights, perPersonPrice: selectedHotel.perPersonPrice })
            : "",
          flightSelectionSnapshot: selectedFlight
            ? JSON.stringify({
                flightOfferId: selectedFlight.id,
                originAirport: selectedFlight.originAirport,
                destinationAirport: selectedFlight.destinationAirport,
                outboundDeparture: selectedFlight.outboundDeparture,
                returnDeparture: selectedFlight.returnDeparture,
                pricePerPerson: selectedFlight.pricePerPerson,
              })
            : "",
          priceBreakdownSnapshot: JSON.stringify({ perPerson: quote.price.perPerson, total: quote.price.totalCommercial, ticketSelections: selection.ticketSelections }),
        },
      });

      const travelers = Array.from({ length: partySize }, (_, i) => ({
        bookingId: booking.id,
        firstName: i === 0 ? buyer.buyerFirstName : `Acompañante`,
        lastName: i === 0 ? buyer.buyerLastName : `${i}`,
        originAirport: selection.originAirport ?? "",
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

  const departureDate = new Date(selectedFlight?.outboundDeparture ?? trip.matchDate);
  const returnDate = new Date(selectedFlight?.returnDeparture ?? trip.matchDate);

  await sendTemplatedEmail({
    templateKey: "booking_confirmed",
    to: buyer.buyerEmail,
    bookingId,
    variables: {
      firstName: buyer.buyerFirstName,
      tripName: trip.name,
      tripNumber: `#${String(trip.number).padStart(3, "0")}`,
      departureCity: selectedOrigin?.city ?? "",
      departureDate: formatDate(departureDate),
      returnDate: formatDate(returnDate),
      whatsappUrl: trip.whatsappUrl || "",
    },
  });

  return { ok: true, reference, accessToken, isSimulated: charge.isSimulated };
}
