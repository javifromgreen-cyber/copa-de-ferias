import { cn } from "@/lib/utils";

/**
 * Placeholder "photography". Real trips will eventually get real,
 * royalty-cleared photography — until then this generates a stylised,
 * grainy duotone block per trip (via heroImageKey/Event.imageKey) so the
 * site never depends on hotlinked stock photos or network access at
 * build/runtime, and never on external/hardcoded image URLs.
 *
 * The palette is derived deterministically from the key string (a small
 * hash into a curated set of duotones) rather than a hand-maintained
 * dict keyed by slug — every current and future trip/event automatically
 * gets a distinct, consistent look with zero code changes per product.
 * `variant` shifts the gradient angle/center and picks an adjacent
 * palette so the same key can produce several harmonious-but-different
 * tiles (main photo + thumbnails) for a gallery, without extra data.
 *
 * Per spec: open trips read in color, upcoming trips read desaturated,
 * completed trips get a warm editorial/stamp treatment.
 */

// Curated duotones in the brand's earthy/retro register — never blue,
// orange or gradient-heavy SaaS colors (§43). Any heroImageKey/imageKey
// hashes into one of these; a handful of decorative (non-trip) keys are
// pinned below for a stable, deliberate look.
const PALETTE_RING: [string, string][] = [
  ["#3a3527", "#0f0e0a"],
  ["#4a4636", "#1b1912"],
  ["#3f2a22", "#160e0a"],
  ["#2e3a2c", "#0e130f"],
  ["#332a3a", "#120e16"],
  ["#3a2e22", "#130f0a"],
  ["#243330", "#0b1211"],
  ["#3f2f2a", "#150f0c"],
];

const PINNED_PALETTES: Record<string, [string, string]> = {
  hero: ["#3a3527", "#0f0e0a"],
  comunidad: ["#4a3a26", "#1b1912"],
};

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function paletteFor(key: string, variant: number): [string, string] {
  if (variant === 0 && PINNED_PALETTES[key]) return PINNED_PALETTES[key];
  const index = (hashString(key) + variant) % PALETTE_RING.length;
  return PALETTE_RING[index];
}

export type PhotoTone = "color" | "gray" | "sepia";

export function TripPhoto({
  heroImageKey,
  variant = 0,
  tone = "color",
  label,
  className,
  children,
}: {
  heroImageKey: string;
  /** Picks a related-but-distinct tile from the same key — used for gallery thumbnails. */
  variant?: number;
  tone?: PhotoTone;
  label?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const [from, to] = paletteFor(heroImageKey, variant);
  const angle = 110 + variant * 35;
  const originX = 20 + ((hashString(heroImageKey + variant) % 5) - 2) * 8;

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
        backgroundImage: `radial-gradient(130% 140% at ${originX}% 12%, ${from} 0%, ${to} 72%)`,
        filter,
      }}
    >
      {/* A faint stepped-tier motif (same right-angled language as the
          logo/icon set) for more visual presence than a bare gradient,
          without depending on any real photography or external asset. */}
      <svg
        className="absolute inset-0 h-full w-full opacity-[0.08]"
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMax slice"
        style={{ transform: `rotate(${angle - 110}deg)` }}
        aria-hidden
      >
        <path
          fill="currentColor"
          className="text-ivory"
          d="M0,100 L0,70 L14,70 L14,58 L28,58 L28,46 L42,46 L42,58 L58,58 L58,46 L72,46 L72,58 L86,58 L86,70 L100,70 L100,100 Z"
        />
      </svg>
      <div className="absolute inset-0" style={{ boxShadow: "inset 0 0 120px 20px rgba(0,0,0,0.55)" }} aria-hidden />
      {label ? (
        <span className="font-display absolute bottom-3 left-3 rounded-sm border border-ivory/40 px-2 py-0.5 text-[10px] tracking-[0.2em] text-ivory/80 uppercase">
          {label}
        </span>
      ) : null}
      {children}
    </div>
  );
}
