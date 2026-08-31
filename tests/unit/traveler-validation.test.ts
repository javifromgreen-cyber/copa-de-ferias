import { describe, it, expect } from "vitest";
import { validateCheckoutAttemptTravelers, type CheckoutAttemptTravelerInput } from "@/lib/checkout-saga/travelerValidation";
import { isValidE164Phone, normalizePhoneForDuffel } from "@/lib/checkout-saga/phone";

// Fase 2 §3/§4/§5/§27 — for any modality WITH a flight, every traveler
// must have firstName/lastName/title/gender/birthDate/email/phone before
// continuing; without a flight, only firstName/lastName are required.

function completeFlightTraveler(overrides: Partial<CheckoutAttemptTravelerInput> = {}): CheckoutAttemptTravelerInput {
  return { firstName: "Ada", lastName: "Lovelace", title: "mrs", gender: "f", birthDate: "1990-01-01", email: "ada@example.com", phone: "+34600000000", ...overrides };
}

describe("A — modality with flight, no title -> rejected", () => {
  it("refuses", () => {
    const result = validateCheckoutAttemptTravelers([completeFlightTraveler({ title: undefined })], { requiresFlightFields: true });
    expect(result.ok).toBe(false);
  });
});

describe("B — modality with flight, no gender -> rejected", () => {
  it("refuses", () => {
    const result = validateCheckoutAttemptTravelers([completeFlightTraveler({ gender: undefined })], { requiresFlightFields: true });
    expect(result.ok).toBe(false);
  });
});

describe("C — modality with flight, no birthDate -> rejected", () => {
  it("refuses", () => {
    const result = validateCheckoutAttemptTravelers([completeFlightTraveler({ birthDate: null })], { requiresFlightFields: true });
    expect(result.ok).toBe(false);
  });
});

describe("D — modality with flight, no traveler email -> rejected", () => {
  it("refuses", () => {
    const result = validateCheckoutAttemptTravelers([completeFlightTraveler({ email: undefined })], { requiresFlightFields: true });
    expect(result.ok).toBe(false);
  });

  it("also refuses a malformed email", () => {
    const result = validateCheckoutAttemptTravelers([completeFlightTraveler({ email: "not-an-email" })], { requiresFlightFields: true });
    expect(result.ok).toBe(false);
  });
});

describe("E — modality with flight, no phone -> rejected", () => {
  it("refuses a missing phone", () => {
    const result = validateCheckoutAttemptTravelers([completeFlightTraveler({ phone: undefined })], { requiresFlightFields: true });
    expect(result.ok).toBe(false);
  });

  it("refuses a phone that isn't a real E.164 shape even after stripping formatting", () => {
    const result = validateCheckoutAttemptTravelers([completeFlightTraveler({ phone: "abc-not-a-number" })], { requiresFlightFields: true });
    expect(result.ok).toBe(false);
  });

  it("accepts a phone with cosmetic formatting that DOES resolve to a valid E.164 number", () => {
    const result = validateCheckoutAttemptTravelers([completeFlightTraveler({ phone: "+34 600 000 000" })], { requiresFlightFields: true });
    expect(result.ok).toBe(true);
  });
});

describe("F — TICKET_ONLY/TICKET_HOTEL (no flight) never requires the Duffel-specific fields", () => {
  it("firstName/lastName alone is enough when requiresFlightFields is false", () => {
    const result = validateCheckoutAttemptTravelers([{ firstName: "Ada", lastName: "Lovelace" }], { requiresFlightFields: false });
    expect(result.ok).toBe(true);
  });
});

describe("§4 — no email uniqueness is enforced across travelers", () => {
  it("every traveler may share the same email as the lead traveler/buyer", () => {
    const shared = "buyer@example.com";
    const result = validateCheckoutAttemptTravelers([completeFlightTraveler({ email: shared }), completeFlightTraveler({ email: shared })], { requiresFlightFields: true });
    expect(result.ok).toBe(true);
  });
});

describe("§5 — phone normalization is not a fragile 'strip spaces only' hack", () => {
  it("normalizes cosmetic formatting into a strict E.164 number", () => {
    expect(normalizePhoneForDuffel("+34 600-000.000")).toBe("+34600000000");
  });

  it("rejects a value that, even after stripping formatting, isn't a valid E.164 shape (no leading +, wrong digit count, etc.)", () => {
    expect(normalizePhoneForDuffel("0034600000000")).toBeNull(); // no leading +
    expect(normalizePhoneForDuffel("+3460")).toBeNull(); // too short
    expect(isValidE164Phone("+346000000001234567")).toBe(false); // too long
  });
});

describe("firstName/lastName are always required, with or without flight", () => {
  it("rejects a missing firstName even for TICKET_ONLY", () => {
    const result = validateCheckoutAttemptTravelers([{ firstName: "", lastName: "Lovelace" }], { requiresFlightFields: false });
    expect(result.ok).toBe(false);
  });
});
