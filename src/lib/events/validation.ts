export type ValidationResult = { ok: true } | { ok: false; error: string };

/**
 * An Event can only be published once it's actually classified and has
 * the minimum data a public listing needs. Enforced both in the Admin
 * form and in the server action (saveEvent) so it can't be bypassed by
 * calling the action directly.
 */
export function validateEventPublishable(event: {
  competitionId: string | null;
  homeTeam: string;
  awayTeam: string;
  stadium: string;
}): ValidationResult {
  if (!event.competitionId) {
    return { ok: false, error: "El evento necesita una competición asignada antes de publicarse" };
  }
  if (!event.homeTeam.trim() || !event.awayTeam.trim()) {
    return { ok: false, error: "Faltan los equipos local y visitante" };
  }
  if (!event.stadium.trim()) {
    return { ok: false, error: "Falta el estadio" };
  }
  return { ok: true };
}

/**
 * A_TU_AIRE-only — the automatic hotel shortlist (searchHotelShortlist)
 * depends structurally on Event.stadiumLatitude/stadiumLongitude, with
 * no fallback (never a guessed/"city center" location). An A_TU_AIRE
 * Event always conceptually offers TICKET_HOTEL (§1/§5 — there's no
 * per-modality publish toggle), so missing stadium coordinates mean the
 * hotel side of this product isn't correctly configured — this must be
 * caught here, in Admin, never discovered for the first time by a
 * customer at checkout. Never applies to GROUP_CDF, which has no
 * automatic hotel search at all. Used both as a publish gate (saveEvent)
 * and as a standalone check for Admin "needs attention" warnings, so a
 * misconfigured Event is visible even before anyone tries to publish it.
 */
export function validateEventHotelConfiguration(event: {
  travelMode: "A_TU_AIRE" | "GROUP_CDF";
  stadiumLatitude: number | null;
  stadiumLongitude: number | null;
}): ValidationResult {
  if (event.travelMode !== "A_TU_AIRE") return { ok: true };
  if (event.stadiumLatitude === null || event.stadiumLongitude === null) {
    return {
      ok: false,
      error: "Este evento pertenece a un producto A TU AIRE y necesita la latitud/longitud del estadio antes de publicarse, para poder ofrecer hotel automáticamente.",
    };
  }
  return { ok: true };
}

/**
 * A_TU_AIRE-only publish gate — GROUP_CDF trips keep their existing,
 * unchanged publish behavior (this function returns ok for them
 * unconditionally). An A_TU_AIRE product can't go public without at least
 * one Event to sell — it always conceptually offers all three modalities
 * by definition (§1/§5), so there is no longer a separate "has at least
 * one modality configured" gate to check here.
 */
export function validateTripPublishable(trip: { travelMode: "A_TU_AIRE" | "GROUP_CDF"; eventsCount: number }): ValidationResult {
  if (trip.travelMode !== "A_TU_AIRE") return { ok: true };

  if (trip.eventsCount < 1) {
    return { ok: false, error: "Un producto A TU AIRE necesita al menos un evento antes de publicarse" };
  }
  return { ok: true };
}
