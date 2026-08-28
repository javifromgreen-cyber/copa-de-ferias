import { BedIcon } from "@/components/icons";
import type { HotelOptionView } from "@/lib/checkout-atu-aire/types";

export function HotelStep({
  options,
  selectedId,
  onSelect,
}: {
  options: HotelOptionView[];
  selectedId: string | null;
  onSelect: (offerId: string) => void;
}) {
  return (
    <section aria-labelledby="hotel-heading" className="rounded-sm border border-carbon/15 bg-white p-5">
      <h2 id="hotel-heading" className="mb-3 flex items-center gap-2 text-lg font-semibold">
        <BedIcon className="h-5 w-5 text-carbon/60" />
        Elige tu hotel
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {options.map((option) => {
          const isSelected = selectedId === option.offer.id;
          return (
            <button
              key={option.offer.id}
              type="button"
              aria-pressed={isSelected}
              disabled={!option.valid}
              onClick={() => option.valid && onSelect(option.offer.id)}
              className={`flex flex-col items-start gap-1 rounded-sm border p-4 text-left transition-colors ${
                !option.valid
                  ? "cursor-not-allowed border-carbon/10 bg-ivory-dark/50 opacity-60"
                  : isSelected
                    ? "border-carbon bg-ivory-dark"
                    : "border-carbon/15 hover:border-carbon/40"
              }`}
            >
              <span className="font-medium">{option.offer.name}</span>
              <span className="text-sm text-carbon/60">
                {option.offer.stars}★ · {option.offer.zone}
              </span>
              {/* Hotel cards never show a price, not even resultant (§5/§6) — the total lives only in the summary sidebar. */}
              {!option.valid ? <span className="mt-1 text-xs text-stamp">{option.invalidReason}</span> : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}
