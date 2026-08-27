/**
 * Copa de Ferias mark — provisional, original SVG.
 *
 * Concept: a stepped bowl (stadium grandstand tiers, seen in cross-section)
 * that doubles as a trophy cup, sitting on a stem and base. Works without
 * any text. Deliberately not a copy of any real trophy silhouette, ball, or
 * UEFA/FIFA symbol — swap this file for the definitive logo later.
 *
 * Two seated-fan silhouettes are cut into the side tiers (one per side, at
 * different step heights, sized to stay legible at header size) using a
 * single compound path with fill-rule="evenodd" — the fan shapes are drawn
 * as extra sub-paths inside the cup's outline, so wherever they overlap the
 * cup they become holes that show whatever is behind the mark. That means
 * the fans always automatically render in the *background* color, with no
 * separate color value to keep in sync: light fans cut into a dark cup on a
 * light page, dark fans cut into a light cup on a dark section (header vs.
 * footer/hero) — both for free, from the same path.
 */
export function Logo({ className, title = "Copa de Ferias" }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} fill="currentColor" role="img" aria-label={title}>
      <title>{title}</title>
      <path
        fillRule="evenodd"
        d="M8,12 L8,22 L18,22 L18,32 L28,32 L28,42 L38,42 L38,50 L62,50 L62,42 L72,42 L72,32 L82,32 L82,22 L92,22 L92,12 Z
           M9,13 L17,13 L17,16 L9,16 Z
           M9,16 L19,16 L19,21 L9,21 Z
           M73,24 L81,24 L81,27 L73,27 Z
           M71,27 L81,27 L81,31 L71,31 Z"
      />
      <path d="M46,50 L54,50 L54,72 L46,72 Z" />
      <path d="M32,88 L68,88 L60,72 L40,72 Z" />
    </svg>
  );
}
