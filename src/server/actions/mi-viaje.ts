"use server";

import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { miViajeLookupSchema, travelerDetailsSchema, travelerContactSchema, changeRequestSchema } from "@/lib/validation/schemas";
import { MI_VIAJE_COOKIE_NAME } from "@/lib/mi-viaje/cookies";

export type LookupResult = { ok: true; accessToken: string } | { ok: false; error: string };

// Remembers the last booking a visitor successfully authorized on this
// device, purely as a convenience so a future visit to /mi-viaje can skip
// straight to it (correction microblock §4) — never a real session/account
// system. The cookie holds the SAME accessToken that already gates
// /mi-viaje/[token]; storing it httpOnly just keeps it out of reach of
// page JS, it grants nothing a stolen URL wouldn't already grant.
const MI_VIAJE_COOKIE_MAX_AGE = 60 * 60 * 24 * 180; // 180 days

/**
 * Security (correction microblock §3): the reference alone is semi-public
 * (it appears in URLs/emails) and must never be enough on its own — access
 * requires the reference AND the exact buyer email to match the same
 * booking. On any mismatch this returns one generic error, never revealing
 * whether the reference exists or which part was wrong (no enumeration).
 * The accessToken itself is never put in a form field — only ever handed
 * back inside this authorized server response, exactly like the existing
 * confirmación-page flow already does.
 */
export async function lookupTripAccess(input: { reference: string; email: string }): Promise<LookupResult> {
  const parsed = miViajeLookupSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos no válidos" };

  const booking = await prisma.booking.findFirst({
    where: {
      reference: { equals: parsed.data.reference },
      buyerEmail: { equals: parsed.data.email },
    },
  });

  if (!booking) return { ok: false, error: "No encontramos ninguna reserva con esos datos" };

  const cookieStore = await cookies();
  cookieStore.set(MI_VIAJE_COOKIE_NAME, booking.accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MI_VIAJE_COOKIE_MAX_AGE,
  });

  return { ok: true, accessToken: booking.accessToken };
}

async function requireBooking(accessToken: string) {
  const booking = await prisma.booking.findUnique({ where: { accessToken } });
  if (!booking) throw new Error("Acceso no válido");
  return booking;
}

export async function updateTravelerDetails(
  accessToken: string,
  input: {
    travelerId: string;
    nationality?: string;
    sex?: string;
    docType?: string;
    docNumber?: string;
    docExpiry?: string;
    docCountry?: string;
    phone?: string;
    emergencyContactName?: string;
    emergencyContactPhone?: string;
  }
) {
  const booking = await requireBooking(accessToken);
  const parsed = travelerDetailsSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Datos no válidos" };

  const traveler = await prisma.traveler.findUnique({ where: { id: parsed.data.travelerId } });
  if (!traveler || traveler.bookingId !== booking.id) return { ok: false as const, error: "Viajero no válido" };

  await prisma.traveler.update({
    where: { id: traveler.id },
    data: {
      nationality: parsed.data.nationality,
      sex: parsed.data.sex,
      docType: parsed.data.docType,
      docNumber: parsed.data.docNumber,
      docExpiry: parsed.data.docExpiry ? new Date(parsed.data.docExpiry) : null,
      docCountry: parsed.data.docCountry,
      phone: parsed.data.phone,
      emergencyContactName: parsed.data.emergencyContactName,
      emergencyContactPhone: parsed.data.emergencyContactPhone,
    },
  });

  return { ok: true as const };
}

/**
 * A_TU_AIRE Mi Viaje's restricted counterpart to updateTravelerDetails
 * above (§15) — contact fields only, so a customer can never inadvertently
 * (or the UI never lets them) touch a name/nationality/document already
 * tied to an issued ticket. Kept as its own action, not a partial call
 * into updateTravelerDetails, because that schema defaults every omitted
 * field to "" and would blank out the traveler's real document data.
 */
export async function updateTravelerContact(
  accessToken: string,
  input: { travelerId: string; phone?: string; emergencyContactName?: string; emergencyContactPhone?: string }
) {
  const booking = await requireBooking(accessToken);
  const parsed = travelerContactSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Datos no válidos" };

  const traveler = await prisma.traveler.findUnique({ where: { id: parsed.data.travelerId } });
  if (!traveler || traveler.bookingId !== booking.id) return { ok: false as const, error: "Viajero no válido" };

  await prisma.traveler.update({
    where: { id: traveler.id },
    data: {
      phone: parsed.data.phone,
      emergencyContactName: parsed.data.emergencyContactName,
      emergencyContactPhone: parsed.data.emergencyContactPhone,
    },
  });

  return { ok: true as const };
}

export async function requestBookingChange(
  accessToken: string,
  input: { type: "name_change" | "important_change" | "cancellation"; description: string }
) {
  const booking = await requireBooking(accessToken);
  const parsed = changeRequestSchema.safeParse({ bookingId: booking.id, ...input });
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Datos no válidos" };

  await prisma.changeRequest.create({
    data: { bookingId: booking.id, type: parsed.data.type, description: parsed.data.description },
  });

  if (parsed.data.type === "cancellation") {
    await prisma.booking.update({ where: { id: booking.id }, data: { bookingStatus: "cancellation_requested" } });
  }

  return { ok: true as const };
}
