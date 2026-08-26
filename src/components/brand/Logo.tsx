/**
 * Copa de Ferias mark — provisional, original SVG.
 *
 * Concept: a stepped bowl (stadium grandstand tiers, seen in cross-section)
 * that doubles as a trophy cup, sitting on a stem and base. Works without
 * any text. Deliberately not a copy of any real trophy silhouette, ball, or
 * UEFA/FIFA symbol — swap this file for the definitive logo later.
 */
export function Logo({ className, title = "Copa de Ferias" }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} fill="currentColor" role="img" aria-label={title}>
      <title>{title}</title>
      <path d="M8,12 L8,22 L18,22 L18,32 L28,32 L28,42 L38,42 L38,50 L62,50 L62,42 L72,42 L72,32 L82,32 L82,22 L92,22 L92,12 Z" />
      <path d="M46,50 L54,50 L54,72 L46,72 Z" />
      <path d="M32,88 L68,88 L60,72 L40,72 Z" />
    </svg>
  );
}
