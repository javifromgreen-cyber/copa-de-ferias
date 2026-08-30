import { describe, it, expect } from "vitest";
import { adminTravelerEditSchema, bookingDocumentSchema, bookingUpdateSchema, bookingActionSchema } from "@/lib/validation/schemas";
import { eventHasBookings } from "@/lib/events/bookingRefs";
import { bookingStatusLabel } from "@/lib/mi-viaje/statusLabels";

describe("adminTravelerEditSchema", () => {
  it("accepts a full correction, including name/document fields the customer-facing schema never allows", () => {
    const result = adminTravelerEditSchema.safeParse({
      travelerId: "trav_1",
      firstName: "Ana",
      lastName: "García",
      birthDate: "1990-01-01",
      originCity: "Madrid",
      nationality: "Española",
      sex: "",
      docType: "dni",
      docNumber: "12345678A",
      docExpiry: "2030-01-01",
      docCountry: "España",
      phone: "600000000",
      emergencyContactName: "Pedro",
      emergencyContactPhone: "600111222",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a blank name", () => {
    const result = adminTravelerEditSchema.safeParse({ travelerId: "trav_1", firstName: "", lastName: "García" });
    expect(result.success).toBe(false);
  });
});

describe("bookingDocumentSchema", () => {
  it("defaults status to pending and never fabricates a fileUrl", () => {
    const result = bookingDocumentSchema.parse({ bookingId: "b_1", type: "hotel" });
    expect(result.status).toBe("pending");
    expect(result.fileUrl).toBe("");
  });

  it("rejects an unknown document type", () => {
    const result = bookingDocumentSchema.safeParse({ bookingId: "b_1", type: "boarding_pass" });
    expect(result.success).toBe(false);
  });
});

describe("bookingUpdateSchema", () => {
  it("requires a title", () => {
    expect(bookingUpdateSchema.safeParse({ bookingId: "b_1", title: "" }).success).toBe(false);
  });

  it("accepts a title with no message", () => {
    const result = bookingUpdateSchema.parse({ bookingId: "b_1", title: "Vuelo confirmado" });
    expect(result.message).toBe("");
  });
});

describe("bookingActionSchema", () => {
  it("requires a real BookingActionType, never an invented one", () => {
    expect(bookingActionSchema.safeParse({ bookingId: "b_1", type: "refund", title: "x" }).success).toBe(false);
  });

  it("accepts a minimal hotel_checkin action", () => {
    const result = bookingActionSchema.parse({ bookingId: "b_1", type: "hotel_checkin", title: "Completa el check-in" });
    expect(result.dueAt).toBe("");
  });
});

describe("eventHasBookings", () => {
  it("finds a real ticket selection for the given event id", () => {
    const bookings = [{ priceBreakdownSnapshot: JSON.stringify({ perPerson: 100, total: 200, ticketSelections: { evt_1: "General" } }) }];
    expect(eventHasBookings("evt_1", bookings)).toBe(true);
  });

  it("returns false when no booking references this event", () => {
    const bookings = [{ priceBreakdownSnapshot: JSON.stringify({ perPerson: 100, total: 200, ticketSelections: { evt_2: "General" } }) }];
    expect(eventHasBookings("evt_1", bookings)).toBe(false);
  });

  it("is defensive against an empty/unparsable snapshot", () => {
    expect(eventHasBookings("evt_1", [{ priceBreakdownSnapshot: "" }])).toBe(false);
    expect(eventHasBookings("evt_1", [{ priceBreakdownSnapshot: "not json" }])).toBe(false);
  });
});

describe("bookingStatusLabel reused by Admin (§24: no second status vocabulary)", () => {
  it("maps every real BookingStatus value to Spanish copy", () => {
    expect(bookingStatusLabel("pending_payment")).toBe("Pendiente de pago");
    expect(bookingStatusLabel("confirmed")).toBe("Confirmada");
    expect(bookingStatusLabel("cancelled")).toBe("Cancelada");
  });
});
