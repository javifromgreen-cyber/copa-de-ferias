import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { EventForm, type TripOption, type CompetitionOption } from "@/components/admin/EventForm";
import { TicketOfferManager, type TicketOfferRow } from "@/components/admin/TicketOfferManager";
import type { EventFormInput } from "@/server/actions/admin-events";
import { eventHasBookings } from "@/lib/events/bookingRefs";
import { extractMatchTimeUTC } from "@/lib/events/matchDateTime";

export const metadata: Metadata = { title: "Admin — Editar evento" };

function toDateTimeLocal(d: Date | null) {
  if (!d) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [event, trips, competitions] = await Promise.all([
    prisma.event.findUnique({
      where: { id },
      include: {
        ticketOffers: { orderBy: { createdAt: "asc" } },
        trip: { select: { homeFeatured: true, bookings: { select: { priceBreakdownSnapshot: true } } } },
      },
    }),
    prisma.trip.findMany({ orderBy: { number: "asc" }, select: { id: true, name: true, number: true, travelMode: true } }),
    prisma.competition.findMany({ orderBy: { name: "asc" } }),
  ]);
  if (!event) notFound();

  const hasBookings = eventHasBookings(event.id, event.trip.bookings);

  const warnings: { text: string; tone: "alert" | "info" }[] = [];
  if (event.ticketOffers.length === 0) warnings.push({ text: "Sin ofertas de entradas — este partido no se puede vender todavía.", tone: "alert" });
  if (event.imageKey === "default") warnings.push({ text: "Sin imagen propia — usa la imagen por defecto.", tone: "info" });
  if (event.scheduleStatus !== "confirmed") warnings.push({ text: "Horario provisional — revisa antes de publicar si aún no lo has hecho.", tone: "info" });
  if (event.status === "published") warnings.push({ text: "Publicado — visible en el catálogo público.", tone: "info" });
  else warnings.push({ text: "Borrador — no visible en el catálogo público.", tone: "info" });
  if (event.trip.homeFeatured) warnings.push({ text: "El producto de este evento está destacado en Home.", tone: "info" });
  if (hasBookings) warnings.push({ text: "Este evento ya tiene reservas asociadas — evita eliminarlo o cambiar equipos/estadio sin necesidad.", tone: "alert" });

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
    matchTime: extractMatchTimeUTC(event.matchDate),
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

      <ul className="mb-6 space-y-1.5">
        {warnings.map((w, i) => (
          <li key={i} className={`rounded-sm px-3 py-2 text-xs ${w.tone === "alert" ? "bg-stamp/10 text-stamp" : "bg-ivory-dark/60 text-carbon/70"}`}>
            {w.text}
          </li>
        ))}
      </ul>

      <EventForm initial={initial} trips={trips as TripOption[]} competitions={competitions as unknown as CompetitionOption[]} />

      <div className="mt-8">
        <h2 className="font-display mb-3 text-lg uppercase">Ofertas de entradas</h2>
        <TicketOfferManager eventId={event.id} offers={offers} />
      </div>
    </div>
  );
}
