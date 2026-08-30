"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import type { ScheduleStatus, EventStatus } from "@prisma/client";
import { validateEventPublishable } from "@/lib/events/validation";
import { eventHasBookings } from "@/lib/events/bookingRefs";
import { combineMatchDateTime } from "@/lib/events/matchDateTime";

export type EventFormInput = {
  id?: string;
  tripId: string;
  competitionId: string; // "" while unclassified/draft
  name: string;
  homeTeam: string;
  awayTeam: string;
  stadium: string;
  city: string;
  country: string;
  timezone: string;
  matchDate: string; // yyyy-mm-dd (UTC)
  matchTime: string; // HH:mm (UTC) — combined with matchDate to form the real matchDate; "" falls back to 00:00
  kickoff: string; // datetime-local value or ""
  scheduleStatus: ScheduleStatus;
  status: EventStatus;
  imageKey: string;
  primaryEvent: boolean;
  order: number;
};

export async function saveEvent(input: EventFormInput): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!input.tripId) return { ok: false, error: "Selecciona el producto (viaje) al que pertenece este evento" };
  if (!input.homeTeam.trim() || !input.awayTeam.trim()) return { ok: false, error: "Faltan los equipos local y visitante" };
  if (!input.stadium.trim()) return { ok: false, error: "Falta el estadio" };
  if (!input.matchDate) return { ok: false, error: "Falta la fecha del partido" };

  if (input.status === "published") {
    const check = validateEventPublishable({
      competitionId: input.competitionId || null,
      homeTeam: input.homeTeam,
      awayTeam: input.awayTeam,
      stadium: input.stadium,
    });
    if (!check.ok) return { ok: false, error: check.error };
  }

  const data = {
    tripId: input.tripId,
    competitionId: input.competitionId || null,
    name: input.name.trim(),
    homeTeam: input.homeTeam.trim(),
    awayTeam: input.awayTeam.trim(),
    stadium: input.stadium.trim(),
    city: input.city.trim(),
    country: input.country.trim(),
    timezone: input.timezone.trim() || "Europe/Madrid",
    matchDate: combineMatchDateTime(input.matchDate, input.matchTime),
    kickoff: input.kickoff ? new Date(input.kickoff) : null,
    scheduleStatus: input.scheduleStatus,
    status: input.status,
    imageKey: input.imageKey.trim() || "default",
    primaryEvent: input.primaryEvent,
    order: input.order,
  };

  const event = input.id
    ? await prisma.event.update({ where: { id: input.id }, data })
    : await prisma.event.create({ data });

  revalidatePath("/admin/eventos");
  revalidatePath(`/admin/viajes/${input.tripId}`);
  return { ok: true, id: event.id };
}

/**
 * Never hard-deletes an Event that a real booking already references (via
 * priceBreakdownSnapshot.ticketSelections) — deleting it would break that
 * booking's "Mi Viaje" event lookup for good. Unpublish/cancel the event
 * instead when it already has bookings.
 */
export async function deleteEvent(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const event = await prisma.event.findUniqueOrThrow({
    where: { id },
    include: { trip: { select: { bookings: { select: { priceBreakdownSnapshot: true } } } } },
  });

  if (eventHasBookings(id, event.trip.bookings)) {
    return { ok: false, error: "Este evento tiene reservas asociadas y no se puede eliminar. Márcalo como cancelado o despublícalo en su lugar." };
  }

  await prisma.event.delete({ where: { id } });
  revalidatePath("/admin/eventos");
  revalidatePath(`/admin/viajes/${event.tripId}`);
  return { ok: true };
}
