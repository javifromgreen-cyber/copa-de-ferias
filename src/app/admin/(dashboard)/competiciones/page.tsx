import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { REGION_LABELS, COMPETITION_TYPE_LABELS } from "@/lib/catalog/labels";

export const metadata: Metadata = { title: "Admin — Competiciones" };

export default async function AdminCompetitionsPage() {
  const competitions = await prisma.competition.findMany({
    include: { _count: { select: { events: true } } },
    orderBy: [{ region: "asc" }, { name: "asc" }],
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl uppercase">Competiciones</h1>
        <Link href="/admin/competiciones/nueva" className="rounded-sm bg-carbon px-4 py-2 text-sm font-semibold text-ivory">
          + Nueva competición
        </Link>
      </div>

      <div className="overflow-x-auto rounded-sm border border-carbon/15 bg-white">
        <table className="w-full min-w-[700px] text-left text-sm">
          <thead className="border-b border-carbon/10 text-xs tracking-wide text-carbon/50 uppercase">
            <tr>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Región</th>
              <th className="px-4 py-3">País</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Eventos</th>
            </tr>
          </thead>
          <tbody>
            {competitions.map((c) => (
              <tr key={c.id} className="border-b border-carbon/5 last:border-0">
                <td className="px-4 py-3">
                  <Link href={`/admin/competiciones/${c.id}`} className="font-medium hover:underline">
                    {c.name}
                  </Link>
                </td>
                <td className="px-4 py-3">{REGION_LABELS[c.region]}</td>
                <td className="px-4 py-3">{c.country || "—"}</td>
                <td className="px-4 py-3">{COMPETITION_TYPE_LABELS[c.competitionType]}</td>
                <td className="px-4 py-3">{c._count.events}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {competitions.length === 0 ? <p className="mt-6 text-carbon/60">Todavía no hay competiciones.</p> : null}
    </div>
  );
}
