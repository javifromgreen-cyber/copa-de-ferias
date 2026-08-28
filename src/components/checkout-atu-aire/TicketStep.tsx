import { TicketIcon } from "@/components/icons";
import { formatCurrency } from "@/lib/utils";
import type { EventSummary, TicketCategoryOption } from "@/lib/checkout-atu-aire/types";

/**
 * One section, one sub-block per Event (§21) — never a silent
 * cheapest-offer auto-pick on a secondary match (§17/§18). An Event with
 * only one real offer still shows it explicitly, just without requiring
 * a click (§19).
 */
export function TicketStep({
  events,
  optionsByEvent,
  selections,
  onSelect,
}: {
  events: EventSummary[];
  optionsByEvent: Record<string, TicketCategoryOption[]>;
  selections: Record<string, string>;
  onSelect: (eventId: string, category: string) => void;
}) {
  return (
    <section aria-labelledby="tickets-heading" className="rounded-sm border border-carbon/15 bg-white p-5">
      <h2 id="tickets-heading" className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <TicketIcon className="h-5 w-5 text-carbon/60" />
        Tus entradas
      </h2>
      <div className="space-y-5">
        {events.map((event) => {
          const options = optionsByEvent[event.id] ?? [];
          const onlyOption = options.length === 1 ? options[0] : null;
          const selectedCategory = selections[event.id] ?? (onlyOption ? onlyOption.category : null);

          return (
            <div key={event.id}>
              <h3 className="mb-2 text-sm font-semibold text-carbon/80">
                {event.homeTeam} – {event.awayTeam}
              </h3>
              {onlyOption ? (
                <p className="rounded-sm border border-carbon/15 bg-ivory-dark/40 p-4 text-sm">
                  <span className="font-medium">Entrada: {onlyOption.category}</span>
                  {onlyOption.sector ? <span className="text-carbon/60"> — {onlyOption.sector}</span> : null}
                  <span className="ml-2 text-carbon/60">incluida</span>
                </p>
              ) : (
                <div className="space-y-2">
                  {options.map((option) => {
                    const isSelected = selectedCategory === option.category;
                    return (
                      <button
                        key={option.category}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => onSelect(event.id, option.category)}
                        className={`flex w-full items-center justify-between gap-3 rounded-sm border p-4 text-left transition-colors ${
                          isSelected ? "border-carbon bg-ivory-dark" : "border-carbon/15 hover:border-carbon/40"
                        }`}
                      >
                        <span>
                          <span className="block font-medium">{option.category}</span>
                          {option.sector ? <span className="block text-sm text-carbon/60">{option.sector}</span> : null}
                          {option.restrictions ? <span className="mt-1 block text-xs text-carbon/50">{option.restrictions}</span> : null}
                        </span>
                        <span className="shrink-0 font-display text-lg">
                          {option.deltaFromCheapest === 0 ? "Incluida" : `+ ${formatCurrency(option.deltaFromCheapest)}`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
