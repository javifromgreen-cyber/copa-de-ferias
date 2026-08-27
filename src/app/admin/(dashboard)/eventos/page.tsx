import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { REGION_LABELS } from "@/lib/catalog/labels";

export const metadata: Metadata = { title: "Admin — Eventos" };

export default async function AdminEventsPage() {
  const events = await prisma.event.findMany({
    include: { trip: true, competition: true, ticketOffers: true },
    orderBy: { matchDate: "asc" },
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl uppercase">Eventos</h1>
        <Link href="/admin/eventos/nuevo" className="rounded-sm bg-carbon px-4 py-2 text-sm font-semibold text-ivory">
          + Nuevo evento
        </Link>
      </div>

      <div className="overflow-x-auto rounded-sm border border-carbon/15 bg-white">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-carbon/10 text-xs tracking-wide text-carbon/50 uppercase">
            <tr>
              <th className="px-4 py-3">Partido</th>
              <th className="px-4 py-3">Producto</th>
              <th className="px-4 py-3">Competición</th>
              <th className="px-4 py-3">Región</th>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Horario</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Entradas</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id} className="border-b border-carbon/5 last:border-0">
                <td className="px-4 py-3">
                  <Link href={`/admin/eventos/${event.id}`} className="font-medium hover:underline">
                    {event.homeTeam} vs {event.awayTeam}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <Link href={`/admin/viajes/${event.tripId}`} className="hover:underline">
                    {event.trip.name}
                  </Link>
                </td>
                <td className="px-4 py-3">{event.competition?.name ?? "— sin clasificar —"}</td>
                <td className="px-4 py-3">{event.competition ? REGION_LABELS[event.competition.region] : "—"}</td>
                <td className="px-4 py-3">{event.matchDate.toLocaleDateString("es-ES")}</td>
                <td className="px-4 py-3">{event.scheduleStatus === "provisional" ? "Provisional" : "Confirmado"}</td>
                <td className="px-4 py-3">{event.status}</td>
                <td className="px-4 py-3">{event.ticketOffers.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {events.length === 0 ? <p className="mt-6 text-carbon/60">Todavía no hay eventos.</p> : null}
    </div>
  );
}
