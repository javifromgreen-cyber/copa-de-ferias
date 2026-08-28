import { Logo } from "@/components/brand/Logo";
import { TripPhoto } from "@/components/trips/TripPhoto";
import { Container } from "@/components/ui/Container";
import type { Brand } from "@/lib/brand";

/**
 * Match-first hero (§2/§3): the search bar submits straight to /viajes,
 * reusing the same real query (getTripsByStatusGroup's `q` filter) the
 * catálogo already runs — no separate hardcoded suggestion list.
 */
export function Hero({ brand }: { brand: Brand }) {
  return (
    <section className="relative">
      <TripPhoto heroImageKey="hero" tone="color" className="h-[62vh] min-h-[440px] w-full">
        <div className="absolute inset-0 flex items-center">
          <Container>
            <div className="max-w-2xl text-ivory">
              <Logo className="mb-5 h-12 w-12" />
              <p className="font-display mb-2 text-xs tracking-[0.35em] text-ivory/70 uppercase">{brand.name}</p>
              <h1 className="font-display mb-6 text-3xl leading-[1.05] uppercase sm:text-4xl md:text-5xl">
                Elige el partido. Nosotros montamos el viaje.
              </h1>

              <form action="/viajes" method="get" className="flex max-w-md flex-col gap-2 sm:flex-row">
                <label htmlFor="hero-search" className="sr-only">
                  Buscar partido
                </label>
                <input
                  id="hero-search"
                  name="q"
                  type="text"
                  placeholder="Equipo, ciudad o competición…"
                  className="w-full flex-1 rounded-sm border border-ivory/40 bg-carbon/30 px-4 py-3 text-sm text-ivory placeholder:text-ivory/50 backdrop-blur-sm focus:border-ivory focus:outline-none"
                />
                <button
                  type="submit"
                  className="inline-flex items-center justify-center rounded-sm bg-ivory px-6 py-3 text-sm font-semibold tracking-wide text-carbon uppercase transition-colors hover:bg-ivory-dark"
                >
                  Buscar partido
                </button>
              </form>
            </div>
          </Container>
        </div>
      </TripPhoto>
    </section>
  );
}
