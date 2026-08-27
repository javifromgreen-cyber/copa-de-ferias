"use server";

import { prisma } from "@/lib/db";
import { checkoutSchema, type CheckoutInput } from "@/lib/validation/schemas";
import { calculateBookingPrice } from "@/lib/trips/pricing";
import { getPaymentProvider } from "@/lib/payments";
import { sendTemplatedEmail } from "@/lib/email";
import { generateAccessToken, generateBookingReference, formatDate } from "@/lib/utils";
import { isDemoMode } from "@/lib/env";

export type CreateBookingResult =
  | { ok: true; reference: string; accessToken: string; isSimulated: boolean }
  | { ok: false; error: string };

class OversellError extends Error {}

export async function createBooking(input: CheckoutInput): Promise<CreateBookingResult> {
  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos no válidos" };
  }
  const data = parsed.data;

  const trip = await prisma.trip.findUnique({ where: { id: data.tripId } });
  if (!trip) return { ok: false, error: "Viaje no encontrado" };
  if (trip.status !== "open") return { ok: false, error: "Este viaje ya no admite nuevas reservas" };

  const travelersCount = data.travelers.length;
  const singleRooms = data.travelers.filter((t) => t.roomPreference === "single").length;
  const price = calculateBookingPrice(trip, travelersCount, singleRooms);

  const reference = generateBookingReference();
  const accessToken = generateAccessToken();

  let bookingId: string;
  try {
    bookingId = await prisma.$transaction(async (tx) => {
      // Re-read inside the transaction so two simultaneous checkouts can't
      // both pass the capacity check for the last remaining spots.
      const freshTrip = await tx.trip.findUniqueOrThrow({ where: { id: trip.id } });
      if (freshTrip.status !== "open") throw new OversellError("Este viaje ya no admite nuevas reservas");
      if (freshTrip.soldSpots + travelersCount > freshTrip.maxSpots) {
        throw new OversellError("No quedan plazas suficientes para este número de viajeros");
      }

      const booking = await tx.booking.create({
        data: {
          reference,
          tripId: trip.id,
          buyerFirstName: data.buyerFirstName,
          buyerLastName: data.buyerLastName,
          buyerEmail: data.buyerEmail,
          buyerPhone: data.buyerPhone,
          originCity: data.originCity,
          billingAddress: data.billingAddress || "",
          travelersCount,
          singleRooms,
          totalPrice: price.total,
          currency: trip.currency,
          paymentProvider: isDemoMode() || trip.isDemo ? "demo" : data.paymentMethod === "paypal" ? "paypal" : "stripe",
          paymentStatus: "pending",
          bookingStatus: "pending_payment",
          accessToken,
        },
      });

      await tx.traveler.createMany({
        data: data.travelers.map((t) => ({
          bookingId: booking.id,
          firstName: t.firstName,
          lastName: t.lastName,
          roomPreference: t.roomPreference,
          roomPartnerName: t.roomPartnerName || "",
        })),
      });

      const newSoldSpots = freshTrip.soldSpots + travelersCount;
      await tx.trip.update({
        where: { id: trip.id },
        data: {
          soldSpots: newSoldSpots,
          status: newSoldSpots >= freshTrip.maxSpots ? "sold_out" : freshTrip.status,
        },
      });

      return booking.id;
    });
  } catch (err) {
    if (err instanceof OversellError) return { ok: false, error: err.message };
    throw err;
  }

  const provider = getPaymentProvider(data.paymentMethod, { tripIsDemo: trip.isDemo });
  const charge = await provider.charge({
    bookingReference: reference,
    amount: price.total,
    currency: trip.currency,
    method: data.paymentMethod,
    buyerEmail: data.buyerEmail,
    description: `${trip.name} — ${trip.subtitle}`,
  });

  if (!charge.success) {
    // Release the held spots and mark the booking failed.
    await prisma.$transaction([
      prisma.booking.update({
        where: { id: bookingId },
        data: { paymentStatus: "failed", bookingStatus: "cancelled" },
      }),
      // trip.status was checked to be "open" before the transaction started;
      // if this booking had just pushed it to sold_out, releasing its spots
      // reopens it.
      prisma.trip.update({
        where: { id: trip.id },
        data: { soldSpots: { decrement: travelersCount }, status: "open" },
      }),
    ]);
    return { ok: false, error: "No se ha podido procesar el pago. Inténtalo de nuevo." };
  }

  await prisma.booking.update({
    where: { id: bookingId },
    data: { paymentStatus: "paid", bookingStatus: "confirmed" },
  });

  const departureDate = new Date(trip.matchDate);
  departureDate.setDate(departureDate.getDate() - 1);
  const returnDate = new Date(trip.matchDate);
  returnDate.setDate(returnDate.getDate() + 1);

  await sendTemplatedEmail({
    templateKey: "booking_confirmed",
    to: data.buyerEmail,
    bookingId,
    variables: {
      firstName: data.buyerFirstName,
      tripName: trip.name,
      tripNumber: `#${String(trip.number).padStart(3, "0")}`,
      departureCity: data.originCity,
      departureDate: formatDate(departureDate),
      returnDate: formatDate(returnDate),
      whatsappUrl: trip.whatsappUrl || "",
    },
  });

  return { ok: true, reference, accessToken, isSimulated: charge.isSimulated };
}
