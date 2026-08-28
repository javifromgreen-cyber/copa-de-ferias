import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { FaqAccordion } from "@/components/faq/FaqAccordion";
import { groupFaqsByCategory } from "@/lib/faq/categories";
import { prisma } from "@/lib/db";
import { getBrand } from "@/lib/brand";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "FAQ",
  description: "Preguntas frecuentes sobre reservar partidos con Copa de Ferias: entradas, hotel, vuelos, pago y reserva.",
};

export default async function FaqPage() {
  const [faqs, brand] = await Promise.all([
    prisma.faq.findMany({ where: { active: true }, orderBy: { order: "asc" } }),
    getBrand(),
  ]);
  const groups = groupFaqsByCategory(faqs);

  return (
    <Container className="max-w-3xl py-16 sm:py-20">
      <p className="font-display mb-3 text-xs tracking-[0.25em] text-cement uppercase">FAQ</p>
      <h1 className="font-display mb-4 text-3xl uppercase sm:text-4xl">Preguntas frecuentes</h1>
      <p className="mb-10 text-carbon/70">Todo lo que necesitas saber antes de reservar un partido, y qué pasa después.</p>

      {groups.length > 0 ? (
        <>
          <nav aria-label="Categorías de preguntas frecuentes" className="mb-12 flex flex-wrap gap-2">
            {groups.map((group) => (
              <a
                key={group.category}
                href={`#${group.category}`}
                className="rounded-full border border-carbon/20 px-3 py-1.5 text-xs text-carbon/70 hover:border-carbon/40 hover:text-carbon"
              >
                {group.label}
              </a>
            ))}
          </nav>

          <div className="space-y-14">
            {groups.map((group) => (
              <section key={group.category} id={group.category}>
                <h2 className="font-display mb-4 text-xl uppercase">{group.label}</h2>
                <FaqAccordion items={group.items} defaultOpenFirst={false} />
              </section>
            ))}
          </div>
        </>
      ) : (
        <p className="text-carbon/60">Todavía no hay preguntas configuradas.</p>
      )}

      <p className="mt-14 text-sm text-carbon/60">
        ¿No encuentras lo que buscabas? Escríbenos a{" "}
        <a href={`mailto:${brand.contactEmail}`} className="underline">
          {brand.contactEmail}
        </a>
        .
      </p>
    </Container>
  );
}
