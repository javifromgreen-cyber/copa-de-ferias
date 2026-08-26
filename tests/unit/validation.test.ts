import { describe, it, expect } from "vitest";
import { leadSchema, checkoutSchema } from "@/lib/validation/schemas";

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
    originCity: "Barcelona",
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
