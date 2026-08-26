import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Admin — Viajeros" };

export default async function AdminTravelersPage() {
  const travelers = await prisma.traveler.findMany({
    orderBy: { createdAt: "desc" },
    include: { booking: { include: { trip: true } } },
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl uppercase">Viajeros</h1>
        {/* File download endpoint, not a page — plain <a> is intentional. */}
        <a href="/admin/viajeros/export" className="text-sm underline">
          Exportar CSV
        </a>
      </div>

      <div className="overflow-x-auto rounded-sm border border-carbon/15 bg-white">
        <table className="w-full min-w-[1200px] text-left text-sm">
          <thead className="border-b border-carbon/10 text-xs tracking-wide text-carbon/50 uppercase">
            <tr>
              <th className="px-3 py-3">Reserva</th>
              <th className="px-3 py-3">Viaje</th>
              <th className="px-3 py-3">Nombre</th>
              <th className="px-3 py-3">Apellidos</th>
              <th className="px-3 py-3">Nacimiento</th>
              <th className="px-3 py-3">Nacionalidad</th>
              <th className="px-3 py-3">Documento</th>
              <th className="px-3 py-3">Caducidad</th>
              <th className="px-3 py-3">Teléfono</th>
              <th className="px-3 py-3">Origen</th>
              <th className="px-3 py-3">Habitación</th>
              <th className="px-3 py-3">Pasaporte CDF</th>
            </tr>
          </thead>
          <tbody>
            {travelers.map((t) => (
              <tr key={t.id} className="border-b border-carbon/5 last:border-0">
                <td className="px-3 py-3">{t.booking.reference}</td>
                <td className="px-3 py-3">{t.booking.trip.name}</td>
                <td className="px-3 py-3">{t.firstName}</td>
                <td className="px-3 py-3">{t.lastName}</td>
                <td className="px-3 py-3">{t.birthDate ? formatDate(t.birthDate) : "—"}</td>
                <td className="px-3 py-3">{t.nationality || "—"}</td>
                <td className="px-3 py-3">
                  {t.docType || "—"} {t.docNumber}
                </td>
                <td className="px-3 py-3">{t.docExpiry ? formatDate(t.docExpiry) : "—"}</td>
                <td className="px-3 py-3">{t.phone || "—"}</td>
                <td className="px-3 py-3">{t.booking.originCity}</td>
                <td className="px-3 py-3">{t.roomPreference}</td>
                <td className="px-3 py-3">{t.booking.passportStatus}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {travelers.length === 0 ? <p className="mt-6 text-carbon/60">Todavía no hay viajeros.</p> : null}
    </div>
  );
}
