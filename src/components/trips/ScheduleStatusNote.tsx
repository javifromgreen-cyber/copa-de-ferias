import { CheckIcon } from "@/components/icons";
import { formatDate } from "@/lib/utils";
import { scheduleStatusPublicLabel } from "@/lib/catalog/labels";
import type { ScheduleStatus } from "@prisma/client";

/**
 * Explains what "horario confirmado / provisional / fecha provisional"
 * actually means for this specific match, driven by the trip's real
 * scheduleStatus (never a hardcoded date/time string) — prudent wording,
 * never overselling a certainty we don't have (§21).
 */
export function ScheduleStatusNote({ matchDate, scheduleStatus }: { matchDate: Date; scheduleStatus: ScheduleStatus }) {
  const schedule = scheduleStatusPublicLabel(scheduleStatus);

  const body = schedule.confirmed
    ? `El partido se juega el ${formatDate(matchDate, { day: "numeric", month: "long", year: "numeric" })} a las ${formatDate(matchDate, { hour: "2-digit", minute: "2-digit" })}.`
    : scheduleStatus === "time_provisional"
      ? `La fecha de este partido está confirmada (${formatDate(matchDate, { day: "numeric", month: "long", year: "numeric" })}), pero la competición todavía no ha anunciado la hora exacta. En cuanto se confirme, la actualizamos aquí.`
      : `Este partido corresponde a una jornada o eliminatoria ya definida, pero la fecha exacta todavía no está confirmada oficialmente. En cuanto se confirme, la actualizamos aquí.`;

  return (
    <div className="flex items-start gap-2 rounded-sm border border-carbon/10 bg-ivory-dark/40 p-4 text-sm">
      {schedule.confirmed ? <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-carbon/60" /> : <span className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
      <div>
        <p className="mb-1 font-medium text-carbon">{schedule.text}</p>
        <p className="text-carbon/70">{body}</p>
      </div>
    </div>
  );
}
