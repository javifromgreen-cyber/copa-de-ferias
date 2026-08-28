import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { ButtonLink } from "@/components/ui/Button";
import type { CompetitionWithTripCount } from "@/lib/catalog/queries";
import { REGION_LABELS, REGIONS } from "@/lib/catalog/labels";
import type { Region } from "@prisma/client";

/**
 * "Explora por competición" (§10/§11) — only competitions with a real
 * published match, straight from listCompetitionsWithPublicTrips. A first,
 * simple + scalable nav into the catálogo — no mega-menu yet.
 */
export function CompetitionsSection({ byRegion }: { byRegion: Record<Region, CompetitionWithTripCount[]> }) {
  const regionsWithCompetitions = REGIONS.filter((region) => byRegion[region].length > 0);
  if (regionsWithCompetitions.length === 0) return null;

  return (
    <section className="border-y border-carbon/10 bg-ivory-dark/40 py-16 sm:py-20">
      <Container>
        <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-display mb-3 text-xs tracking-[0.25em] text-cement uppercase">Explora</p>
            <h2 className="font-display text-3xl uppercase sm:text-4xl">Por competición</h2>
          </div>
          <ButtonLink href="/competiciones" variant="secondary">
            Ver todas las competiciones
          </ButtonLink>
        </div>

        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {regionsWithCompetitions.map((region) => (
            <div key={region}>
              <p className="mb-3 text-xs tracking-[0.2em] text-carbon/50 uppercase">{REGION_LABELS[region]}</p>
              <ul className="space-y-1.5">
                {byRegion[region].map((competition) => (
                  <li key={competition.id}>
                    <Link
                      href={`/viajes?competicion=${competition.id}`}
                      className="text-sm text-carbon/80 underline-offset-4 hover:text-carbon hover:underline"
                    >
                      {competition.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
