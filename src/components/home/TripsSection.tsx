import { Container } from "@/components/ui/Container";
import { TripCard, type TripCardData } from "@/components/trips/TripCard";

export function TripsSection({ trips }: { trips: TripCardData[] }) {
  if (trips.length === 0) return null;

  return (
    <section id="viajes" className="py-16 sm:py-20">
      <Container>
        <div className="mb-10 flex items-end justify-between">
          <div>
            <p className="font-display mb-3 text-xs tracking-[0.25em] text-cement uppercase">Viajes</p>
            <h2 className="font-display text-3xl uppercase sm:text-4xl">Fútbol que hemos elegido nosotros</h2>
          </div>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {trips.map((trip) => (
            <TripCard key={trip.id} trip={trip} showOrigins />
          ))}
        </div>
      </Container>
    </section>
  );
}
