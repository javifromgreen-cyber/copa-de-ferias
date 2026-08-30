/**
 * Human-readable trigger label for Admin's email template list — the one
 * place the raw timingReference/timingDaysOffset pair gets turned into
 * copy, so every listing reads it the same way.
 */
export function disparadorLabel(t: { timingReference: string; timingDaysOffset: number | null }): string {
  switch (t.timingReference) {
    case "immediate":
      return "Inmediato";
    case "event":
      return "Evento";
    case "booking_plus_1":
      return `+${t.timingDaysOffset} día tras la reserva`;
    case "before_departure":
      return `${t.timingDaysOffset === 2 ? "48 h" : `${t.timingDaysOffset} días`} antes del viaje`;
    case "after_return":
      return "Después del viaje";
    default:
      return t.timingReference;
  }
}
