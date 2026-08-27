import { TicketIcon } from "@/components/icons";
import { formatCurrency } from "@/lib/utils";
import type { TicketCategoryOption } from "@/lib/checkout-atu-aire/types";

export function TicketStep({
  options,
  selected,
  onSelect,
}: {
  options: TicketCategoryOption[];
  selected: string | null;
  onSelect: (category: string) => void;
}) {
  return (
    <section aria-labelledby="ticket-heading" className="rounded-sm border border-carbon/15 bg-white p-5">
      <h2 id="ticket-heading" className="mb-3 flex items-center gap-2 text-lg font-semibold">
        <TicketIcon className="h-5 w-5 text-carbon/60" />
        Elige tu entrada
      </h2>
      <div className="space-y-2">
        {options.map((option) => {
          const isSelected = selected === option.category;
          return (
            <button
              key={option.category}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onSelect(option.category)}
              className={`flex w-full items-center justify-between gap-3 rounded-sm border p-4 text-left transition-colors ${
                isSelected ? "border-carbon bg-ivory-dark" : "border-carbon/15 hover:border-carbon/40"
              }`}
            >
              <span>
                <span className="block font-medium">{option.category}</span>
                {option.sector ? <span className="block text-sm text-carbon/60">{option.sector}</span> : null}
                {option.restrictions ? <span className="mt-1 block text-xs text-carbon/50">{option.restrictions}</span> : null}
              </span>
              <span className="shrink-0 font-display text-lg">{option.deltaFromCheapest === 0 ? "Incluida" : `+ ${formatCurrency(option.deltaFromCheapest)}`}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
