import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { listCompetitionsWithPublicTrips } from "@/lib/catalog/queries";
import { REGION_LABELS, REGIONS } from "@/lib/catalog/labels";

// Competition list is data-driven from the catalog — revalidate instead of
// a permanent build-time snapshot (§10/§30).
export const revalidate = 60;

export const metadata: Metadata = {
  title: "Competiciones",
  description: "Explora los partidos de Copa de Ferias por competición: ligas nacionales, copas y torneos continentales.",
};

export default async function CompeticionesPage() {
  const byRegion = await listCompetitionsWithPublicTrips();
  const regionsWithCompetitions = REGIONS.filter((region) => byRegion[region].length > 0);

  return (
    <Container className="py-14 sm:py-20">
      <header className="mb-14 max-w-2xl">
        <p className="font-display mb-3 text-xs tracking-[0.25em] text-cement uppercase">Competiciones</p>
        <h1 className="font-display text-4xl uppercase sm:text-5xl">Explora por competición</h1>
        <p className="mt-4 text-carbon/70">Cada competición muestra solo los partidos que tenemos publicados ahora mismo.</p>
      </header>

      {regionsWithCompetitions.length > 0 ? (
        <div className="space-y-12">
          {regionsWithCompetitions.map((region) => (
            <section key={region}>
              <h2 className="font-display mb-5 text-xl uppercase tracking-wide text-carbon/60">{REGION_LABELS[region]}</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {byRegion[region].map((competition) => (
                  <Link
                    key={competition.id}
                    href={`/viajes?competicion=${competition.id}`}
                    className="flex items-center justify-between gap-3 rounded-sm border border-carbon/10 bg-white/40 px-5 py-4 transition-colors hover:border-carbon/30 hover:bg-white/70"
                  >
                    <span className="font-display uppercase">{competition.name}</span>
                    <span className="text-xs text-carbon/50">
                      {competition.tripCount} {competition.tripCount === 1 ? "partido" : "partidos"}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <p className="text-carbon/60">Todavía no hay competiciones con partidos publicados.</p>
      )}
    </Container>
  );
}
