import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { ProcessPendingEmailsButton } from "@/components/admin/ProcessPendingEmailsButton";

export const metadata: Metadata = { title: "Admin — Emails" };

export default async function AdminEmailsPage() {
  const [templates, recentLogs] = await Promise.all([
    prisma.emailTemplate.findMany({ orderBy: { key: "asc" } }),
    prisma.emailLog.findMany({ orderBy: { sentAt: "desc" }, take: 30 }),
  ]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl uppercase">Emails</h1>
        <ProcessPendingEmailsButton />
      </div>

      <div className="mb-10 overflow-x-auto rounded-sm border border-carbon/15 bg-white">
        <table className="w-full min-w-[700px] text-left text-sm">
          <thead className="border-b border-carbon/10 text-xs tracking-wide text-carbon/50 uppercase">
            <tr>
              <th className="px-4 py-3">Plantilla</th>
              <th className="px-4 py-3">Asunto</th>
              <th className="px-4 py-3">Envío</th>
              <th className="px-4 py-3">Activo</th>
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => (
              <tr key={t.id} className="border-b border-carbon/5 last:border-0">
                <td className="px-4 py-3">
                  <Link href={`/admin/emails/${t.key}`} className="font-medium hover:underline">
                    {t.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-carbon/70">{t.subject}</td>
                <td className="px-4 py-3 text-carbon/50">
                  {t.timingReference === "immediate"
                    ? "Inmediato"
                    : t.timingReference === "booking_plus_1"
                      ? `+${t.timingDaysOffset} día tras reserva`
                      : t.timingReference === "before_departure"
                        ? `${t.timingDaysOffset} días antes de salir`
                        : `+${t.timingDaysOffset} días tras el regreso`}
                </td>
                <td className="px-4 py-3">{t.active ? "Sí" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="font-display mb-3 text-lg uppercase">Historial reciente</h2>
      {recentLogs.length === 0 ? (
        <p className="text-sm text-carbon/50">Sin envíos todavía.</p>
      ) : (
        <ul className="space-y-1 text-sm text-carbon/70">
          {recentLogs.map((log) => (
            <li key={log.id}>
              {log.sentAt.toLocaleString("es-ES")} — {log.templateKey} → {log.to} ({log.mode})
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
