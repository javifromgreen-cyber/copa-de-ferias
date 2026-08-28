import { prisma } from "@/lib/db";
import { isPubliclyListed } from "@/lib/trips/status";
import { PUBLIC_LISTING_EXCLUDED_SLUGS } from "@/lib/trips/queries";
import type { Competition, Region, CompetitionType } from "@prisma/client";

// ---------------------------------------------------------------------
// Catalog query helpers — the future public catalog ("all Europe events",
// "all domestic leagues in Europe", "all Champions League events", "all
// upcoming Asia matches") is answered entirely from the Competition/Event
// relational data below. No frontend component should ever hardcode a
// list of teams/leagues/regions — it calls one of these instead.
// ---------------------------------------------------------------------

export async function listRegionsInUse(): Promise<Region[]> {
  const rows = await prisma.competition.findMany({ distinct: ["region"], select: { region: true }, orderBy: { region: "asc" } });
  return rows.map((r) => r.region);
}

export function listCompetitionsByRegion(region: Region) {
  return prisma.competition.findMany({ where: { region }, orderBy: { name: "asc" } });
}

export function listCompetitionsByType(competitionType: CompetitionType, region?: Region) {
  return prisma.competition.findMany({
    where: { competitionType, ...(region ? { region } : {}) },
    orderBy: { name: "asc" },
  });
}

export function listAllCompetitions() {
  return prisma.competition.findMany({ orderBy: [{ region: "asc" }, { name: "asc" }] });
}

export function listEventsByCompetition(competitionId: string, opts?: { publishedOnly?: boolean }) {
  return prisma.event.findMany({
    where: { competitionId, ...(opts?.publishedOnly ? { status: "published" } : {}) },
    include: { competition: true, trip: true },
    orderBy: { matchDate: "asc" },
  });
}

export function listEventsByRegion(region: Region, opts?: { upcomingOnly?: boolean; publishedOnly?: boolean }) {
  return prisma.event.findMany({
    where: {
      competition: { region },
      ...(opts?.upcomingOnly ? { matchDate: { gte: new Date() } } : {}),
      ...(opts?.publishedOnly ? { status: "published" } : {}),
    },
    include: { competition: true, trip: true },
    orderBy: { matchDate: "asc" },
  });
}

export function listEventsByCompetitionType(competitionType: CompetitionType, region?: Region, opts?: { upcomingOnly?: boolean; publishedOnly?: boolean }) {
  return prisma.event.findMany({
    where: {
      competition: { competitionType, ...(region ? { region } : {}) },
      ...(opts?.upcomingOnly ? { matchDate: { gte: new Date() } } : {}),
      ...(opts?.publishedOnly ? { status: "published" } : {}),
    },
    include: { competition: true, trip: true },
    orderBy: { matchDate: "asc" },
  });
}

export type CompetitionWithTripCount = Competition & { tripCount: number };

/**
 * "Explora por Competición" (§10-11) — only competitions that actually have
 * a real, publicly-listed match right now (same listability rule as
 * /viajes: isPubliclyListed + not the retired Belgrado slug). Never shows
 * an empty category. Grouped by region so the page can render a simple,
 * scalable index without a mega-menu.
 */
export async function listCompetitionsWithPublicTrips(): Promise<Record<Region, CompetitionWithTripCount[]>> {
  const competitions = await prisma.competition.findMany({
    include: { events: { include: { trip: true } } },
    orderBy: [{ region: "asc" }, { name: "asc" }],
  });

  const byRegion: Record<Region, CompetitionWithTripCount[]> = {
    EUROPE: [],
    SOUTH_AMERICA: [],
    NORTH_AMERICA: [],
    ASIA: [],
    AFRICA: [],
    OCEANIA: [],
  };

  for (const { events, ...competition } of competitions) {
    const tripIds = new Set(
      events
        .map((e) => e.trip)
        .filter((trip) => isPubliclyListed(trip) && !PUBLIC_LISTING_EXCLUDED_SLUGS.has(trip.slug))
        .map((trip) => trip.id),
    );
    if (tripIds.size === 0) continue;
    byRegion[competition.region].push({ ...competition, tripCount: tripIds.size });
  }

  return byRegion;
}
