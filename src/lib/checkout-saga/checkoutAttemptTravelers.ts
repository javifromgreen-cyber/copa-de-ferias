import { prisma } from "@/lib/db";
import type { Db } from "./events";
import type { CheckoutAttemptTravelerInput } from "./travelerValidation";
import { normalizeTravelerPhone } from "./travelerValidation";

/**
 * Fase 2 §6 — persists the travelers collected before payment, belonging
 * to the CheckoutAttempt itself (never a Booking, which must not exist
 * before CONFIRMED — see finalize.ts). Call only AFTER
 * validateCheckoutAttemptTravelers has confirmed the input is valid for
 * this modality; this function does not re-validate, it only normalizes
 * (phone -> E.164) and writes.
 */
export async function persistCheckoutAttemptTravelers(checkoutAttemptId: string, travelers: CheckoutAttemptTravelerInput[], db: Db = prisma) {
  await db.checkoutAttemptTraveler.createMany({
    data: travelers.map((t, index) => ({
      checkoutAttemptId,
      order: index,
      firstName: t.firstName,
      lastName: t.lastName,
      birthDate: t.birthDate ? new Date(t.birthDate) : null,
      title: t.title ?? "",
      gender: t.gender ?? "",
      email: t.email ?? "",
      phone: t.phone ? normalizeTravelerPhone(t.phone) : "",
      nationality: t.nationality ?? "",
      docType: t.docType ?? "",
      docNumber: t.docNumber ?? "",
      docExpiry: t.docExpiry ? new Date(t.docExpiry) : null,
      docCountry: t.docCountry ?? "",
      emergencyContactName: t.emergencyContactName ?? "",
      emergencyContactPhone: t.emergencyContactPhone ?? "",
      originAirport: t.originAirport ?? "",
    })),
  });
}
