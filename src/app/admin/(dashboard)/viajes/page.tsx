import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { formatCurrency } from "@/lib/utils";
import { TripRowActions } from "@/components/admin/TripRowActions";

export const metadata: Metadata = { title: "Admin — Viajes" };

export default async function AdminTripsPage() {
  const trips = await prisma.trip.findMany({ orderBy: { number: "asc" } });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl uppercase">Viajes</h1>
        <Link href="/admin/viajes/nuevo" className="rounded-sm bg-carbon px-4 py-2 text-sm font-semibold text-ivory">
          + Nuevo viaje
        </Link>
      </div>

      <div className="overflow-x-auto rounded-sm border border-carbon/15 bg-white">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="border-b border-carbon/10 text-xs tracking-wide text-carbon/50 uppercase">
            <tr>
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Publicado</th>
              <th className="px-4 py-3">Precio</th>
              <th className="px-4 py-3">Plazas</th>
              <th className="px-4 py-3">Home</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {trips.map((trip) => (
              <tr key={trip.id} className="border-b border-carbon/5 last:border-0">
                <td className="px-4 py-3">{String(trip.number).padStart(3, "0")}</td>
                <td className="px-4 py-3">
                  <Link href={`/admin/viajes/${trip.id}`} className="font-medium hover:underline">
                    {trip.name} — {trip.subtitle}
                  </Link>
                </td>
                <td className="px-4 py-3">{trip.status}</td>
                <td className="px-4 py-3">{trip.published ? "Sí" : "No"}</td>
                <td className="px-4 py-3">{formatCurrency(trip.price, trip.currency)}</td>
                <td className="px-4 py-3">
                  {trip.soldSpots}/{trip.maxSpots}
                </td>
                <td className="px-4 py-3">{trip.homeFeatured ? "★" : ""}</td>
                <td className="px-4 py-3">
                  <TripRowActions tripId={trip.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {trips.length === 0 ? <p className="mt-6 text-carbon/60">Todavía no hay viajes.</p> : null}
    </div>
  );
}
