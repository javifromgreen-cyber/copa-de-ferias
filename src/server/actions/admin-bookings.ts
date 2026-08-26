"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

export async function updateBookingNotes(bookingId: string, notes: string) {
  await prisma.booking.update({ where: { id: bookingId }, data: { internalNotes: notes } });
  revalidatePath(`/admin/reservas/${bookingId}`);
}

/**
 * Cancels a booking and releases its spots back to the trip. Marks the
 * payment as refunded — in production this would trigger a real refund via
 * the original payment provider before this status change.
 */
export async function cancelAndRefundBooking(bookingId: string) {
  const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId }, include: { trip: true } });

  await prisma.$transaction([
    prisma.booking.update({
      where: { id: bookingId },
      data: { bookingStatus: "cancelled", paymentStatus: "refunded" },
    }),
    prisma.trip.update({
      where: { id: booking.tripId },
      data: {
        soldSpots: { decrement: booking.travelersCount },
        status: booking.trip.status === "sold_out" ? "open" : booking.trip.status,
      },
    }),
  ]);

  revalidatePath(`/admin/reservas/${bookingId}`);
  revalidatePath("/admin/reservas");
  revalidatePath("/admin/viajes");
}

export async function updatePassportStatus(bookingId: string, passportStatus: "pending" | "prepared" | "sent") {
  await prisma.booking.update({
    where: { id: bookingId },
    data: { passportStatus, hasReceivedPassport: passportStatus === "sent" },
  });
  revalidatePath(`/admin/reservas/${bookingId}`);
}

export async function resolveChangeRequest(
  requestId: string,
  input: { status: "in_review" | "approved" | "rejected" | "completed"; resolutionNotes: string; cost?: number }
) {
  await prisma.changeRequest.update({
    where: { id: requestId },
    data: { status: input.status, resolutionNotes: input.resolutionNotes, cost: input.cost },
  });
  revalidatePath("/admin/reservas");
}
