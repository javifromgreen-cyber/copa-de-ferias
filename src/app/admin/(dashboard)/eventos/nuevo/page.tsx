import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { EventForm, type TripOption, type CompetitionOption } from "@/components/admin/EventForm";
import type { EventFormInput } from "@/server/actions/admin-events";

export const metadata: Metadata = { title: "Admin — Nuevo evento" };

export default async function NewEventPage({ searchParams }: { searchParams: Promise<{ tripId?: string }> }) {
  const { tripId } = await searchParams;
  const [trips, competitions] = await Promise.all([
    prisma.trip.findMany({ orderBy: { number: "asc" }, select: { id: true, name: true, number: true, travelMode: true } }),
    prisma.competition.findMany({ orderBy: { name: "asc" } }),
  ]);

  const blank: EventFormInput = {
    tripId: tripId ?? "",
    competitionId: "",
    name: "",
    homeTeam: "",
    awayTeam: "",
    stadium: "",
    city: "",
    country: "",
    timezone: "Europe/Madrid",
    matchDate: "",
    kickoff: "",
    scheduleStatus: "provisional",
    status: "draft",
    imageKey: "default",
    primaryEvent: true,
    order: 0,
  };

  return (
    <div>
      <h1 className="font-display mb-6 text-2xl uppercase">Nuevo evento</h1>
      <EventForm initial={blank} trips={trips as TripOption[]} competitions={competitions as unknown as CompetitionOption[]} />
    </div>
  );
}
