import { formatCurrency } from "@/lib/utils";
import type { PriceLabel } from "@/lib/checkout-atu-aire/types";

const LABEL_TEXT: Record<PriceLabel, string> = {
  from: "Desde",
  estimated: "Total estimado",
  total: "Total",
};

/**
 * The one place that renders a price label — keeps "Desde" / "Total
 * estimado" / "Total" visually and textually consistent everywhere,
 * never letting a partial quote read as a definitive price (§6).
 */
export function PriceTag({
  label,
  amount,
  perPerson,
  size = "md",
}: {
  label: PriceLabel;
  amount: number | null;
  perPerson?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  if (amount === null) return null;
  const sizeClass = size === "lg" ? "text-3xl" : size === "sm" ? "text-base" : "text-xl";
  return (
    <p className={sizeClass}>
      <span className="mr-1 text-xs font-medium tracking-wide text-carbon/60 uppercase">{LABEL_TEXT[label]}</span>
      <span className="font-display">{formatCurrency(amount)}</span>
      {perPerson ? <span className="ml-1 text-sm text-carbon/60">/ persona</span> : null}
    </p>
  );
}
