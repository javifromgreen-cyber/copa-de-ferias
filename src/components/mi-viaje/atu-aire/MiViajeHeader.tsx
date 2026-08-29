import type { AtuAireMiViajeView } from "@/lib/mi-viaje/buildAtuAireView";

/**
 * The reassurance block Mi Viaje opens with (§5/§31) — what's booked, for
 * when, for how many, and its real status, all in one glance. Never the
 * literal "Todo listo para…" headline unless the booking is genuinely
 * confirmed; anything else just states the real status plainly.
 */
export function MiViajeHeader({ view }: { view: AtuAireMiViajeView }) {
  const allReady = view.statusLabel === "Confirmada";
  const primaryEvent = view.events[0];

  return (
    <header className="mb-10 border-b border-carbon/15 pb-8">
      <p className="font-display mb-2 text-xs tracking-[0.25em] text-cement uppercase">Mi viaje · Reserva {view.reference}</p>
      <h1 className="font-display mb-3 text-3xl uppercase sm:text-4xl">{allReady ? `Todo listo para ${view.city}` : view.headerTitle}</h1>
      {allReady ? <p className="mb-4 text-lg text-carbon/80">{view.headerTitle}</p> : null}

      <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-carbon/70">
        {view.competitionName ? (
          <div>
            <dt className="sr-only">Competición</dt>
            <dd>{view.competitionName}</dd>
          </div>
        ) : null}
        {primaryEvent ? (
          <div>
            <dt className="sr-only">Fecha</dt>
            <dd>
              {primaryEvent.dateLabel}
              {primaryEvent.timeLabel ? ` · ${primaryEvent.timeLabel}` : ` · ${primaryEvent.scheduleStatusLabel}`}
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="sr-only">Viajeros</dt>
          <dd>
            {view.partySize} viajero{view.partySize > 1 ? "s" : ""}
          </dd>
        </div>
        <div>
          <dt className="sr-only">Modalidad</dt>
          <dd>{view.modality.label}</dd>
        </div>
      </dl>

      <span className="mt-4 inline-block rounded-sm bg-carbon px-3 py-1.5 text-xs font-semibold tracking-wide text-ivory uppercase">{view.statusLabel}</span>
    </header>
  );
}
