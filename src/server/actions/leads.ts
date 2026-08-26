"use server";

import { prisma } from "@/lib/db";
import { leadSchema, generalLeadSchema } from "@/lib/validation/schemas";
import { sendTemplatedEmail } from "@/lib/email";

export type SubmitLeadResult = { ok: true } | { ok: false; error: string };

export async function submitLead(
  type: "notify" | "waitlist",
  input: { tripId: string; name: string; email: string; city: string; consent: boolean }
): Promise<SubmitLeadResult> {
  const parsed = leadSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos no válidos" };
  }

  const trip = await prisma.trip.findUnique({ where: { id: parsed.data.tripId } });
  if (!trip) return { ok: false, error: "Viaje no encontrado" };

  await prisma.lead.create({
    data: {
      tripId: parsed.data.tripId,
      type,
      name: parsed.data.name,
      email: parsed.data.email,
      city: parsed.data.city,
      consent: parsed.data.consent,
    },
  });

  if (type === "notify") {
    // Prepared but disabled by default (BrandConfig.notifyEmailEnabled) —
    // spec §12. Admin can turn it on from Configuración.
    const brand = await prisma.brandConfig.findUnique({ where: { id: "default" } });
    if (brand?.notifyEmailEnabled) {
      await sendTemplatedEmail({
        templateKey: "notify_confirmation",
        to: parsed.data.email,
        variables: { firstName: parsed.data.name, tripName: trip.name },
      });
    }
  }

  return { ok: true };
}

/** "Entérate antes que nadie de la próxima salida" — home capture, spec §14. */
export async function submitGeneralLead(input: { email: string; consent: boolean }): Promise<SubmitLeadResult> {
  const parsed = generalLeadSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos no válidos" };
  }

  await prisma.lead.create({
    data: { type: "general", email: parsed.data.email, consent: parsed.data.consent },
  });

  return { ok: true };
}
