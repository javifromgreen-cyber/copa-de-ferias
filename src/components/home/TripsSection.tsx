import { Container } from "@/components/ui/Container";
import { ButtonLink } from "@/components/ui/Button";
import { TripCard, type TripCardData } from "@/components/trips/TripCard";
import { cn } from "@/lib/utils";

/**
 * Shared layout for both "Partidos destacados" and "Próximos partidos"
 * (§4/§9) — same card, same grid, only the query behind `trips` and the
 * `compact`/`cta` props differ. Renders nothing for an empty list so an
 * empty section never appears (data-driven, §46).
 */
export function MatchesSection({
  id,
  eyebrow,
  title,
  trips,
  compact = false,
  showOrigins = false,
  cta,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  trips: TripCardData[];
  compact?: boolean;
  showOrigins?: boolean;
  cta?: { href: string; label: string };
}) {
  if (trips.length === 0) return null;

  return (
    <section id={id} className="py-16 sm:py-20">
      <Container>
        <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-display mb-3 text-xs tracking-[0.25em] text-cement uppercase">{eyebrow}</p>
            <h2 className="font-display text-3xl uppercase sm:text-4xl">{title}</h2>
          </div>
          {cta ? (
            <ButtonLink href={cta.href} variant="secondary">
              {cta.label}
            </ButtonLink>
          ) : null}
        </div>
        <div className={cn("grid gap-6", compact ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-2 lg:grid-cols-3")}>
          {trips.map((trip) => (
            <TripCard key={trip.id} trip={trip} showOrigins={showOrigins} compact={compact} />
          ))}
        </div>
      </Container>
    </section>
  );
}
