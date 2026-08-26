import { cn } from "@/lib/utils";

/**
 * Placeholder "photography". Real trips will eventually get real,
 * royalty-cleared photography — until then this generates a stylised,
 * grainy duotone block per trip (via heroImageKey) so the site never
 * depends on hotlinked stock photos or network access at build/runtime.
 *
 * Per spec: open trips read in color, upcoming trips read desaturated,
 * completed trips get a warm editorial/stamp treatment.
 */

const PALETTES: Record<string, [string, string]> = {
  hero: ["#3a3527", "#0f0e0a"],
  belgrado: ["#6f1f1a", "#1b1912"],
  "futbol-ingles": ["#1f2a3d", "#0e1420"],
  lisboa: ["#1f4a42", "#12211d"],
  comunidad: ["#4a3a26", "#1b1912"],
  default: ["#4a4636", "#1b1912"],
};

export type PhotoTone = "color" | "gray" | "sepia";

export function TripPhoto({
  heroImageKey,
  tone = "color",
  label,
  className,
  children,
}: {
  heroImageKey: string;
  tone?: PhotoTone;
  label?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const [from, to] = PALETTES[heroImageKey] ?? PALETTES.default;

  const filter =
    tone === "gray"
      ? "grayscale(0.9) contrast(1.05) brightness(0.95)"
      : tone === "sepia"
        ? "sepia(0.35) saturate(1.15) contrast(1.05)"
        : "saturate(1.05) contrast(1.05)";

  return (
    <div
      className={cn("grain-overlay relative isolate overflow-hidden bg-carbon", className)}
      style={{
        backgroundImage: `radial-gradient(120% 130% at 20% 15%, ${from} 0%, ${to} 70%)`,
        filter,
      }}
    >
      <div
        className="absolute inset-0"
        style={{ boxShadow: "inset 0 0 120px 20px rgba(0,0,0,0.55)" }}
        aria-hidden
      />
      {label ? (
        <span className="font-display absolute bottom-3 left-3 rounded-sm border border-ivory/40 px-2 py-0.5 text-[10px] tracking-[0.2em] text-ivory/80 uppercase">
          {label}
        </span>
      ) : null}
      {children}
    </div>
  );
}
