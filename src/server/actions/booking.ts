"use server";

import { prisma } from "@/lib/db";
import { checkoutSchema, type CheckoutInput } from "@/lib/validation/schemas";
import { calculateBookingPrice } from "@/lib/trips/pricing";
import { getPaymentProvider } from "@/lib/payments";
import { sendTemplatedEmail, buildBookingEmailVariables } from "@/lib/email";
import { generateAccessToken, generateBookingReference } from "@/lib/utils";
import { isDemoMode } from "@/lib/env";
import { parseRequiredFields } from "@/lib/checkout/travelerFields";

type CheckoutTraveler = CheckoutInput["travelers"][number];

function travelerFieldValue(t: CheckoutTraveler, key: string): string {
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
    // emergencyContact needs BOTH sub-fields — checked separately below so
    // a partial name-only entry doesn't silently pass.
    default:
      return "";
  }
}

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

  // Server-side enforcement of this trip's required traveler fields — the
  // checkout UI already asks for these, but re-check here so it can't be
  // bypassed (see checkout §14/§56.J).
  const requiredFields = parseRequiredFields(trip.requiredTravelerFields);
  for (const t of data.travelers) {
    const name = `${t.firstName} ${t.lastName}`.trim();
    for (const key of requiredFields) {
      if (key === "emergencyContact") {
        if (!t.emergencyContactName || !t.emergencyContactPhone) {
          return { ok: false, error: `Falta el contacto de emergencia de ${name} para este viaje` };
        }
        continue;
      }
      if (!travelerFieldValue(t, key)) {
        return { ok: false, error: `Falta un dato obligatorio de ${name} para este viaje` };
      }
    }
    if (t.roomPreference === "share_same_sex" && !t.sex) {
      return { ok: false, error: `Indica el sexo de ${name} para poder buscarle compañero de habitación` };
    }
  }

  // Shipping/billing address lives once on the booking, not per traveler —
  // required only when this trip is configured to need it (checkout §4).
  if (trip.requiresShippingAddress && !data.billingAddress.trim()) {
    return { ok: false, error: "Indica una dirección de envío para este viaje" };
  }

  const originCity = data.travelers[0]?.originCity || "";
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
          originCity,
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
          originCity: t.originCity || "",
          birthDate: t.birthDate ? new Date(t.birthDate) : null,
          nationality: t.nationality || "",
          sex: t.sex || "",
          docType: t.docType || "",
          docNumber: t.docNumber || "",
          docExpiry: t.docExpiry ? new Date(t.docExpiry) : null,
          docCountry: t.docCountry || "",
          phone: t.phone || "",
          emergencyContactName: t.emergencyContactName || "",
          emergencyContactPhone: t.emergencyContactPhone || "",
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

  await sendTemplatedEmail({
    templateKey: "booking_confirmed",
    to: data.buyerEmail,
    bookingId,
    variables: buildBookingEmailVariables(
      { reference, accessToken, buyerFirstName: data.buyerFirstName, totalPrice: price.total, currency: trip.currency, travelersCount, partySize: null },
      trip,
    ),
  });

  return { ok: true, reference, accessToken, isSimulated: charge.isSimulated };
}
