// The 7 categories for the general FAQ page. Order here is the display
// order — an uncategorised row (legacy "" category) falls under "Otras".
export const FAQ_CATEGORY_ORDER = [
  "antes-de-reservar",
  "entradas",
  "hotel",
  "vuelos",
  "pago-y-reserva",
  "despues-de-reservar",
  "por-que-copa-de-ferias",
] as const;

export const FAQ_CATEGORY_LABELS: Record<string, string> = {
  "antes-de-reservar": "Antes de reservar",
  entradas: "Entradas",
  hotel: "Hotel",
  vuelos: "Vuelos",
  "pago-y-reserva": "Pago y reserva",
  "despues-de-reservar": "Después de reservar",
  "por-que-copa-de-ferias": "¿Por qué Copa de Ferias?",
};

export function faqCategoryLabel(category: string): string {
  return FAQ_CATEGORY_LABELS[category] ?? "Otras preguntas";
}

export function groupFaqsByCategory<T extends { category: string }>(faqs: T[]): { category: string; label: string; items: T[] }[] {
  const byCategory = new Map<string, T[]>();
  for (const faq of faqs) {
    const list = byCategory.get(faq.category) ?? [];
    list.push(faq);
    byCategory.set(faq.category, list);
  }

  const orderedKeys = [...FAQ_CATEGORY_ORDER, ...[...byCategory.keys()].filter((c) => !(FAQ_CATEGORY_ORDER as readonly string[]).includes(c))];

  return orderedKeys
    .filter((category) => byCategory.has(category))
    .map((category) => ({ category, label: faqCategoryLabel(category), items: byCategory.get(category)! }));
}
