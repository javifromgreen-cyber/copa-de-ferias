import { prisma } from "@/lib/db";
import { isPubliclyListed } from "./status";
import { attachFromPrices } from "./fromPrice";
import type { TripCardData } from "@/components/trips/TripCard";
import type { Prisma } from "@prisma/client";

// Belgrado (GROUP_CDF) is retired from every public listing surface — it
// reads as a different, confusing product next to the A_TU_AIRE line-up and
// is no longer a UX reference. Its data/checkout stay technically intact
// (still reachable at its direct URL) purely so the existing GROUP_CDF
// checkout e2e coverage keeps working; it must just never be discoverable
// through browsing (Home, catálogo, sitemap).
export const PUBLIC_LISTING_EXCLUDED_SLUGS = new Set(["derbi-eterno-belgrado"]);

// Every public listing query needs the same shape: the trip itself, its
// primary Event (for the competition badge — a Trip has no direct
// Competition relation), and everything attachFromPrices needs. One
// constant so every query below stays in sync.
const CARD_QUERY_ARGS = {
  include: {
    origins: { orderBy: { order: "asc" as const } },
    events: { where: { primaryEvent: true }, take: 1, include: { competition: true } },
  },
};

type CardQueryTrip = Prisma.TripGetPayload<typeof CARD_QUERY_ARGS>;

async function toCardDataList(trips: CardQueryTrip[]): Promise<TripCardData[]> {
  const prices = await attachFromPrices(trips);
  return trips.map((trip) => {
    const primaryEvent = trip.events[0];
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
      origins: trip.origins.map((o) => o.city),
      matchDate: trip.matchDate,
      scheduleStatus: trip.scheduleStatus,
      competitionName: primaryEvent?.competition?.name ?? null,
      fromPricePerPerson: prices.get(trip.id) ?? null,
      currency: trip.currency,
    };
  });
}

function isListed(trip: { status: CardQueryTrip["status"]; slug: string }) {
  return isPubliclyListed(trip) && !PUBLIC_LISTING_EXCLUDED_SLUGS.has(trip.slug);
}

/**
 * "Partidos destacados" — `homeFeatured` (set from Admin) is the editorial
 * source of truth for *which* trips are featured; this never picks by
 * slug or any other automatic heuristic. It still guards against showing
 * a "Próximamente"/unpublished placeholder here even if one is
 * (mis)marked featured: only a published, currently open trip with a
 * real active price counts as a destacado.
 */
export async function getHomeTrips(): Promise<TripCardData[]> {
  const trips = await prisma.trip.findMany({
    where: { homeFeatured: true, published: true, status: "open" },
    orderBy: { order: "asc" },
    ...CARD_QUERY_ARGS,
  });
  const cards = await toCardDataList(trips.filter(isListed));
  return cards.filter((c) => c.fromPricePerPerson !== null);
}

/**
 * "Próximos partidos" (§9) — chronological. `excludeIds` keeps this from
 * re-showing a trip already rendered in "Partidos destacados" right above
 * it on Home — the same card twice on one page is never the intent, even
 * though both sections independently pull from real, overlapping data.
 */
export async function getUpcomingTrips(limit?: number, excludeIds?: Set<string>): Promise<TripCardData[]> {
  const trips = await prisma.trip.findMany({
    where: { matchDate: { gte: new Date() } },
    orderBy: { matchDate: "asc" },
    ...CARD_QUERY_ARGS,
  });
  const listed = trips.filter((t) => isListed(t) && !excludeIds?.has(t.id));
  return toCardDataList(limit ? listed.slice(0, limit) : listed);
}

export async function getTripsByStatusGroup(opts?: { competitionId?: string; q?: string }) {
  const trips = await prisma.trip.findMany({ orderBy: { order: "asc" }, ...CARD_QUERY_ARGS });
  let listed = trips.filter(isListed);

  if (opts?.competitionId) {
    listed = listed.filter((t) => t.events.some((e) => e.competitionId === opts.competitionId));
  }
  if (opts?.q) {
    const q = opts.q.trim().toLowerCase();
    if (q) {
      listed = listed.filter((t) => {
        const haystack = [t.name, t.homeTeam, t.awayTeam, t.city, t.events[0]?.competition?.name ?? ""].join(" ").toLowerCase();
        return haystack.includes(q);
      });
    }
  }

  const [open, upcoming, completed] = await Promise.all([
    toCardDataList(listed.filter((t) => t.status === "open" || t.status === "sold_out")),
    toCardDataList(listed.filter((t) => t.status === "upcoming")),
    toCardDataList(listed.filter((t) => t.status === "completed")),
  ]);

  return { open, upcoming, completed };
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
      events: { where: { primaryEvent: true }, take: 1, include: { competition: true } },
    },
  });
}
