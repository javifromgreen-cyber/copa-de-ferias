import type { TripStatus } from "@prisma/client";
import { cn } from "@/lib/utils";
import { publicStatusLabel } from "@/lib/trips/status";

export function StatusBadge({ status, className }: { status: TripStatus; className?: string }) {
  const label = publicStatusLabel(status);
  if (!label) return null;

  const tone =
    status === "open"
      ? "bg-carbon text-ivory"
      : status === "sold_out"
        ? "bg-stamp text-ivory"
        : status === "completed"
          ? "bg-cement-light text-carbon"
          : "bg-ivory-dark text-carbon";

  return (
    <span
      className={cn(
        "font-display inline-block rounded-sm px-2.5 py-1 text-xs tracking-[0.15em] uppercase",
        tone,
        className
      )}
    >
      {label}
    </span>
  );
}
