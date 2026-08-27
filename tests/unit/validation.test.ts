import { describe, it, expect } from "vitest";
import { leadSchema, checkoutSchema, checkoutTravelerSchema } from "@/lib/validation/schemas";
import { TRAVELER_FIELD_KEYS, TRAVELER_FIELD_GROUPS, parseRequiredFields } from "@/lib/checkout/travelerFields";

describe("leadSchema", () => {
  it("requires explicit consent before saving a lead", () => {
    const result = leadSchema.safeParse({
      tripId: "trip_1",
      name: "Ana",
      email: "ana@example.com",
      city: "Barcelona",
      consent: false,
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid notify/waitlist lead", () => {
    const result = leadSchema.safeParse({
      tripId: "trip_1",
      name: "Ana",
      email: "ana@example.com",
      city: "Barcelona",
      consent: true,
    });
    expect(result.success).toBe(true);
  });
});

describe("checkoutSchema", () => {
  const base = {
    tripId: "trip_1",
    buyerFirstName: "Ana",
    buyerLastName: "García",
    buyerEmail: "ana@example.com",
    buyerPhone: "600000000",
    travelers: [{ firstName: "Ana", lastName: "García", roomPreference: "share_with_group" as const }],
    paymentMethod: "card" as const,
  };

  it("rejects checkout without accepting conditions", () => {
    const result = checkoutSchema.safeParse({ ...base, acceptedConditions: false });
    expect(result.success).toBe(false);
  });

  it("accepts checkout once conditions are accepted", () => {
    const result = checkoutSchema.safeParse({ ...base, acceptedConditions: true });
    expect(result.success).toBe(true);
  });
});

describe("checkoutTravelerSchema", () => {
  it("accepts the full set of checkout-time fields, including emergency contact", () => {
    const result = checkoutTravelerSchema.safeParse({
      firstName: "Ana",
      lastName: "García",
      originCity: "Barcelona",
      birthDate: "1990-01-01",
      nationality: "Española",
      docType: "dni",
      docNumber: "12345678A",
      docExpiry: "2030-01-01",
      docCountry: "España",
      sex: "",
      phone: "600000000",
      emergencyContactName: "Pedro García",
      emergencyContactPhone: "600111222",
      roomPreference: "share_with_group",
      roomPartnerName: "",
    });
    expect(result.success).toBe(true);
  });

  it("still works with only name+room, everything else optional at the schema level", () => {
    const result = checkoutTravelerSchema.safeParse({
      firstName: "Ana",
      lastName: "García",
      roomPreference: "single",
    });
    expect(result.success).toBe(true);
  });
});

describe("travelerFields config", () => {
  it("lists phone and emergencyContact as configurable required fields", () => {
    expect(TRAVELER_FIELD_KEYS).toContain("phone");
    expect(TRAVELER_FIELD_KEYS).toContain("emergencyContact");
  });

  it("groups contact fields separately from personal/documentación", () => {
    expect(TRAVELER_FIELD_GROUPS.phone).toBe("contacto");
    expect(TRAVELER_FIELD_GROUPS.emergencyContact).toBe("contacto");
    expect(TRAVELER_FIELD_GROUPS.nationality).toBe("personal");
    expect(TRAVELER_FIELD_GROUPS.docNumber).toBe("documentacion");
  });

  it("parseRequiredFields ignores unknown keys", () => {
    expect(parseRequiredFields("nationality,made_up_key,phone")).toEqual(["nationality", "phone"]);
  });
});
