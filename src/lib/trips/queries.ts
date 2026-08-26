import { prisma } from "@/lib/db";
import { isPubliclyListed } from "./status";
import type { TripCardData } from "@/components/trips/TripCard";

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
  return trips.filter(isPubliclyListed).map(toCardData);
}

export async function getTripsByStatusGroup() {
  const trips = await prisma.trip.findMany({
    orderBy: { order: "asc" },
    include: { origins: { orderBy: { order: "asc" } } },
  });
  const listed = trips.filter(isPubliclyListed);

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
