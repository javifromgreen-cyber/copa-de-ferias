import { getBrand } from "@/lib/brand";
import { getHomeTrips, getUpcomingTrips } from "@/lib/trips/queries";
import { listCompetitionsWithPublicTrips } from "@/lib/catalog/queries";
import { Hero } from "@/components/home/Hero";
import { MatchesSection } from "@/components/home/TripsSection";
import { CompetitionsSection } from "@/components/home/CompetitionsSection";
import { HowItWorksSection } from "@/components/home/HowItWorksSection";
import { ProvidersTrustSection } from "@/components/home/ProvidersTrustSection";
import { HotelFlightValueSection } from "@/components/home/HotelFlightValueSection";
import { DifferentiatorSection } from "@/components/home/DifferentiatorSection";
import { CaptureSection } from "@/components/home/CaptureSection";
import { TrustSection } from "@/components/home/TrustSection";
import { TrackOnMount } from "@/components/analytics/TrackOnMount";

// Featured/upcoming trips, competitions and brand copy are all
// admin-editable — revalidate instead of serving a permanent build-time
// snapshot.
export const revalidate = 60;

export default async function HomePage() {
  const [brand, featured, competitionsByRegion] = await Promise.all([getBrand(), getHomeTrips(), listCompetitionsWithPublicTrips()]);
  const upcoming = await getUpcomingTrips(8, new Set(featured.map((t) => t.id)));

  return (
    <>
      <TrackOnMount event="home_view" />
      <Hero brand={brand} />
      <MatchesSection eyebrow="Partidos" title="Partidos destacados" trips={featured} showOrigins />
      <CompetitionsSection byRegion={competitionsByRegion} />
      <MatchesSection
        eyebrow="Calendario"
        title="Próximos partidos"
        trips={upcoming}
        compact
        cta={{ href: "/viajes", label: "Ver todos los partidos" }}
      />
      <HowItWorksSection />
      <ProvidersTrustSection />
      <HotelFlightValueSection />
      <DifferentiatorSection />
      <CaptureSection />
      <TrustSection brand={brand} />
    </>
  );
}
