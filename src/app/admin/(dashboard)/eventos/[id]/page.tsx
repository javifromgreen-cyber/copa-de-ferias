import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { EventForm, type TripOption, type CompetitionOption } from "@/components/admin/EventForm";
import { TicketOfferManager, type TicketOfferRow } from "@/components/admin/TicketOfferManager";
import type { EventFormInput } from "@/server/actions/admin-events";

export const metadata: Metadata = { title: "Admin — Editar evento" };

function toDateTimeLocal(d: Date | null) {
  if (!d) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [event, trips, competitions] = await Promise.all([
    prisma.event.findUnique({ where: { id }, include: { ticketOffers: { orderBy: { createdAt: "asc" } } } }),
    prisma.trip.findMany({ orderBy: { number: "asc" }, select: { id: true, name: true, number: true, travelMode: true } }),
    prisma.competition.findMany({ orderBy: { name: "asc" } }),
  ]);
  if (!event) notFound();

  const initial: EventFormInput = {
    id: event.id,
    tripId: event.tripId,
    competitionId: event.competitionId ?? "",
    name: event.name,
    homeTeam: event.homeTeam,
    awayTeam: event.awayTeam,
    stadium: event.stadium,
    city: event.city,
    country: event.country,
    timezone: event.timezone,
    matchDate: event.matchDate.toISOString().slice(0, 10),
    kickoff: toDateTimeLocal(event.kickoff),
    scheduleStatus: event.scheduleStatus,
    status: event.status,
    imageKey: event.imageKey,
    primaryEvent: event.primaryEvent,
    order: event.order,
  };

  const offers: TicketOfferRow[] = event.ticketOffers.map((o) => ({
    id: o.id,
    provider: o.provider,
    category: o.category,
    sector: o.sector,
    costNet: o.costNet,
    currency: o.currency,
    stock: o.stock,
    maxQuantity: o.maxQuantity,
    active: o.active,
    seatingTogetherGuaranteed: o.seatingTogetherGuaranteed,
    deliveryType: o.deliveryType,
    deliveryNotes: o.deliveryNotes,
    restrictions: o.restrictions,
    internalNotes: o.internalNotes,
    validUntil: o.validUntil ? o.validUntil.toISOString() : null,
  }));

  return (
    <div>
      <h1 className="font-display mb-6 text-2xl uppercase">
        Editar evento — {event.homeTeam} vs {event.awayTeam}
      </h1>

      <EventForm initial={initial} trips={trips as TripOption[]} competitions={competitions as unknown as CompetitionOption[]} />

      <div className="mt-8">
        <h2 className="font-display mb-3 text-lg uppercase">Ofertas de entradas</h2>
        <TicketOfferManager eventId={event.id} offers={offers} />
      </div>
    </div>
  );
}
