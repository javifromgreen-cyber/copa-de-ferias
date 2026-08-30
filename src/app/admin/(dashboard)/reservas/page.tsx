import Link from "next/link";
import type { Metadata } from "next";
import type { Prisma, BookingStatus, PackageType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/utils";
import { bookingStatusLabel } from "@/lib/mi-viaje/statusLabels";
import { PACKAGE_TYPE_COPY } from "@/lib/checkout-atu-aire/packageRequirements";

export const metadata: Metadata = { title: "Admin — Reservas" };

const STATUS_OPTIONS: BookingStatus[] = ["pending_payment", "confirmed", "cancellation_requested", "cancelled", "refund_pending", "refunded"];
const MODALITY_OPTIONS: PackageType[] = ["TICKET_ONLY", "TICKET_HOTEL", "TICKET_HOTEL_FLIGHT"];

const selectClass = "rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm";

export default async function AdminBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; modality?: string; competitionId?: string; from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const status = sp.status ?? "";
  const modality = sp.modality ?? "";
  const competitionId = sp.competitionId ?? "";
  const from = sp.from ?? "";
  const to = sp.to ?? "";

  const where: Prisma.BookingWhereInput = {};
  if (status) where.bookingStatus = status as BookingStatus;
  if (modality) where.packageType = modality as PackageType;
  if (competitionId) where.trip = { events: { some: { competitionId } } };
  if (from || to) {
    where.createdAt = { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(`${to}T23:59:59`) } : {}) };
  }
  if (q) {
    where.OR = [
      { reference: { contains: q } },
      { buyerEmail: { contains: q } },
      { buyerFirstName: { contains: q } },
      { buyerLastName: { contains: q } },
      { trip: { name: { contains: q } } },
      { trip: { events: { some: { OR: [{ homeTeam: { contains: q } }, { awayTeam: { contains: q } }] } } } },
    ];
  }

  const [bookings, competitions] = await Promise.all([
    prisma.booking.findMany({ where, orderBy: { createdAt: "desc" }, include: { trip: true, travelers: true } }),
    prisma.competition.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl uppercase">Reservas</h1>
        {/* File download endpoint, not a page — plain <a> is intentional. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/admin/reservas/export" className="text-sm underline">
          Exportar CSV
        </a>
      </div>

      <form method="get" className="mb-4 flex flex-wrap items-end gap-3 rounded-sm border border-carbon/15 bg-white p-4">
        <div>
          <label htmlFor="f-q" className="mb-1 block text-xs tracking-wide text-carbon/60 uppercase">
            Buscar
          </label>
          <input
            id="f-q"
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Referencia, email, nombre, partido…"
            className="w-64 rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="f-status" className="mb-1 block text-xs tracking-wide text-carbon/60 uppercase">
            Estado
          </label>
          <select id="f-status" name="status" defaultValue={status} className={selectClass}>
            <option value="">Todos</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {bookingStatusLabel(s)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="f-modality" className="mb-1 block text-xs tracking-wide text-carbon/60 uppercase">
            Modalidad
          </label>
          <select id="f-modality" name="modality" defaultValue={modality} className={selectClass}>
            <option value="">Todas</option>
            {MODALITY_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {PACKAGE_TYPE_COPY[m].label}
              </option>
            ))}
          </select>
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
        {q || status || modality || competitionId || from || to ? (
          <Link href="/admin/reservas" className="text-xs underline">
            Limpiar filtros
          </Link>
        ) : null}
      </form>

      <div className="overflow-x-auto rounded-sm border border-carbon/15 bg-white">
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead className="border-b border-carbon/10 text-xs tracking-wide text-carbon/50 uppercase">
            <tr>
              <th className="px-4 py-3">Referencia</th>
              <th className="px-4 py-3">Comprador</th>
              <th className="px-4 py-3">Viaje</th>
              <th className="px-4 py-3">Modalidad</th>
              <th className="px-4 py-3">Viajeros</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Pago</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Fecha</th>
            </tr>
          </thead>
          <tbody>
            {bookings.map((b) => (
              <tr key={b.id} className="border-b border-carbon/5 last:border-0">
                <td className="px-4 py-3">
                  <Link href={`/admin/reservas/${b.id}`} className="font-medium hover:underline">
                    {b.reference}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  {b.buyerFirstName} {b.buyerLastName}
                  <br />
                  <span className="text-xs text-carbon/50">{b.buyerEmail}</span>
                </td>
                <td className="px-4 py-3">{b.trip.name}</td>
                <td className="px-4 py-3">{b.packageType ? PACKAGE_TYPE_COPY[b.packageType].label : "Grupo CDF"}</td>
                <td className="px-4 py-3">{b.travelersCount}</td>
                <td className="px-4 py-3">{formatCurrency(b.totalPrice, b.currency)}</td>
                <td className="px-4 py-3">
                  {b.paymentProvider} · {b.paymentStatus}
                </td>
                <td className="px-4 py-3">{bookingStatusLabel(b.bookingStatus)}</td>
                <td className="px-4 py-3">{formatDate(b.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {bookings.length === 0 ? <p className="mt-6 text-carbon/60">No hay reservas que coincidan con estos filtros.</p> : null}
    </div>
  );
}
