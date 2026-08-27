import type { Region, CompetitionType } from "@prisma/client";

export type KnownCompetition = {
  name: string;
  region: Region;
  country: string; // "" for competitions not tied to a single country
  competitionType: CompetitionType;
};

/**
 * Curated reference catalog of well-known competitions, seeded once via
 * prisma/seed.ts and reused as the single source of truth for the
 * classification unit tests. Admin can still create ad-hoc competitions
 * beyond this list from /admin/competiciones — this list only exists so
 * common ones aren't re-typed inconsistently every time.
 */
export const KNOWN_COMPETITIONS: KnownCompetition[] = [
  { name: "Premier League", region: "EUROPE", country: "England", competitionType: "DOMESTIC_LEAGUE" },
  { name: "LaLiga", region: "EUROPE", country: "Spain", competitionType: "DOMESTIC_LEAGUE" },
  { name: "Serie A", region: "EUROPE", country: "Italy", competitionType: "DOMESTIC_LEAGUE" },
  { name: "Eredivisie", region: "EUROPE", country: "Netherlands", competitionType: "DOMESTIC_LEAGUE" },
  { name: "Serbian SuperLiga", region: "EUROPE", country: "Serbia", competitionType: "DOMESTIC_LEAGUE" },
  { name: "Champions League", region: "EUROPE", country: "", competitionType: "CONTINENTAL_COMPETITION" },
  { name: "Liga Profesional", region: "SOUTH_AMERICA", country: "Argentina", competitionType: "DOMESTIC_LEAGUE" },
  { name: "Copa Libertadores", region: "SOUTH_AMERICA", country: "", competitionType: "CONTINENTAL_COMPETITION" },
];
