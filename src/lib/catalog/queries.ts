import { prisma } from "@/lib/db";
import type { Region, CompetitionType } from "@prisma/client";

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
