import { z } from "zod";
import { isValidE164Phone, normalizePhoneForDuffel } from "./phone";

/**
 * Fase 2 §3/§4/§5 — the audit found that the live checkout collects
 * firstName/lastName/birthDate/nationality/docType/docNumber/docExpiry/
 * docCountry/phone/emergencyContactName/emergencyContactPhone, but for
 * Duffel a FlightOrderPassenger additionally needs title/gender/email,
 * and birthDate/phone were never actually guaranteed present (both
 * optional on Traveler/CheckoutAttemptTraveler in the schema, matching the
 * existing dynamic-requiredness convention — see
 * src/lib/checkout/travelerFields.ts). This module is the single place
 * that enforces "which fields are mandatory" for the NEW real saga —
 * mandatory only when the modality includes a flight (§3): a
 * TICKET_ONLY/TICKET_HOTEL attempt never needs title/gender/email/phone
 * just because a future modality might.
 */
export type CheckoutAttemptTravelerInput = {
  firstName: string;
  lastName: string;
  birthDate?: string | null; // yyyy-mm-dd
  title?: string; // "mr" | "mrs" | "ms" — Duffel's own vocabulary
  gender?: string; // "m" | "f" — Duffel's own vocabulary
  email?: string;
  phone?: string;
  nationality?: string;
  docType?: string;
  docNumber?: string;
  docExpiry?: string | null;
  docCountry?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  originAirport?: string;
};

export const VALID_TRAVELER_TITLES = ["mr", "mrs", "ms"] as const;
export const VALID_TRAVELER_GENDERS = ["m", "f"] as const;

const emailShape = z.string().trim().email();

export type TravelerValidationResult = { ok: true } | { ok: false; errors: string[] };

/**
 * §4 — no uniqueness is enforced across travelers' emails: the same
 * email (typically the buyer's/lead traveler's) is explicitly allowed to
 * repeat across every traveler. §5 — phone is checked via the same E.164
 * shape Duffel needs, not just "is it non-empty".
 */
export function validateCheckoutAttemptTravelers(travelers: CheckoutAttemptTravelerInput[], opts: { requiresFlightFields: boolean }): TravelerValidationResult {
  const errors: string[] = [];

  if (travelers.length === 0) {
    return { ok: false, errors: ["Debe indicarse al menos un viajero."] };
  }

  travelers.forEach((t, i) => {
    const label = `Viajero ${i + 1}`;
    if (!t.firstName?.trim()) errors.push(`${label}: el nombre es obligatorio.`);
    if (!t.lastName?.trim()) errors.push(`${label}: los apellidos son obligatorios.`);

    if (!opts.requiresFlightFields) return;

    if (!t.title || !(VALID_TRAVELER_TITLES as readonly string[]).includes(t.title)) {
      errors.push(`${label}: title es obligatorio para vuelo (mr/mrs/ms).`);
    }
    if (!t.gender || !(VALID_TRAVELER_GENDERS as readonly string[]).includes(t.gender)) {
      errors.push(`${label}: gender es obligatorio para vuelo (m/f).`);
    }
    if (!t.birthDate) {
      errors.push(`${label}: la fecha de nacimiento es obligatoria para vuelo.`);
    }
    if (!t.email || !emailShape.safeParse(t.email).success) {
      errors.push(`${label}: el email es obligatorio para vuelo.`);
    }
    if (!t.phone || !isValidE164Phone(t.phone)) {
      errors.push(`${label}: el teléfono es obligatorio para vuelo y debe tener formato internacional (E.164, ej. +34600000000).`);
    }
  });

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

/** Normalizes a traveler's phone to E.164 for persistence/Duffel use — call only after validateCheckoutAttemptTravelers has confirmed it's valid. */
export function normalizeTravelerPhone(phone: string): string {
  const normalized = normalizePhoneForDuffel(phone);
  if (!normalized) throw new Error(`normalizeTravelerPhone: "${phone}" is not a valid phone — call after validation.`);
  return normalized;
}
