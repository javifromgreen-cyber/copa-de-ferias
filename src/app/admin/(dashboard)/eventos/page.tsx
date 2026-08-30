import Link from "next/link";
import type { Metadata } from "next";
import type { Prisma, EventStatus, ScheduleStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { REGION_LABELS } from "@/lib/catalog/labels";

export const metadata: Metadata = { title: "Admin — Eventos" };

const STATUS_OPTIONS: EventStatus[] = ["draft", "published", "cancelled"];
const STATUS_LABELS: Record<EventStatus, string> = { draft: "Borrador", published: "Publicado", cancelled: "Cancelado" };
const SCHEDULE_OPTIONS: ScheduleStatus[] = ["confirmed", "time_provisional", "date_provisional"];
const SCHEDULE_LABELS: Record<ScheduleStatus, string> = {
  confirmed: "Confirmado",
  time_provisional: "Hora provisional",
  date_provisional: "Fecha provisional",
};

const selectClass = "rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm";

export default async function AdminEventsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; competitionId?: string; status?: string; scheduleStatus?: string; featured?: string; from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const competitionId = sp.competitionId ?? "";
  const status = sp.status ?? "";
  const scheduleStatus = sp.scheduleStatus ?? "";
  const featured = sp.featured ?? "";
  const from = sp.from ?? "";
  const to = sp.to ?? "";

  const where: Prisma.EventWhereInput = {};
  if (competitionId) where.competitionId = competitionId;
  if (status) where.status = status as EventStatus;
  if (scheduleStatus) where.scheduleStatus = scheduleStatus as ScheduleStatus;
  if (featured) where.trip = { homeFeatured: featured === "1" };
  if (from || to) {
    where.matchDate = { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(`${to}T23:59:59`) } : {}) };
  }
  if (q) {
    where.OR = [{ homeTeam: { contains: q } }, { awayTeam: { contains: q } }];
  }

  const [events, competitions] = await Promise.all([
    prisma.event.findMany({
      where,
      include: { trip: true, competition: true, ticketOffers: true },
      orderBy: { matchDate: "asc" },
    }),
    prisma.competition.findMany({ orderBy: { name: "asc" } }),
  ]);

  // Default order (§10): upcoming matches first (soonest first), past
  // matches after (most recent past first) — never mixed chronologically.
  const now = new Date();
  const upcoming = events.filter((e) => e.matchDate >= now).sort((a, b) => a.matchDate.getTime() - b.matchDate.getTime());
  const past = events.filter((e) => e.matchDate < now).sort((a, b) => b.matchDate.getTime() - a.matchDate.getTime());
  const sortedEvents = [...upcoming, ...past];

  const hasFilters = q || competitionId || status || scheduleStatus || featured || from || to;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl uppercase">Eventos</h1>
        <Link href="/admin/eventos/nuevo" className="rounded-sm bg-carbon px-4 py-2 text-sm font-semibold text-ivory">
          + Nuevo evento
        </Link>
      </div>

      <form method="get" className="mb-4 flex flex-wrap items-end gap-3 rounded-sm border border-carbon/15 bg-white p-4">
        <div>
          <label htmlFor="f-q" className="mb-1 block text-xs tracking-wide text-carbon/60 uppercase">
            Equipo
          </label>
          <input
            id="f-q"
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Arsenal…"
            className="w-48 rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="f-competitionId" className="mb-1 block text-xs tracking-wide text-carbon/60 uppercase">
            Competición
          </label>
          <select id="f-competitionId" name="competitionId" defaultValue={competitionId} className={selectClass}>
            <option value="">Todas</option>
            {competitions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="f-status" className="mb-1 block text-xs tracking-wide text-carbon/60 uppercase">
            Estado
          </label>
          <select id="f-status" name="status" defaultValue={status} className={selectClass}>
            <option value="">Todos</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="f-scheduleStatus" className="mb-1 block text-xs tracking-wide text-carbon/60 uppercase">
            Horario
          </label>
          <select id="f-scheduleStatus" name="scheduleStatus" defaultValue={scheduleStatus} className={selectClass}>
            <option value="">Todos</option>
            {SCHEDULE_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {SCHEDULE_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="f-featured" className="mb-1 block text-xs tracking-wide text-carbon/60 uppercase">
            Destacado en Home
          </label>
          <select id="f-featured" name="featured" defaultValue={featured} className={selectClass}>
            <option value="">Todos</option>
            <option value="1">Sí</option>
            <option value="0">No</option>
          </select>
        </div>
        <div>
          <label htmlFor="f-from" className="mb-1 block text-xs tracking-wide text-carbon/60 uppercase">
            Desde
          </label>
          <input id="f-from" type="date" name="from" defaultValue={from} className={selectClass} />
        </div>
        <div>
          <label htmlFor="f-to" className="mb-1 block text-xs tracking-wide text-carbon/60 uppercase">
            Hasta
          </label>
          <input id="f-to" type="date" name="to" defaultValue={to} className={selectClass} />
        </div>
        <button type="submit" className="rounded-sm bg-carbon px-4 py-2 text-sm font-semibold text-ivory">
          Filtrar
        </button>
        {hasFilters ? (
          <Link href="/admin/eventos" className="text-xs underline">
            Limpiar filtros
          </Link>
        ) : null}
      </form>

      <div className="overflow-x-auto rounded-sm border border-carbon/15 bg-white">
        <table className="w-full min-w-[980px] text-left text-sm">
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
              <th className="px-4 py-3">Avisos</th>
            </tr>
          </thead>
          <tbody>
            {sortedEvents.map((event) => {
              const badges: string[] = [];
              if (event.trip.homeFeatured) badges.push("Destacado");
              if (event.scheduleStatus !== "confirmed") badges.push("Horario provisional");
              if (event.ticketOffers.length === 0) badges.push("Sin entradas");
              if (event.status !== "published") badges.push("No publicado");
              return (
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
                  <td className="px-4 py-3">
                    {event.scheduleStatus === "confirmed" ? "Confirmado" : event.scheduleStatus === "time_provisional" ? "Hora provisional" : "Fecha provisional"}
                  </td>
                  <td className="px-4 py-3">{STATUS_LABELS[event.status]}</td>
                  <td className="px-4 py-3">{event.ticketOffers.length}</td>
                  <td className="px-4 py-3">
                    {badges.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {badges.map((b) => (
                          <span key={b} className="rounded-sm bg-stamp/10 px-2 py-0.5 text-xs text-stamp">
                            {b}
                          </span>
                        ))}
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {sortedEvents.length === 0 ? <p className="mt-6 text-carbon/60">No hay eventos que coincidan con estos filtros.</p> : null}
    </div>
  );
}
