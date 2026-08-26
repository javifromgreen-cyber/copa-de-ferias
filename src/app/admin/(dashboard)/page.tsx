import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { formatCurrency } from "@/lib/utils";

export const metadata: Metadata = { title: "Admin — Dashboard" };

export default async function AdminDashboardPage() {
  const [trips, bookings, leads, pendingChangeRequests, revenue] = await Promise.all([
    prisma.trip.count(),
    prisma.booking.count({ where: { bookingStatus: "confirmed" } }),
    prisma.lead.count(),
    prisma.changeRequest.count({ where: { status: { in: ["requested", "in_review"] } } }),
    prisma.booking.aggregate({ where: { bookingStatus: "confirmed" }, _sum: { totalPrice: true } }),
  ]);

  const cards = [
    { label: "Viajes", value: trips, href: "/admin/viajes" },
    { label: "Reservas confirmadas", value: bookings, href: "/admin/reservas" },
    { label: "Interesados", value: leads, href: "/admin/interesados" },
    { label: "Solicitudes pendientes", value: pendingChangeRequests, href: "/admin/reservas" },
  ];

  return (
    <div>
      <h1 className="font-display mb-6 text-2xl uppercase">Dashboard</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Link key={c.label} href={c.href} className="rounded-sm border border-carbon/15 bg-white p-5 hover:border-carbon/40">
            <p className="text-xs tracking-wide text-carbon/50 uppercase">{c.label}</p>
            <p className="font-display mt-2 text-3xl">{c.value}</p>
          </Link>
        ))}
        <div className="rounded-sm border border-carbon/15 bg-white p-5">
          <p className="text-xs tracking-wide text-carbon/50 uppercase">Ingresos (reservas confirmadas)</p>
          <p className="font-display mt-2 text-3xl">{formatCurrency(revenue._sum.totalPrice ?? 0)}</p>
        </div>
      </div>

      <div className="mt-10 grid gap-3 sm:grid-cols-3">
        <Link href="/admin/viajes/nuevo" className="rounded-sm border border-carbon/15 bg-white p-4 text-sm hover:border-carbon/40">
          + Crear nuevo viaje
        </Link>
        <Link href="/admin/emails" className="rounded-sm border border-carbon/15 bg-white p-4 text-sm hover:border-carbon/40">
          Gestionar emails
        </Link>
        <Link href="/admin/configuracion" className="rounded-sm border border-carbon/15 bg-white p-4 text-sm hover:border-carbon/40">
          Configuración de marca
        </Link>
      </div>
    </div>
  );
}
