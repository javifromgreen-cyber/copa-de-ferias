import { z } from "zod";
import { prisma } from "@/lib/db";
import type { Db } from "./events";

/**
 * Fase 2.5 §5/§6 — the buyer's own persisted identity, mirroring
 * CheckoutAttemptTraveler's role for travelers: collected and validated
 * once, in REVALIDATING, before any Booking exists, so
 * finalizeConfirmedCheckoutAttempt() never needs a caller to re-supply it.
 * Deliberately NOT part of FinalQuoteSnapshot (§5: "no metas buyer dentro
 * de FinalQuoteSnapshot") — that stays commercial/operational data only.
 */
export type CheckoutAttemptBuyerInput = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  originCity?: string;
  billingAddress?: string;
};

export type BuyerValidationResult = { ok: true } | { ok: false; errors: string[] };

const emailShape = z.string().trim().email();

export function validateCheckoutAttemptBuyer(buyer: CheckoutAttemptBuyerInput): BuyerValidationResult {
  const errors: string[] = [];
  if (!buyer.firstName?.trim()) errors.push("El nombre del comprador es obligatorio.");
  if (!buyer.lastName?.trim()) errors.push("Los apellidos del comprador son obligatorios.");
  if (!buyer.email || !emailShape.safeParse(buyer.email).success) errors.push("El email del comprador es obligatorio y debe ser válido.");
  if (!buyer.phone?.trim()) errors.push("El teléfono del comprador es obligatorio.");
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

export async function persistCheckoutAttemptBuyer(checkoutAttemptId: string, buyer: CheckoutAttemptBuyerInput, db: Db = prisma) {
  await db.checkoutAttempt.update({
    where: { id: checkoutAttemptId },
    data: {
      buyerFirstName: buyer.firstName,
      buyerLastName: buyer.lastName,
      buyerEmail: buyer.email,
      buyerPhone: buyer.phone,
      buyerOriginCity: buyer.originCity ?? "",
      buyerBillingAddress: buyer.billingAddress ?? "",
    },
  });
}
