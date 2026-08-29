/**
 * Desktop-only anchor nav (§30) — a plain jump list, not a routed tab set:
 * every section still lives on the one page, this is just a way to scan
 * and reach them quickly. Hidden on mobile, where the sections themselves
 * are already collapsible <details> blocks.
 */
export function MiViajeNav({ items }: { items: Array<{ id: string; label: string }> }) {
  return (
    <nav aria-label="Secciones de Mi Viaje" className="hidden lg:block">
      <ul className="sticky top-6 space-y-1 text-sm">
        {items.map((item) => (
          <li key={item.id}>
            <a href={`#${item.id}`} className="block rounded-sm px-3 py-1.5 text-carbon/70 hover:bg-ivory-dark/60 hover:text-carbon">
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
