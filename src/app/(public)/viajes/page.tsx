import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { TripCard } from "@/components/trips/TripCard";
import { getTripsByStatusGroup } from "@/lib/trips/queries";

// Trip listing is admin-editable — revalidate instead of a permanent
// build-time snapshot.
export const revalidate = 60;

export const metadata: Metadata = {
  title: "Viajes",
  description: "Los viajes de fútbol que Copa de Ferias ha seleccionado: abiertos, próximamente y realizados.",
};

export default async function ViajesPage() {
  const { open, upcoming, completed } = await getTripsByStatusGroup();

  return (
    <Container className="py-14 sm:py-20">
      <header className="mb-14 max-w-2xl">
        <p className="font-display mb-3 text-xs tracking-[0.25em] text-cement uppercase">Viajes</p>
        <h1 className="font-display text-4xl uppercase sm:text-5xl">Los viajes que hemos montado</h1>
        <p className="mt-4 text-carbon/70">
          No configuras nada: elegimos los partidos, cerramos el producto y tú decides si te apuntas.
        </p>
      </header>

      {open.length > 0 ? (
        <section className="mb-16">
          <h2 className="font-display mb-6 text-2xl uppercase">Abiertos</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {open.map((trip) => (
              <TripCard key={trip.id} trip={trip} showOrigins />
            ))}
          </div>
        </section>
      ) : null}

      {upcoming.length > 0 ? (
        <section className="mb-16">
          <h2 className="font-display mb-6 text-2xl uppercase">Próximamente</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {upcoming.map((trip) => (
              <TripCard key={trip.id} trip={trip} />
            ))}
          </div>
        </section>
      ) : null}

      {completed.length > 0 ? (
        <section>
          <h2 className="font-display mb-6 text-2xl uppercase">Realizados</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {completed.map((trip) => (
              <TripCard key={trip.id} trip={trip} />
            ))}
          </div>
        </section>
      ) : null}

      {open.length === 0 && upcoming.length === 0 && completed.length === 0 ? (
        <p className="text-carbon/60">Todavía no hay viajes publicados.</p>
      ) : null}
    </Container>
  );
}
