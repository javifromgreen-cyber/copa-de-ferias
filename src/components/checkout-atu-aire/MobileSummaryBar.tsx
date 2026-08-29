import { formatCurrency } from "@/lib/utils";
import type { AtuAireQuote } from "@/lib/checkout-atu-aire/types";
import { scheduleStatusBadgeLabel } from "@/lib/checkout-atu-aire/scheduleStatusLabel";

const LABEL_TEXT = { from: "Desde", estimated: "Total estimado", total: "Total" } as const;

/**
 * Mobile equivalent of the desktop summary sidebar (§23) — a sticky bar so
 * the price is always visible without permanently eating screen space on a
 * small viewport. Shows only the total/per-person price and the chosen
 * matches, never an economic breakdown — there is nothing here to expand.
 */
export function MobileSummaryBar({ quote }: { quote: AtuAireQuote }) {
  const amount = quote.price.totalCommercial ?? quote.price.perPerson;
  if (amount === null) return null;

  return (
    <div className="sticky bottom-0 z-10 -mx-4 border-t border-carbon/15 bg-ivory px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] lg:hidden">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">
          {LABEL_TEXT[quote.price.label]}: <span className="font-display">{formatCurrency(amount)}</span>
          {quote.price.totalCommercial === null ? " / persona" : ""}
        </span>
        {quote.price.totalCommercial !== null && quote.price.perPerson !== null && quote.price.perPerson !== quote.price.totalCommercial ? (
          <span className="text-xs text-carbon/60">{formatCurrency(quote.price.perPerson)} / persona</span>
        ) : null}
      </div>
      <div className="mt-2 space-y-1 text-xs text-carbon/60">
        {quote.events.map((event) => (
          <p key={event.id}>
            {event.homeTeam} – {event.awayTeam}
            {scheduleStatusBadgeLabel(event.scheduleStatus) ? <span className="ml-1 text-stamp">({scheduleStatusBadgeLabel(event.scheduleStatus)})</span> : null}
          </p>
        ))}
        {quote.price.missing.length > 0 ? <p>Falta por elegir: {quote.price.missing.join(", ")}.</p> : null}
      </div>
    </div>
  );
}
