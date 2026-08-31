/**
 * Fase 2 §5 — a minimal, honest E.164 validator/normalizer. No phone-
 * number library exists in this project yet (package.json has none), and
 * a full library (libphonenumber-js and friends ship megabytes of country
 * metadata) would be disproportionate for what this phase actually needs:
 * producing a value Duffel's FlightOrderPassenger.phoneNumber will accept
 * (documented as E.164 — a leading `+`, country code, national number, no
 * separators). This is deliberately NOT "strip spaces and hope" — it
 * strips only cosmetic formatting (spaces/dashes/dots/parentheses) and
 * then re-validates the RESULT against a strict E.164 shape, rejecting
 * anything that doesn't end up looking like a real E.164 number. It does
 * NOT verify the number is a real, dialable line, nor validate per-country
 * length/prefix rules — that would require real telephony data (a
 * library), which this phase deliberately avoids adding without a
 * concrete need beyond "shape Duffel will accept".
 */
const E164_REGEX = /^\+[1-9]\d{6,14}$/;

/** Returns the normalized E.164 string, or null if the input can't be turned into one. */
export function normalizePhoneForDuffel(raw: string): string | null {
  const trimmed = raw.trim();
  if (E164_REGEX.test(trimmed)) return trimmed;
  const stripped = trimmed.replace(/[\s\-().]/g, "");
  return E164_REGEX.test(stripped) ? stripped : null;
}

export function isValidE164Phone(raw: string): boolean {
  return normalizePhoneForDuffel(raw) !== null;
}
