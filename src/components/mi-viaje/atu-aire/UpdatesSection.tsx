import { CalendarIcon } from "@/components/icons";
import { formatDate } from "@/lib/utils";
import type { AtuAireMiViajeView } from "@/lib/mi-viaje/buildAtuAireView";

/**
 * §21/§22: a plain append-only timeline of real BookingUpdate rows — never
 * a synthesized entry. No rows means literally nothing has happened yet,
 * shown as a quiet "no news" line, never an invented update.
 */
export function UpdatesSection({ view }: { view: AtuAireMiViajeView }) {
  return (
    <details id="actualizaciones" open className="scroll-mt-6 border-b border-carbon/15 py-8">
      <summary className="mb-4 flex cursor-pointer list-none items-center gap-2 text-lg font-display uppercase">
        <CalendarIcon className="h-5 w-5 shrink-0" />
        Actualizaciones
      </summary>
      {view.updates.length === 0 ? (
        <p className="text-sm text-carbon/60">No hay novedades en tu reserva.</p>
      ) : (
        <ol className="space-y-4">
          {view.updates.map((u) => (
            <li key={u.id} className="border-l-2 border-carbon/15 pl-4">
              <p className="font-display text-xs tracking-widest text-cement uppercase">{formatDate(u.createdAt, { day: "numeric", month: "long" })}</p>
              <p className="mt-1 text-sm font-medium">{u.title}</p>
              {u.message ? <p className="mt-0.5 text-sm text-carbon/70">{u.message}</p> : null}
            </li>
          ))}
        </ol>
      )}
    </details>
  );
}
