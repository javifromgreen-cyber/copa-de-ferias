import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { TripForm } from "@/components/admin/TripForm";
import { tripToFormInput } from "@/lib/admin/trip-form-mapping";

export const metadata: Metadata = { title: "Admin — Editar viaje" };

export default async function EditTripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [trip, feeConfig, events] = await Promise.all([
    prisma.trip.findUnique({
      where: { id },
      include: {
        origins: { orderBy: { order: "asc" } },
        planningDays: { orderBy: { order: "asc" } },
        activities: { orderBy: { order: "asc" } },
        inclusions: { orderBy: { order: "asc" } },
        requirements: { orderBy: { order: "asc" } },
        faqs: { orderBy: { order: "asc" } },
      },
    }),
    prisma.organizationFeeConfig.upsert({ where: { id: "default" }, create: { id: "default" }, update: {} }),
    prisma.event.findMany({ where: { tripId: id }, include: { competition: true, ticketOffers: true }, orderBy: { order: "asc" } }),
  ]);
  if (!trip) notFound();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl uppercase">
          Editar — {trip.name} #{String(trip.number).padStart(3, "0")}
        </h1>
        {trip.published ? (
          <Link href={`/viajes/${trip.slug}`} target="_blank" className="text-sm underline">
            Ver ficha pública ↗
          </Link>
        ) : null}
      </div>
      <p className="mb-6 text-sm text-carbon/60">
        Plazas vendidas: {trip.soldSpots} (se actualizan automáticamente con las reservas).
      </p>

      <div className="mb-6 rounded-sm border border-carbon/15 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-wide uppercase">Eventos de este producto</h2>
          <Link href={`/admin/eventos/nuevo?tripId=${trip.id}`} className="text-xs underline">
            + Nuevo evento
          </Link>
        </div>
        {events.length === 0 ? (
          <p className="text-sm text-carbon/60">Todavía no hay eventos para este producto.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {events.map((event) => (
              <li key={event.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-carbon/5 pb-2 last:border-0">
                <Link href={`/admin/eventos/${event.id}`} className="hover:underline">
                  {event.homeTeam} vs {event.awayTeam} — {event.matchDate.toLocaleDateString("es-ES")}
                  {event.competition ? ` · ${event.competition.name}` : " · sin competición"}
                </Link>
                <span className="text-xs text-carbon/50">
                  {event.status} · {event.scheduleStatus} · {event.ticketOffers.length} oferta(s) de entrada
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <TripForm initial={tripToFormInput(trip)} globalFeeConfig={feeConfig} />
    </div>
  );
}
