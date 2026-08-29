import { TicketIcon, CalendarIcon } from "@/components/icons";
import type { AtuAireMiViajeView } from "@/lib/mi-viaje/buildAtuAireView";

/**
 * One block per Event, never merged (§9/§10) — a multi-match booking must
 * read as N separate tickets, each with its own category and status, not
 * one blended card.
 */
export function TicketsSection({ view }: { view: AtuAireMiViajeView }) {
  return (
    <details id="entradas" open className="scroll-mt-6 border-b border-carbon/15 py-8">
      <summary className="mb-4 flex cursor-pointer list-none items-center gap-2 text-lg font-display uppercase">
        <TicketIcon className="h-5 w-5 shrink-0" />
        Tus entradas
      </summary>
      <div className="space-y-4">
        {view.events.map((event) => (
          <article key={event.id} className="rounded-sm border border-carbon/15 p-5">
            <h3 className="mb-1 text-base font-semibold">
              {event.homeTeam} – {event.awayTeam}
            </h3>
            <p className="mb-3 flex items-center gap-1 text-xs text-carbon/60">
              <CalendarIcon className="h-3.5 w-3.5" />
              {event.dateLabel}
              {event.timeLabel ? ` · ${event.timeLabel}` : ` · ${event.scheduleStatusLabel}`}
              {" · "}
              {event.stadium}
            </p>
            {event.scheduleNote ? <p className="mb-3 text-xs text-carbon/60">{event.scheduleNote}</p> : null}

            {event.ticket ? (
              <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-xs text-carbon/50 uppercase">Categoría</dt>
                  <dd>{event.ticket.category}</dd>
                </div>
                {event.ticket.sector ? (
                  <div>
                    <dt className="text-xs text-carbon/50 uppercase">Sector</dt>
                    <dd>{event.ticket.sector}</dd>
                  </div>
                ) : null}
                <div>
                  <dt className="text-xs text-carbon/50 uppercase">Cantidad</dt>
                  <dd>
                    {event.ticket.quantity} entrada{event.ticket.quantity > 1 ? "s" : ""}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-carbon/50 uppercase">Estado</dt>
                  <dd className="font-medium">{event.ticket.statusLabel}</dd>
                </div>
                {event.ticket.restrictions ? (
                  <div className="col-span-2 sm:col-span-4">
                    <dt className="text-xs text-carbon/50 uppercase">Condiciones</dt>
                    <dd className="text-carbon/70">{event.ticket.restrictions}</dd>
                  </div>
                ) : null}
              </dl>
            ) : (
              <p className="text-sm text-carbon/60">Sin entrada asociada a este partido.</p>
            )}
          </article>
        ))}
      </div>
    </details>
  );
}
