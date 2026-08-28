import { PlaneIcon } from "@/components/icons";
import type { OriginOption } from "@/lib/checkout-atu-aire/types";

/**
 * Only airports FlightProvider.listDirectOrigins() actually returned for
 * this destination — never a hardcoded Spanish-airport list (§6/§7/§9).
 */
export function AirportStep({
  origins,
  selected,
  onSelect,
}: {
  origins: OriginOption[];
  selected: string | null;
  onSelect: (iata: string) => void;
}) {
  return (
    <section aria-labelledby="airport-heading" className="rounded-sm border border-carbon/15 bg-white p-5">
      <h2 id="airport-heading" className="mb-3 flex items-center gap-2 text-lg font-semibold">
        <PlaneIcon className="h-5 w-5 text-carbon/60" />
        ¿Desde dónde quieres volar?
      </h2>
      <div className="grid gap-2 sm:grid-cols-2">
        {origins.map((origin) => {
          const isSelected = selected === origin.iata;
          return (
            <button
              key={origin.iata}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onSelect(origin.iata)}
              className={`flex items-center justify-between gap-2 rounded-sm border p-4 text-left transition-colors ${
                isSelected ? "border-carbon bg-ivory-dark" : "border-carbon/15 hover:border-carbon/40"
              }`}
            >
              <span>
                <span className="block font-medium">{origin.city}</span>
                <span className="block text-xs text-carbon/50">{origin.airportName}</span>
              </span>
              <span className="shrink-0 text-sm text-carbon/60">{origin.iata}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
