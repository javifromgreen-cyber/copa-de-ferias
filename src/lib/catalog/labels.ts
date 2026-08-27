import type { Region, CompetitionType, EventStatus } from "@prisma/client";

export const REGION_LABELS: Record<Region, string> = {
  EUROPE: "Europa",
  SOUTH_AMERICA: "Sudamérica",
  NORTH_AMERICA: "Norteamérica",
  ASIA: "Asia",
  AFRICA: "África",
  OCEANIA: "Oceanía",
};

export const COMPETITION_TYPE_LABELS: Record<CompetitionType, string> = {
  DOMESTIC_LEAGUE: "Liga nacional",
  DOMESTIC_CUP: "Copa nacional",
  CONTINENTAL_COMPETITION: "Competición continental",
  OTHER: "Otra",
};

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  draft: "Borrador",
  published: "Publicado",
  cancelled: "Cancelado",
};

export const REGIONS: Region[] = ["EUROPE", "SOUTH_AMERICA", "NORTH_AMERICA", "ASIA", "AFRICA", "OCEANIA"];
export const COMPETITION_TYPES: CompetitionType[] = ["DOMESTIC_LEAGUE", "DOMESTIC_CUP", "CONTINENTAL_COMPETITION", "OTHER"];
export const EVENT_STATUSES: EventStatus[] = ["draft", "published", "cancelled"];
