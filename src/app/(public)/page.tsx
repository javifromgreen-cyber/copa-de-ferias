import { getBrand } from "@/lib/brand";
import { getHomeTrips } from "@/lib/trips/queries";
import { Hero } from "@/components/home/Hero";
import { CommunitySection } from "@/components/home/CommunitySection";
import { TripsSection } from "@/components/home/TripsSection";
import { HowItWorksSection } from "@/components/home/HowItWorksSection";
import { CaptureSection } from "@/components/home/CaptureSection";
import { TrustSection } from "@/components/home/TrustSection";
import { TrackOnMount } from "@/components/analytics/TrackOnMount";

// Featured trips and brand copy are admin-editable — revalidate instead of
// serving a permanent build-time snapshot.
export const revalidate = 60;

export default async function HomePage() {
  const [brand, trips] = await Promise.all([getBrand(), getHomeTrips()]);

  return (
    <>
      <TrackOnMount event="home_view" />
      <Hero brand={brand} />
      <CommunitySection />
      <TripsSection trips={trips} />
      <HowItWorksSection />
      <CaptureSection />
      <TrustSection brand={brand} />
    </>
  );
}
