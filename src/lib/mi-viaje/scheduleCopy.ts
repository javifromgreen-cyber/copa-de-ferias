import type { ScheduleStatus } from "@prisma/client";
import { formatDate } from "@/lib/utils";

export type EventScheduleCopy = {
  dateLabel: string;
  timeLabel: string | null;
  statusLabel: string;
  note: string | null;
};

/**
 * The one place Mi Viaje turns an Event's real scheduleStatus into copy
 * (§6) — never inventing a kickoff time that isn't in the data, and never
 * silently treating a provisional date as if it were confirmed.
 */
export function eventScheduleCopy(event: { matchDate: Date; kickoff: Date | null; scheduleStatus: ScheduleStatus }): EventScheduleCopy {
  const dateLabel = formatDate(event.matchDate, { day: "numeric", month: "long", year: "numeric" });

  if (event.scheduleStatus === "confirmed") {
    return {
      dateLabel,
      timeLabel: event.kickoff ? formatDate(event.kickoff, { hour: "2-digit", minute: "2-digit" }) : null,
      statusLabel: "Horario confirmado",
      note: null,
    };
  }

  if (event.scheduleStatus === "time_provisional") {
    return {
      dateLabel,
      timeLabel: null,
      statusLabel: "Hora pendiente de confirmación",
      note: "Te avisaremos aquí si se actualiza el horario del partido.",
    };
  }

  return {
    dateLabel,
    timeLabel: null,
    statusLabel: "Fecha provisional",
    note: "La fecha de este partido todavía puede cambiar. Te avisaremos aquí en cuanto se confirme.",
  };
}
