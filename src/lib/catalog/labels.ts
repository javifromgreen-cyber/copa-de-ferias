import type { Region, CompetitionType, EventStatus, ScheduleStatus } from "@prisma/client";

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

/**
 * Public-facing schedule-status badge — distinct from
 * checkout-atu-aire/scheduleStatusLabel's `scheduleStatusBadgeLabel`,
 * which deliberately stays silent on "confirmed" (no news is good news,
 * mid-checkout). On public cards/fichas we want an explicit affirmative
 * badge too, never an alarmist one, never a color-only signal (§8/§50).
 */
export function scheduleStatusPublicLabel(status: ScheduleStatus): { text: string; confirmed: boolean } {
  if (status === "confirmed") return { text: "Horario confirmado", confirmed: true };
  if (status === "time_provisional") return { text: "Horario provisional", confirmed: false };
  return { text: "Fecha provisional", confirmed: false };
}
