"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import {
  adminTravelerEditSchema,
  bookingDocumentSchema,
  bookingUpdateSchema,
  bookingActionSchema,
  type AdminTravelerEditInput,
  type BookingDocumentInput,
  type BookingUpdateInput,
  type BookingActionInput,
} from "@/lib/validation/schemas";
import { sendTemplatedEmail, buildBookingEmailVariables } from "@/lib/email";
import { formatDate } from "@/lib/utils";

function parseFormDate(value: string): Date | null {
  return value ? new Date(value) : null;
}

/**
 * Admin correction of any traveler field, including name/document data
 * already tied to an issued ticket — the UI carries the cautionary copy
 * ("modificar este dato después de la reserva puede requerir validación con
 * el proveedor"); this action itself never invents costs/penalties, it just
 * writes the corrected value.
 */
export async function adminUpdateTraveler(input: AdminTravelerEditInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = adminTravelerEditSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos no válidos" };

  const traveler = await prisma.traveler.findUnique({ where: { id: parsed.data.travelerId } });
  if (!traveler) return { ok: false, error: "Viajero no encontrado" };

  await prisma.traveler.update({
    where: { id: traveler.id },
    data: {
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      birthDate: parseFormDate(parsed.data.birthDate),
      originCity: parsed.data.originCity,
      nationality: parsed.data.nationality,
      sex: parsed.data.sex,
      docType: parsed.data.docType,
      docNumber: parsed.data.docNumber,
      docExpiry: parseFormDate(parsed.data.docExpiry),
      docCountry: parsed.data.docCountry,
      phone: parsed.data.phone,
      emergencyContactName: parsed.data.emergencyContactName,
      emergencyContactPhone: parsed.data.emergencyContactPhone,
    },
  });

  revalidatePath(`/admin/reservas/${traveler.bookingId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------
// BookingDocument — Admin's side of Mi Viaje's "Documentación" block. A
// status change here reflects immediately in Mi Viaje (same table, no
// separate cache) — no fake PDFs: fileUrl stays "" until a real document
// exists.
// ---------------------------------------------------------------------

export async function createBookingDocument(input: BookingDocumentInput): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const parsed = bookingDocumentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos no válidos" };

  const doc = await prisma.bookingDocument.create({
    data: {
      bookingId: parsed.data.bookingId,
      type: parsed.data.type,
      eventId: parsed.data.eventId,
      label: parsed.data.label,
      status: parsed.data.status,
      fileUrl: parsed.data.fileUrl,
    },
  });

  revalidatePath(`/admin/reservas/${parsed.data.bookingId}`);
  return { ok: true, id: doc.id };
}

export async function updateBookingDocument(
  id: string,
  input: Omit<BookingDocumentInput, "bookingId">,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const existing = await prisma.bookingDocument.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "Documento no encontrado" };

  const parsed = bookingDocumentSchema.safeParse({ ...input, bookingId: existing.bookingId });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos no válidos" };

  await prisma.bookingDocument.update({
    where: { id },
    data: { type: parsed.data.type, eventId: parsed.data.eventId, label: parsed.data.label, status: parsed.data.status, fileUrl: parsed.data.fileUrl },
  });

  revalidatePath(`/admin/reservas/${existing.bookingId}`);
  return { ok: true };
}

export async function deleteBookingDocument(id: string) {
  const doc = await prisma.bookingDocument.findUniqueOrThrow({ where: { id } });
  await prisma.bookingDocument.delete({ where: { id } });
  revalidatePath(`/admin/reservas/${doc.bookingId}`);
}

// ---------------------------------------------------------------------
// BookingUpdate — append-only timeline, Mi Viaje "Actualizaciones".
// ---------------------------------------------------------------------

export async function createBookingUpdate(input: BookingUpdateInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = bookingUpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos no válidos" };

  await prisma.bookingUpdate.create({
    data: { bookingId: parsed.data.bookingId, title: parsed.data.title, message: parsed.data.message },
  });

  // "Cambio importante" (§2.3) — never automatic for every update, only
  // when Admin explicitly checks "notificar por email" for this one.
  if (parsed.data.notifyCustomer) {
    const booking = await prisma.booking.findUnique({ where: { id: parsed.data.bookingId }, include: { trip: true } });
    if (booking) {
      await sendTemplatedEmail({
        templateKey: "important_update",
        to: booking.buyerEmail,
        bookingId: booking.id,
        variables: { ...buildBookingEmailVariables(booking, booking.trip), updateTitle: parsed.data.title },
      });
    }
  }

  revalidatePath(`/admin/reservas/${parsed.data.bookingId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------
// BookingAction — Mi Viaje "Acciones necesarias". Never auto-generated;
// only ever created here by an explicit Admin decision.
// ---------------------------------------------------------------------

export async function createBookingAction(input: BookingActionInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = bookingActionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos no válidos" };

  const dueAt = parsed.data.dueAt ? new Date(parsed.data.dueAt) : null;

  await prisma.bookingAction.create({
    data: {
      bookingId: parsed.data.bookingId,
      type: parsed.data.type,
      title: parsed.data.title,
      description: parsed.data.description,
      actionUrl: parsed.data.actionUrl,
      dueAt,
    },
  });

  // "Acción necesaria" (§2.2) — never swept by a calendar, sent right here
  // at the moment Admin creates a real pending action.
  const booking = await prisma.booking.findUnique({ where: { id: parsed.data.bookingId }, include: { trip: true } });
  if (booking) {
    await sendTemplatedEmail({
      templateKey: "action_required",
      to: booking.buyerEmail,
      bookingId: booking.id,
      variables: {
        ...buildBookingEmailVariables(booking, booking.trip),
        actionTitle: parsed.data.title,
        actionDescription: parsed.data.description,
        actionDueDate: dueAt ? `Fecha límite: ${formatDate(dueAt)}` : "",
      },
    });
  }

  revalidatePath(`/admin/reservas/${parsed.data.bookingId}`);
  return { ok: true };
}

/**
 * Pendiente → Completada. Once completed, the action disappears from the
 * client's "Acciones necesarias" (buildAtuAireMiViajeView only lists
 * status === "pending") — the row itself is kept, never deleted, so the
 * history stays available in Admin.
 */
export async function completeBookingAction(id: string) {
  const action = await prisma.bookingAction.update({
    where: { id },
    data: { status: "completed", completedAt: new Date() },
  });
  revalidatePath(`/admin/reservas/${action.bookingId}`);
}

export async function reopenBookingAction(id: string) {
  const action = await prisma.bookingAction.update({
    where: { id },
    data: { status: "pending", completedAt: null },
  });
  revalidatePath(`/admin/reservas/${action.bookingId}`);
}
