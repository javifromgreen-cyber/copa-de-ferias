import { Container } from "@/components/ui/Container";

export function DifferentiatorSection() {
  return (
    <section className="py-14 sm:py-16">
      <Container className="max-w-2xl text-center">
        <p className="font-display text-lg leading-relaxed text-carbon/80 sm:text-xl">
          No vendemos el mismo viaje a todo el mundo. Cada partido tiene su propio plan de entrada,
          hotel y vuelo, pensado para ese estadio y esa ciudad.
        </p>
      </Container>
    </section>
  );
}
