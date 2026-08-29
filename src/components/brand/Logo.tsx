/**
 * Copa de Ferias mark.
 *
 * Concept: a stepped, pixel/retro trophy cup — bowl, stem — resting on a
 * small standing figure with its arms raised (head + wide shoulders
 * tapering to a base), as if holding the cup up in celebration. The cup
 * stays the dominant element (taller, wider, heavier mass); the figure is
 * a small, simple, geometric accent at the base, never a mascot competing
 * with it. No curves anywhere in the bowl, no stock trophy clipart, no
 * ball, no UEFA/FIFA symbol.
 *
 * The previous version tried to cut two seated-fan silhouettes into the
 * bowl itself — at real header/favicon size that detail collapsed into
 * illegible notches no matter how the cutout gap was tuned, because the
 * available space inside the bowl's tiers is inherently too small to hold
 * a readable head+body shape. This version moves the figure below the
 * cup instead, where it has room to be a real head (clearly wider than
 * the stem, so it doesn't get lost as "more stem") sitting above a bold,
 * high-contrast arms-up silhouette — legible at both large size and real
 * render size (~32-40px), and immediately reads as a trophy either way.
 */
export function Logo({ className, title = "Copa de Ferias" }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} fill="currentColor" role="img" aria-label={title}>
      <title>{title}</title>
      {/* bowl */}
      <path d="M14,6 L14,13 L21,13 L21,20 L28,20 L28,27 L35,27 L35,33 L42,33 L42,40 L58,40 L58,33 L65,33 L65,27 L72,27 L72,20 L79,20 L79,13 L86,13 L86,6 Z" />
      {/* stem */}
      <path d="M45,40 L55,40 L55,47 L45,47 Z" />
      {/* figure: head, clearly wider than the stem so it reads as a head, not more stem */}
      <path d="M40,49 L60,49 L60,58 L40,58 Z" />
      {/* figure: arms raised / shoulders wide, tapering to a base */}
      <path d="M22,61 L78,61 L64,76 L36,76 Z" />
    </svg>
  );
}
