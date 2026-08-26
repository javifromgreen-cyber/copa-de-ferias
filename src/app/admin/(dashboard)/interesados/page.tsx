import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Admin — Interesados" };

export default async function AdminLeadsPage() {
  const leads = await prisma.lead.findMany({ orderBy: { createdAt: "desc" }, include: { trip: true } });

  const byTrip = new Map<string, number>();
  const byCity = new Map<string, number>();
  for (const lead of leads) {
    const tripLabel = lead.trip ? lead.trip.name : "General";
    byTrip.set(tripLabel, (byTrip.get(tripLabel) ?? 0) + 1);
    if (lead.city) byCity.set(lead.city, (byCity.get(lead.city) ?? 0) + 1);
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl uppercase">Interesados</h1>
        {/* File download endpoint, not a page — plain <a> is intentional. */}
        <a href="/admin/interesados/export" className="text-sm underline">
          Exportar CSV
        </a>
      </div>

      <div className="mb-8 grid gap-6 sm:grid-cols-2">
        <div className="rounded-sm border border-carbon/15 bg-white p-5">
          <h2 className="mb-3 text-xs tracking-wide text-carbon/50 uppercase">Por viaje</h2>
          <ul className="space-y-1 text-sm">
            {[...byTrip.entries()].map(([name, count]) => (
              <li key={name} className="flex justify-between">
                <span>{name}</span>
                <span className="font-medium">{count}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-sm border border-carbon/15 bg-white p-5">
          <h2 className="mb-3 text-xs tracking-wide text-carbon/50 uppercase">Por ciudad</h2>
          <ul className="space-y-1 text-sm">
            {[...byCity.entries()].map(([city, count]) => (
              <li key={city} className="flex justify-between">
                <span>{city}</span>
                <span className="font-medium">{count}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="overflow-x-auto rounded-sm border border-carbon/15 bg-white">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="border-b border-carbon/10 text-xs tracking-wide text-carbon/50 uppercase">
            <tr>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Viaje</th>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Ciudad</th>
              <th className="px-4 py-3">Consentimiento</th>
              <th className="px-4 py-3">Fecha</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.id} className="border-b border-carbon/5 last:border-0">
                <td className="px-4 py-3">{lead.type}</td>
                <td className="px-4 py-3">{lead.trip ? lead.trip.name : "General"}</td>
                <td className="px-4 py-3">{lead.name || "—"}</td>
                <td className="px-4 py-3">{lead.email}</td>
                <td className="px-4 py-3">{lead.city || "—"}</td>
                <td className="px-4 py-3">{lead.consent ? "Sí" : "No"}</td>
                <td className="px-4 py-3">{formatDate(lead.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {leads.length === 0 ? <p className="mt-6 text-carbon/60">Todavía no hay interesados.</p> : null}
    </div>
  );
}
