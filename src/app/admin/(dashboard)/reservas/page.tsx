import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Admin — Reservas" };

export default async function AdminBookingsPage() {
  const bookings = await prisma.booking.findMany({
    orderBy: { createdAt: "desc" },
    include: { trip: true, travelers: true },
  });

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

      <div className="overflow-x-auto rounded-sm border border-carbon/15 bg-white">
        <table className="w-full min-w-[1000px] text-left text-sm">
          <thead className="border-b border-carbon/10 text-xs tracking-wide text-carbon/50 uppercase">
            <tr>
              <th className="px-4 py-3">Referencia</th>
              <th className="px-4 py-3">Comprador</th>
              <th className="px-4 py-3">Viaje</th>
              <th className="px-4 py-3">Origen</th>
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
                <td className="px-4 py-3">{b.originCity}</td>
                <td className="px-4 py-3">{b.travelersCount}</td>
                <td className="px-4 py-3">{formatCurrency(b.totalPrice, b.currency)}</td>
                <td className="px-4 py-3">
                  {b.paymentProvider} · {b.paymentStatus}
                </td>
                <td className="px-4 py-3">{b.bookingStatus}</td>
                <td className="px-4 py-3">{formatDate(b.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {bookings.length === 0 ? <p className="mt-6 text-carbon/60">Todavía no hay reservas.</p> : null}
    </div>
  );
}
