import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { TripPhoto } from "@/components/trips/TripPhoto";
import { getBrand } from "@/lib/brand";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Comunidad",
  description: "Por qué existe Copa de Ferias: fútbol como motivo de viaje, grupos pequeños, gente que entiende por qué merece la pena coger un avión.",
};

export default async function ComunidadPage() {
  const brand = await getBrand();

  return (
    <div>
      <section className="relative">
        <TripPhoto heroImageKey="comunidad" tone="color" className="h-[42vh] min-h-[320px] w-full">
          <div className="absolute inset-0 flex items-center">
            <Container>
              <p className="font-display max-w-xl text-3xl text-ivory uppercase sm:text-4xl">{brand.claim}</p>
            </Container>
          </div>
        </TripPhoto>
      </section>

      <Container className="max-w-3xl space-y-16 py-16 sm:py-20">
        <section>
          <p className="font-display mb-3 text-xs tracking-[0.25em] text-cement uppercase">Comunidad</p>
          <h1 className="font-display mb-6 text-3xl uppercase sm:text-4xl">Por qué existe {brand.name}</h1>
          <div className="space-y-5 text-lg leading-relaxed text-carbon/85">
            <p>
              Hay partidos que se ven en el sofá y partidos por los que merece la pena coger un avión. {brand.name}{" "}
              existe para lo segundo: seleccionamos esos partidos, esas ciudades y esos estadios, y montamos un
              viaje para vivirlos desde dentro.
            </p>
            <p>
              Puedes venir solo, con un amigo, con tu pareja o con cinco colegas. Lo importante no es eso: es
              encontrarte allí con gente que entiende perfectamente por qué hay partidos por los que merece la pena
              coger un avión.
            </p>
            <p>
              No organizamos viajes para que socialices. Los organizamos porque hay estadios que llevas años
              queriendo conocer, rivalidades que solo se entienden en la grada y ciudades donde el fútbol se respira
              distinto. La comunidad sale sola cuando juntas a gente con la misma obsesión.
            </p>
          </div>
        </section>

        <section className="border-t border-carbon/10 pt-14">
          <p className="font-display mb-3 text-xs tracking-[0.25em] text-cement uppercase">De ciudad en ciudad</p>
          <h2 className="font-display mb-6 text-2xl uppercase sm:text-3xl">Un nombre con historia</h2>
          <div className="space-y-5 text-carbon/80">
            <p>
              La antigua Copa de Ferias nació en una época distinta del fútbol europeo, vinculada originalmente a
              ciudades que celebraban ferias internacionales. Un torneo que, en su tiempo, conectó ciudades a través
              del fútbol.
            </p>
            <p>
              Nos gusta esa idea — ciudades conectadas por el fútbol. De ahí nace nuestro nombre. Décadas después,{" "}
              {brand.name} selecciona ciudades, estadios y partidos por los que, seguimos pensando, merece la pena
              viajar.
            </p>
            <p className="text-sm text-carbon/50">
              {brand.name} no es continuadora de aquella competición, ni tiene relación con UEFA, FIFA ni con
              ninguna organización que gestionase el torneo original. Es solo un nombre que nos gusta y una idea que
              queremos recuperar.
            </p>
          </div>
        </section>
      </Container>
    </div>
  );
}
