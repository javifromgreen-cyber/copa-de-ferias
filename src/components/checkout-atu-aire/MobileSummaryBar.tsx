import { formatCurrency } from "@/lib/utils";
import type { AtuAireQuote } from "@/lib/checkout-atu-aire/types";
import { scheduleStatusBadgeLabel } from "@/lib/checkout-atu-aire/scheduleStatusLabel";

const LABEL_TEXT = { from: "Desde", estimated: "Total estimado", total: "Total" } as const;

/**
 * Mobile equivalent of the desktop summary sidebar (§23) — a sticky,
 * collapsible bar (native <details>, no extra JS) so the price is always
 * visible without permanently eating screen space on a small viewport.
 */
export function MobileSummaryBar({ quote }: { quote: AtuAireQuote }) {
  const amount = quote.price.totalCommercial ?? quote.price.perPerson;
  if (amount === null) return null;

  return (
    <details className="sticky bottom-0 z-10 -mx-4 border-t border-carbon/15 bg-ivory shadow-[0_-4px_12px_rgba(0,0,0,0.06)] lg:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3">
        <span className="text-sm font-medium">
          {LABEL_TEXT[quote.price.label]}: <span className="font-display">{formatCurrency(amount)}</span>
          {quote.price.totalCommercial === null ? " / persona" : ""}
        </span>
        <span className="text-xs text-carbon/50 underline">Ver detalle</span>
      </summary>
      <div className="space-y-2 px-4 pb-4 text-sm">
        {quote.events.map((event) => (
          <p key={event.id}>
            {event.homeTeam} – {event.awayTeam}
            {scheduleStatusBadgeLabel(event.scheduleStatus) ? (
              <span className="ml-1 text-xs text-stamp">({scheduleStatusBadgeLabel(event.scheduleStatus)})</span>
            ) : null}
          </p>
        ))}
        {quote.price.missing.length > 0 ? <p className="text-xs text-carbon/50">Falta por elegir: {quote.price.missing.join(", ")}.</p> : null}
      </div>
    </details>
  );
}
