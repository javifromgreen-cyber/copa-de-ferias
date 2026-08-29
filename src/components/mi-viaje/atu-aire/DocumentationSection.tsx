import { DocumentIcon } from "@/components/icons";
import type { AtuAireMiViajeView } from "@/lib/mi-viaje/buildAtuAireView";

/**
 * §23/§24: only ever shows a real state, never a fabricated PDF/link — a
 * document's fileUrl stays "" (rendered as plain status text, no link)
 * until a real file/URL is actually attached to it.
 */
export function DocumentationSection({ view }: { view: AtuAireMiViajeView }) {
  if (view.documents.length === 0) return null;

  return (
    <details id="documentacion" open className="scroll-mt-6 border-b border-carbon/15 py-8">
      <summary className="mb-4 flex cursor-pointer list-none items-center gap-2 text-lg font-display uppercase">
        <DocumentIcon className="h-5 w-5 shrink-0" />
        Documentación
      </summary>
      <ul className="space-y-2">
        {view.documents.map((doc, i) => (
          <li key={i} className="flex items-center justify-between gap-3 rounded-sm border border-carbon/10 px-4 py-3 text-sm">
            <span>{doc.label}</span>
            {doc.fileUrl ? (
              <a href={doc.fileUrl} className="font-medium underline underline-offset-2">
                Ver documento
              </a>
            ) : (
              <span className="font-medium text-carbon/70">{doc.statusLabel}</span>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
