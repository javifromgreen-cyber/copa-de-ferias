/**
 * Copa de Ferias mark — provisional, original SVG.
 *
 * Concept: a stepped bowl (stadium grandstand tiers, seen in cross-section)
 * that doubles as a trophy cup, sitting on a stem and base. Works without
 * any text. Deliberately not a copy of any real trophy silhouette, ball, or
 * UEFA/FIFA symbol — swap this file for the definitive logo later.
 *
 * Two seated-fan pictograms (head, torso, seat ledge — three stacked
 * rects each) are cut into the two *interior* tiers, one per side at a
 * different step height, using a single compound path with
 * fill-rule="evenodd". Each cutout keeps a deliberate margin (≥2 units)
 * from every edge that is part of the cup's true outer silhouette, so the
 * figures read as sitting *inside* the mass — never as notches biting
 * into the contour. Being holes, they always render in the *background*
 * color automatically: light fans cut into a dark cup on a light page,
 * dark fans cut into a light cup on a dark section (header vs.
 * footer/hero) — both for free, from the same path.
 */
export function Logo({ className, title = "Copa de Ferias" }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} fill="currentColor" role="img" aria-label={title}>
      <title>{title}</title>
      <path
        fillRule="evenodd"
        d="M8,12 L8,22 L18,22 L18,32 L28,32 L28,42 L38,42 L38,50 L62,50 L62,42 L72,42 L72,32 L82,32 L82,22 L92,22 L92,12 Z
           M22,23 L26,23 L26,26 L22,26 Z
           M21,26 L27,26 L27,29 L21,29 Z
           M20,29 L28,29 L28,30 L20,30 Z
           M64,33 L68,33 L68,36 L64,36 Z
           M63,36 L69,36 L69,39 L63,39 Z
           M62,39 L70,39 L70,40 L62,40 Z"
      />
      <path d="M46,50 L54,50 L54,72 L46,72 Z" />
      <path d="M32,88 L68,88 L60,72 L40,72 Z" />
    </svg>
  );
}
