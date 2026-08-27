import { CalendarIcon } from "@/components/icons";

export function NightsStep({ nights, onSelect }: { nights: 1 | 2 | null; onSelect: (nights: 1 | 2) => void }) {
  return (
    <section aria-labelledby="nights-heading" className="rounded-sm border border-carbon/15 bg-white p-5">
      <h2 id="nights-heading" className="mb-3 flex items-center gap-2 text-lg font-semibold">
        <CalendarIcon className="h-5 w-5 text-carbon/60" />
        ¿Cuántas noches os quedáis?
      </h2>
      <div className="flex gap-3">
        {([1, 2] as const).map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={nights === n}
            onClick={() => onSelect(n)}
            className={`rounded-sm border px-6 py-3 text-sm font-semibold uppercase transition-colors ${
              nights === n ? "border-carbon bg-carbon text-ivory" : "border-carbon/20 hover:border-carbon/50"
            }`}
          >
            {n} noche{n > 1 ? "s" : ""}
          </button>
        ))}
      </div>
    </section>
  );
}
