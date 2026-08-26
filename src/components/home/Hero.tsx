import { Logo } from "@/components/brand/Logo";
import { TripPhoto } from "@/components/trips/TripPhoto";
import { ButtonLink } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import type { Brand } from "@/lib/brand";

export function Hero({ brand }: { brand: Brand }) {
  return (
    <section className="relative">
      <TripPhoto heroImageKey="hero" tone="color" className="h-[78vh] min-h-[520px] w-full">
        <div className="absolute inset-0 flex items-center">
          <Container>
            <div className="max-w-2xl text-ivory">
              <Logo className="mb-6 h-14 w-14" />
              <p className="font-display mb-2 text-xs tracking-[0.35em] text-ivory/70 uppercase">{brand.name}</p>
              <h1 className="font-display mb-5 text-4xl leading-[1.05] uppercase sm:text-5xl md:text-6xl">
                {brand.claim}
              </h1>
              <p className="mb-8 max-w-lg text-base text-ivory/80 sm:text-lg">
                Seleccionamos partidos, estadios y ciudades que justifican coger un avión. Montamos el viaje.
                Tú decides si vienes.
              </p>
              <ButtonLink href="/viajes" className="bg-ivory text-carbon hover:bg-ivory-dark">
                Ver viajes
              </ButtonLink>
            </div>
          </Container>
        </div>
      </TripPhoto>
    </section>
  );
}
