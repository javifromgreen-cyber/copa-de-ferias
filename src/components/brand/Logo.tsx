/**
 * Copa de Ferias mark.
 *
 * Concept: a stepped goblet/trophy cup (funnel-shaped bowl tapering to a
 * stem and a base), built entirely from right-angled pixel/retro blocks —
 * no curves, no stock trophy silhouette, no ball, no UEFA/FIFA symbol.
 * Two seated-fan pictograms (a small square head above a wider torso
 * block, separated by a full-unit gap — not a hairline — so they read as
 * a person rather than a single blob even at favicon size) are cut into
 * the bowl's two interior tiers, one per side at a different step height,
 * via a single compound path with fill-rule="evenodd". Each cutout sits
 * well inside its tier's own band — clear of every edge that belongs to
 * the cup's true outer silhouette — so the figures read as sitting
 * *inside* the mass, never as notches biting into the contour. Being
 * holes, they always render in the *background* color automatically:
 * light fans cut into a dark cup on a light page, dark fans cut into a
 * light cup on a dark section (header vs. footer/hero) — both for free,
 * from the same path.
 *
 * Earlier iterations of this mark used a flat-topped, single-step-per-side
 * silhouette that read as a staircase/altar rather than a cup, and fan
 * cutouts with only a 0.5-unit head/body gap that visually fused into a
 * single rectangle at real render sizes. This version widens the top,
 * adds an extra taper tier for a genuine funnel/bowl profile, and gives
 * each figure a proper square-ish head + wider torso with a real gap
 * between them.
 */
export function Logo({ className, title = "Copa de Ferias" }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} fill="currentColor" role="img" aria-label={title}>
      <title>{title}</title>
      <path
        fillRule="evenodd"
        d="M14,8 L14,16 L20,16 L20,24 L26,24 L26,32 L32,32 L32,40 L38,40 L38,48 L44,48 L44,56 L56,56 L56,48 L62,48 L62,40 L68,40 L68,32 L74,32 L74,24 L80,24 L80,16 L86,16 L86,8 Z
           M34,25 L38,25 L38,27.2 L34,27.2 Z
           M32,28.2 L40,28.2 L40,31 L32,31 Z
           M62,33 L66,33 L66,35.2 L62,35.2 Z
           M60,36.2 L68,36.2 L68,39 L60,39 Z"
      />
      <path d="M46,56 L54,56 L54,78 L46,78 Z" />
      <path d="M26,90 L74,90 L62,78 L38,78 Z" />
    </svg>
  );
}
