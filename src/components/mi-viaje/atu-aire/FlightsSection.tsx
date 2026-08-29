import { PlaneIcon } from "@/components/icons";
import { formatDate } from "@/lib/utils";
import { airportLabel } from "@/lib/mi-viaje/airportNames";
import type { AtuAireMiViajeView } from "@/lib/mi-viaje/buildAtuAireView";

/**
 * Ida and vuelta are always two separate cards (§18), matching how they
 * were sold as two independent legs at checkout — never merged back into
 * one round-trip block. Only rendered for a TICKET_HOTEL_FLIGHT booking.
 */
export function FlightsSection({ view }: { view: AtuAireMiViajeView }) {
  if (!view.flights) return null;
  const { outbound, inbound } = view.flights;

  return (
    <details id="vuelos" open className="scroll-mt-6 border-b border-carbon/15 py-8">
      <summary className="mb-4 flex cursor-pointer list-none items-center gap-2 text-lg font-display uppercase">
        <PlaneIcon className="h-5 w-5 shrink-0" />
        Tus vuelos
      </summary>
      <div className="grid gap-4 sm:grid-cols-2">
        <article className="rounded-sm border border-carbon/15 p-5">
          <p className="mb-2 text-xs font-medium tracking-wide text-carbon/50 uppercase">Ida</p>
          <p className="mb-1 text-base font-semibold">
            {airportLabel(outbound.originAirport)} → {airportLabel(outbound.destinationAirport)}
          </p>
          <p className="mb-3 text-sm text-carbon/70">
            {formatDate(outbound.departure, { day: "numeric", month: "long" })} · {formatDate(outbound.departure, { hour: "2-digit", minute: "2-digit" })}
          </p>
          <p className="text-sm">
            <span className="text-carbon/50">Estado: </span>
            <span className="font-medium">{outbound.statusLabel}</span>
          </p>
        </article>
        <article className="rounded-sm border border-carbon/15 p-5">
          <p className="mb-2 text-xs font-medium tracking-wide text-carbon/50 uppercase">Vuelta</p>
          <p className="mb-1 text-base font-semibold">
            {airportLabel(inbound.originAirport)} → {airportLabel(inbound.destinationAirport)}
          </p>
          <p className="mb-3 text-sm text-carbon/70">
            {formatDate(inbound.departure, { day: "numeric", month: "long" })} · {formatDate(inbound.departure, { hour: "2-digit", minute: "2-digit" })}
          </p>
          <p className="text-sm">
            <span className="text-carbon/50">Estado: </span>
            <span className="font-medium">{inbound.statusLabel}</span>
          </p>
        </article>
      </div>
    </details>
  );
}
