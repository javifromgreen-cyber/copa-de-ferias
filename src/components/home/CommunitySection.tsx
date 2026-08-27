import { ButtonLink } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { TripPhoto } from "@/components/trips/TripPhoto";

export function CommunitySection() {
  return (
    <section className="py-20 sm:py-28">
      <Container className="grid items-center gap-10 md:grid-cols-2">
        <div>
          <p className="font-display mb-3 text-xs tracking-[0.25em] text-cement uppercase">Comunidad</p>
          <h2 className="font-display mb-6 text-3xl leading-tight uppercase sm:text-4xl">
            Gente que entiende por qué
            <br />
            merece la pena coger un avión por esto.
          </h2>
          <p className="mb-6 max-w-lg text-base text-carbon/80 sm:text-lg">
            Puedes venir solo, con un amigo, con tu pareja o con cinco colegas. Lo importante no es eso: es
            encontrarte allí con gente que entiende perfectamente por qué hay partidos por los que merece la pena
            coger un avión.
          </p>
          <ButtonLink href="/comunidad" variant="secondary">
            Conoce la comunidad
          </ButtonLink>
        </div>
        <TripPhoto heroImageKey="comunidad" tone="color" className="aspect-[4/3] w-full rounded-sm" />
      </Container>
    </section>
  );
}
