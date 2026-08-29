import { ClipboardIcon } from "@/components/icons";
import type { AtuAireMiViajeView } from "@/lib/mi-viaje/buildAtuAireView";

/**
 * "Acciones necesarias" (correction microblock §6-11) — placed right after
 * the header, before anything else, but only when there is at least one
 * real pending action; an empty list renders nothing at all, never an
 * empty block. Every entry here already came from real persisted data in
 * buildAtuAireMiViajeView (a BookingAction, a document flagged
 * action_required, or Admin's own additionalDataRequestNote) — this
 * component only renders what it's given.
 */
export function NecessaryActionsSection({ view }: { view: AtuAireMiViajeView }) {
  if (view.necessaryActions.length === 0) return null;

  return (
    <section id="acciones-necesarias" className="mb-10 scroll-mt-6 rounded-sm border-2 border-stamp/50 bg-stamp/5 p-5">
      <h2 className="font-display mb-4 flex items-center gap-2 text-lg uppercase text-stamp">
        <ClipboardIcon className="h-5 w-5 shrink-0" />
        Acciones necesarias
      </h2>
      <div className="space-y-4">
        {view.necessaryActions.map((action) => (
          <div key={action.id} className="rounded-sm border border-stamp/30 bg-white p-4">
            <h3 className="mb-1 text-sm font-semibold">{action.title}</h3>
            <p className="mb-3 text-sm text-carbon/70">{action.description}</p>
            {action.dueAtLabel ? <p className="mb-3 text-xs text-carbon/50">Antes del {action.dueAtLabel}</p> : null}
            <a href={action.actionHref} className="inline-flex items-center text-xs font-semibold tracking-wide text-stamp uppercase underline underline-offset-2">
              Resolver
            </a>
          </div>
        ))}
      </div>
    </section>
  );
}
