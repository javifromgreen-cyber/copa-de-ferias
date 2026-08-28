import { useEffect } from "react";
import { GroupIcon } from "@/components/icons";

export function TravelersStep({
  partySize,
  limits,
  onChange,
}: {
  partySize: number | null;
  limits: { min: number; max: number };
  onChange: (value: number) => void;
}) {
  const value = partySize ?? limits.min;

  // The counter visually shows `limits.min` (1) before any click, but that
  // was never actually committed to the selection — every step downstream
  // gates on `Boolean(selection.partySize)`, which stayed null until the
  // customer clicked "+" at least once, so a solo traveler's whole
  // downstream flow (tickets, traveler data, etc.) silently never
  // appeared. Committing the shown default as soon as this step mounts
  // fixes that at the source, for every party size — not just 1.
  useEffect(() => {
    if (partySize === null) onChange(limits.min);
  }, [partySize, limits.min, onChange]);

  return (
    <section aria-labelledby="travelers-heading" className="rounded-sm border border-carbon/15 bg-white p-5">
      <h2 id="travelers-heading" className="mb-3 flex items-center gap-2 text-lg font-semibold">
        <GroupIcon className="h-5 w-5 text-carbon/60" />
        ¿Cuántos viajeros sois?
      </h2>
      <div className="flex items-center gap-4">
        <button
          type="button"
          aria-label="Menos viajeros"
          disabled={value <= limits.min}
          onClick={() => onChange(Math.max(limits.min, value - 1))}
          className="h-10 w-10 rounded-sm border border-carbon/20 text-lg disabled:opacity-30"
        >
          −
        </button>
        <span className="w-16 text-center text-2xl font-display" aria-live="polite">
          {value}
        </span>
        <button
          type="button"
          aria-label="Más viajeros"
          disabled={value >= limits.max}
          onClick={() => onChange(Math.min(limits.max, value + 1))}
          className="h-10 w-10 rounded-sm border border-carbon/20 text-lg disabled:opacity-30"
        >
          +
        </button>
        <span className="text-sm text-carbon/60">Máximo {limits.max} viajeros por reserva.</span>
      </div>
    </section>
  );
}
