import type { PackageType } from "@prisma/client";
import { TicketIcon, BedIcon, PlaneIcon } from "@/components/icons";
import { formatCurrency } from "@/lib/utils";
import type { PackageTypeOption } from "@/lib/checkout-atu-aire/types";

const ICONS: Record<PackageType, typeof TicketIcon> = {
  TICKET_ONLY: TicketIcon,
  TICKET_HOTEL: BedIcon,
  TICKET_HOTEL_FLIGHT: PlaneIcon,
};

/**
 * The first decision in the flow, and the only one shown before the
 * customer has committed to anything — each option needs real visual
 * weight (§35), not three radios buried in a form. Only modalities the
 * product actually has configured are ever rendered (§2).
 */
export function PackageTypeStep({
  options,
  selected,
  onSelect,
}: {
  options: PackageTypeOption[];
  selected: PackageType | null;
  onSelect: (value: PackageType) => void;
}) {
  return (
    <section aria-labelledby="package-type-heading">
      <h2 id="package-type-heading" className="font-display mb-1 text-2xl uppercase">
        ¿Qué quieres reservar?
      </h2>
      <p className="mb-5 text-sm text-carbon/60">Elige qué incluye tu viaje. El precio se actualiza según lo que elijas.</p>
      <div className={`grid gap-4 ${options.length === 1 ? "sm:grid-cols-1" : options.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
        {options.map((option) => {
          const Icon = ICONS[option.packageType];
          const isSelected = selected === option.packageType;
          return (
            <button
              key={option.packageType}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onSelect(option.packageType)}
              className={`flex flex-col items-start gap-3 rounded-sm border-2 p-6 text-left transition-colors ${
                isSelected ? "border-carbon bg-carbon text-ivory" : "border-carbon/15 bg-white hover:border-carbon/50"
              }`}
            >
              <Icon className={`h-8 w-8 ${isSelected ? "text-ivory" : "text-carbon/70"}`} />
              <span className="font-display text-lg uppercase">{option.label}</span>
              <span className={`text-sm ${isSelected ? "text-ivory/80" : "text-carbon/60"}`}>{option.description}</span>
              <span className="mt-auto pt-2 text-base">
                <span className={`mr-1 text-xs font-medium tracking-wide uppercase ${isSelected ? "text-ivory/70" : "text-carbon/50"}`}>Desde</span>
                <span className="font-display">{formatCurrency(option.fromPricePerPerson)}</span>
                <span className={`ml-1 text-xs ${isSelected ? "text-ivory/70" : "text-carbon/50"}`}>/ persona</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
