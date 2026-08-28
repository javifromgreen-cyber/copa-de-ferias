import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { TripCard } from "@/components/trips/TripCard";
import { getTripsByStatusGroup } from "@/lib/trips/queries";
import { prisma } from "@/lib/db";

// Trip listing is admin-editable — revalidate instead of a permanent
// build-time snapshot.
export const revalidate = 60;

export const metadata: Metadata = {
  title: "Partidos",
  description: "Los partidos de fútbol que Copa de Ferias ha seleccionado: abiertos, próximamente y realizados.",
};

export default async function ViajesPage({
  searchParams,
}: {
  searchParams: Promise<{ competicion?: string; q?: string }>;
}) {
  const { competicion, q } = await searchParams;
  const [{ open, upcoming, completed }, competition] = await Promise.all([
    getTripsByStatusGroup({ competitionId: competicion, q }),
    competicion ? prisma.competition.findUnique({ where: { id: competicion } }) : null,
  ]);
  const isFiltered = Boolean(competicion || q);

  return (
    <Container className="py-14 sm:py-20">
      <header className="mb-10 max-w-2xl">
        <p className="font-display mb-3 text-xs tracking-[0.25em] text-cement uppercase">Partidos</p>
        <h1 className="font-display text-4xl uppercase sm:text-5xl">Elige tu partido</h1>
        <p className="mt-4 text-carbon/70">
          Elige el partido y luego decides cómo lo vives: solo entrada, o entrada con hotel y vuelo.
        </p>
      </header>

      <form action="/viajes" method="get" className="mb-10 flex max-w-md items-center gap-2">
        <input
          type="text"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Buscar equipo, ciudad o competición…"
          className="w-full rounded-sm border border-carbon/20 bg-white/60 px-4 py-2.5 text-sm placeholder:text-carbon/40 focus:border-carbon/50 focus:outline-none"
        />
        <button type="submit" className="rounded-sm border border-carbon px-4 py-2.5 text-xs font-medium tracking-wide uppercase hover:bg-carbon hover:text-ivory">
          Buscar
        </button>
      </form>

      {isFiltered ? (
        <p className="mb-8 flex items-center gap-3 text-sm text-carbon/60">
          {competition ? (
            <span>
              Filtrando por <strong className="text-carbon">{competition.name}</strong>
            </span>
          ) : (
            <span>
              Resultados para <strong className="text-carbon">&quot;{q}&quot;</strong>
            </span>
          )}
          <Link href="/viajes" className="underline hover:text-carbon">
            Quitar filtro
          </Link>
        </p>
      ) : null}

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
        <p className="text-carbon/60">{isFiltered ? "No hay partidos que coincidan con esta búsqueda." : "Todavía no hay partidos publicados."}</p>
      ) : null}
    </Container>
  );
}
