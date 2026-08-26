import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { FaqAccordion } from "@/components/faq/FaqAccordion";
import { prisma } from "@/lib/db";
import { getBrand } from "@/lib/brand";

export const revalidate = 60;

export const metadata: Metadata = { title: "FAQ", description: "Preguntas frecuentes sobre los viajes de Copa de Ferias." };

export default async function FaqPage() {
  const [faqs, brand] = await Promise.all([
    prisma.faq.findMany({ where: { active: true }, orderBy: { order: "asc" } }),
    getBrand(),
  ]);

  return (
    <Container className="max-w-3xl py-16 sm:py-20">
      <p className="font-display mb-3 text-xs tracking-[0.25em] text-cement uppercase">FAQ</p>
      <h1 className="font-display mb-10 text-3xl uppercase sm:text-4xl">Preguntas frecuentes</h1>

      {faqs.length > 0 ? (
        <FaqAccordion items={faqs} />
      ) : (
        <p className="text-carbon/60">Todavía no hay preguntas configuradas.</p>
      )}

      <p className="mt-10 text-sm text-carbon/60">
        ¿No encuentras lo que buscabas? Escríbenos a{" "}
        <a href={`mailto:${brand.contactEmail}`} className="underline">
          {brand.contactEmail}
        </a>
        .
      </p>
    </Container>
  );
}
