import { formatDate } from "@/lib/utils";
import { StadiumIcon, CalendarIcon } from "@/components/icons";
import type { EventSummary } from "@/lib/checkout-atu-aire/types";
import { scheduleStatusBadgeLabel } from "@/lib/checkout-atu-aire/scheduleStatusLabel";

/**
 * Multi-match products (e.g. Londres) must never read as if they only
 * had one Event — every match this product includes is listed, each
 * with its own schedule status (§20).
 */
export function EventsHeader({ events }: { events: EventSummary[] }) {
  return (
    <ul className="space-y-2">
      {events.map((event) => (
        <li key={event.id} className="flex items-center justify-between gap-3 rounded-sm border border-carbon/10 bg-white px-4 py-3">
          <div className="flex items-center gap-3">
            <StadiumIcon className="h-5 w-5 shrink-0 text-carbon/50" />
            <div>
              <p className="font-medium">
                {event.homeTeam} – {event.awayTeam}
              </p>
              <p className="flex items-center gap-1 text-xs text-carbon/60">
                <CalendarIcon className="h-3.5 w-3.5" />
                {formatDate(event.matchDate)} · {event.stadium}
              </p>
            </div>
          </div>
          {scheduleStatusBadgeLabel(event.scheduleStatus) ? (
            <span className="rounded-sm bg-stamp/10 px-2 py-1 text-xs font-medium text-stamp">{scheduleStatusBadgeLabel(event.scheduleStatus)}</span>
          ) : (
            <span className="rounded-sm bg-carbon/5 px-2 py-1 text-xs font-medium text-carbon/60">Confirmado</span>
          )}
        </li>
      ))}
    </ul>
  );
}
