import { prisma } from "@/lib/db";
import { isPubliclyListed } from "./status";
import type { TripCardData } from "@/components/trips/TripCard";

// Belgrado (GROUP_CDF) is retired from every public listing surface — it
// reads as a different, confusing product next to the A_TU_AIRE line-up and
// is no longer a UX reference. Its data/checkout stay technically intact
// (still reachable at its direct URL) purely so the existing GROUP_CDF
// checkout e2e coverage keeps working; it must just never be discoverable
// through browsing (Home, catálogo, sitemap).
export const PUBLIC_LISTING_EXCLUDED_SLUGS = new Set(["derbi-eterno-belgrado"]);

function toCardData(trip: {
  id: string;
  slug: string;
  number: number;
  name: string;
  subtitle: string;
  homeTeam: string;
  awayTeam: string;
  status: TripCardData["status"];
  published: boolean;
  maxSpots: number;
  soldSpots: number;
  heroImageKey: string;
  origins?: { city: string }[];
}): TripCardData {
  return {
    id: trip.id,
    slug: trip.slug,
    number: trip.number,
    name: trip.name,
    subtitle: trip.subtitle,
    homeTeam: trip.homeTeam,
    awayTeam: trip.awayTeam,
    status: trip.status,
    published: trip.published,
    maxSpots: trip.maxSpots,
    soldSpots: trip.soldSpots,
    heroImageKey: trip.heroImageKey,
    origins: trip.origins?.map((o) => o.city),
  };
}

export async function getHomeTrips(): Promise<TripCardData[]> {
  const trips = await prisma.trip.findMany({
    where: { homeFeatured: true },
    orderBy: { order: "asc" },
    include: { origins: { orderBy: { order: "asc" } } },
  });
  return trips.filter(isPubliclyListed).filter((t) => !PUBLIC_LISTING_EXCLUDED_SLUGS.has(t.slug)).map(toCardData);
}

export async function getTripsByStatusGroup() {
  const trips = await prisma.trip.findMany({
    orderBy: { order: "asc" },
    include: { origins: { orderBy: { order: "asc" } } },
  });
  const listed = trips.filter(isPubliclyListed).filter((t) => !PUBLIC_LISTING_EXCLUDED_SLUGS.has(t.slug));

  return {
    open: listed.filter((t) => t.status === "open" || t.status === "sold_out").map(toCardData),
    upcoming: listed.filter((t) => t.status === "upcoming").map(toCardData),
    completed: listed.filter((t) => t.status === "completed").map(toCardData),
  };
}

export async function getTripBySlug(slug: string) {
  return prisma.trip.findUnique({
    where: { slug },
    include: {
      origins: { orderBy: { order: "asc" } },
      planningDays: { orderBy: { order: "asc" } },
      activities: { orderBy: { order: "asc" } },
      inclusions: { orderBy: { order: "asc" } },
      requirements: { orderBy: { order: "asc" } },
      faqs: { orderBy: { order: "asc" } },
    },
  });
}
