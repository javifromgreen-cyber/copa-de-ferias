/**
 * Event.matchDate is edited from Admin as two separate form fields (date +
 * time), both read/written using UTC components — the same convention the
 * date field alone already used before this pair existed. Keeping both
 * fields on that one convention means combining them back into a single
 * Date on save never shifts the stored instant relative to what the date
 * field already showed, and never silently drops the time-of-day just
 * because only some other field on the form was edited.
 */

const TIME_PATTERN = /^\d{2}:\d{2}$/;

/** Combines a "yyyy-mm-dd" date and an "HH:mm" time (or "") into one UTC Date. */
export function combineMatchDateTime(dateStr: string, timeStr: string): Date {
  const time = TIME_PATTERN.test(timeStr) ? timeStr : "00:00";
  return new Date(`${dateStr}T${time}:00.000Z`);
}

/** Extracts the "HH:mm" UTC time-of-day from a Date, to precrack the time field. */
export function extractMatchTimeUTC(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}
