import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import type { EmailTemplate } from "@prisma/client";
import { ProcessPendingEmailsButton } from "@/components/admin/ProcessPendingEmailsButton";
import { disparadorLabel } from "@/lib/email/disparadorLabel";

export const metadata: Metadata = { title: "Admin — Emails" };

function TemplatesTable({ templates }: { templates: EmailTemplate[] }) {
  return (
    <div className="overflow-x-auto rounded-sm border border-carbon/15 bg-white">
      <table className="w-full min-w-[700px] text-left text-sm">
        <thead className="border-b border-carbon/10 text-xs tracking-wide text-carbon/50 uppercase">
          <tr>
            <th className="px-4 py-3">Plantilla</th>
            <th className="px-4 py-3">Asunto</th>
            <th className="px-4 py-3">Disparador</th>
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
              <td className="px-4 py-3 text-carbon/50">{disparadorLabel(t)}</td>
              <td className="px-4 py-3">{t.active ? "Sí" : "No"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function AdminEmailsPage() {
  const [templates, archivedTemplates, recentLogs] = await Promise.all([
    prisma.emailTemplate.findMany({ where: { archived: false }, orderBy: { name: "asc" } }),
    prisma.emailTemplate.findMany({ where: { archived: true }, orderBy: { name: "asc" } }),
    prisma.emailLog.findMany({ orderBy: { sentAt: "desc" }, take: 30 }),
  ]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl uppercase">Emails</h1>
        <ProcessPendingEmailsButton />
      </div>

      <div className="mb-6">
        <TemplatesTable templates={templates} />
      </div>

      {archivedTemplates.length > 0 ? (
        <details className="mb-10 rounded-sm border border-carbon/15 bg-white">
          <summary className="cursor-pointer px-4 py-3 text-sm text-carbon/60">
            Plantillas archivadas ({archivedTemplates.length}) — secuencia antigua retirada, ya no se envían
          </summary>
          <div className="border-t border-carbon/10 p-4">
            <TemplatesTable templates={archivedTemplates} />
          </div>
        </details>
      ) : (
        <div className="mb-10" />
      )}

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
