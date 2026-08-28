import type { ScheduleStatus } from "@prisma/client";

// Shared copy for the small schedule-status badge shown next to an Event
// throughout the A_TU_AIRE checkout — kept in one place so the three
// states (confirmed / time_provisional / date_provisional) always read
// consistently wherever they appear.
export function scheduleStatusBadgeLabel(status: ScheduleStatus): string | null {
  if (status === "confirmed") return null;
  if (status === "time_provisional") return "Horario provisional";
  return "Fecha provisional";
}
