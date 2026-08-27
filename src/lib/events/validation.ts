import { parseAvailablePackageTypes } from "@/lib/pricing/packageTypes";

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
 * A_TU_AIRE-only publish gate — GROUP_CDF trips keep their existing,
 * unchanged publish behavior (this function returns ok for them
 * unconditionally). An A_TU_AIRE product can't go public without at
 * least one Event to sell and at least one package type it actually
 * offers.
 */
export function validateTripPublishable(trip: {
  travelMode: "A_TU_AIRE" | "GROUP_CDF";
  eventsCount: number;
  availablePackageTypes: string;
}): ValidationResult {
  if (trip.travelMode !== "A_TU_AIRE") return { ok: true };

  if (trip.eventsCount < 1) {
    return { ok: false, error: "Un producto A TU AIRE necesita al menos un evento antes de publicarse" };
  }
  if (parseAvailablePackageTypes(trip.availablePackageTypes).length < 1) {
    return { ok: false, error: "Un producto A TU AIRE necesita al menos una modalidad disponible (entrada / hotel / vuelo)" };
  }
  return { ok: true };
}
