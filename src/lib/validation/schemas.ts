import { z } from "zod";

export const leadSchema = z.object({
  tripId: z.string().min(1),
  name: z.string().trim().min(2, "Indica tu nombre").max(120),
  email: z.string().trim().email("Email no válido"),
  city: z.string().trim().min(2, "Indica tu ciudad de salida").max(80),
  consent: z.literal(true, { message: "Necesitamos tu consentimiento para poder avisarte" }),
});
export type LeadInput = z.infer<typeof leadSchema>;

export const generalLeadSchema = z.object({
  email: z.string().trim().email("Email no válido"),
  consent: z.literal(true, { message: "Necesitamos tu consentimiento para poder avisarte" }),
});
export type GeneralLeadInput = z.infer<typeof generalLeadSchema>;

export const travelerRoomPreference = z.enum(["share_with_group", "share_same_sex", "single"]);

export const checkoutTravelerSchema = z.object({
  firstName: z.string().trim().min(1, "Nombre requerido").max(80),
  lastName: z.string().trim().min(1, "Apellidos requeridos").max(80),
  roomPreference: travelerRoomPreference,
});

export const checkoutSchema = z.object({
  tripId: z.string().min(1),
  originCity: z.string().trim().min(1, "Elige la ciudad de salida"),
  buyerFirstName: z.string().trim().min(1, "Nombre requerido").max(80),
  buyerLastName: z.string().trim().min(1, "Apellidos requeridos").max(80),
  buyerEmail: z.string().trim().email("Email no válido"),
  buyerPhone: z.string().trim().min(6, "Teléfono no válido").max(30),
  billingAddress: z.string().trim().max(200).optional().default(""),
  travelers: z.array(checkoutTravelerSchema).min(1).max(20),
  acceptedConditions: z.literal(true, { message: "Debes aceptar las condiciones" }),
  paymentMethod: z.enum(["card", "bizum", "klarna", "paypal"]),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

export const travelerDetailsSchema = z.object({
  travelerId: z.string().min(1),
  nationality: z.string().trim().max(80).optional().default(""),
  sex: z.string().trim().max(40).optional().default(""),
  docType: z.enum(["dni", "passport", ""]).optional().default(""),
  docNumber: z.string().trim().max(60).optional().default(""),
  docExpiry: z.string().optional().default(""),
  docCountry: z.string().trim().max(80).optional().default(""),
  phone: z.string().trim().max(30).optional().default(""),
  emergencyContact: z.string().trim().max(160).optional().default(""),
  address: z.string().trim().max(200).optional().default(""),
});
export type TravelerDetailsInput = z.infer<typeof travelerDetailsSchema>;

export const changeRequestSchema = z.object({
  bookingId: z.string().min(1),
  type: z.enum(["name_change", "important_change", "cancellation"]),
  description: z.string().trim().min(3).max(2000),
});
export type ChangeRequestInput = z.infer<typeof changeRequestSchema>;

export const miViajeLookupSchema = z.object({
  reference: z.string().trim().min(3),
  email: z.string().trim().email("Email no válido"),
});
