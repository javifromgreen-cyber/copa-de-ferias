"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

export type TicketOfferFormInput = {
  id?: string;
  eventId: string;
  provider: string;
  category: string;
  sector: string;
  costNet: number;
  currency: string;
  stock: number;
  maxQuantity: number | null;
  active: boolean;
  seatingTogetherGuaranteed: boolean;
  deliveryType: string;
  deliveryNotes: string;
  restrictions: string;
  internalNotes: string;
  validUntil: string; // yyyy-mm-dd or ""
};

export async function saveTicketOffer(input: TicketOfferFormInput): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!input.eventId) return { ok: false, error: "Falta el evento" };
  if (!input.category.trim()) return { ok: false, error: "Falta la categoría de la entrada" };
  if (input.costNet < 0) return { ok: false, error: "El precio coste no puede ser negativo" };
  if (input.stock < 0) return { ok: false, error: "La disponibilidad no puede ser negativa" };
  if (input.maxQuantity !== null && input.maxQuantity < 1) return { ok: false, error: "La cantidad máxima debe ser al menos 1" };

  const data = {
    eventId: input.eventId,
    provider: input.provider.trim() || "manual",
    category: input.category.trim(),
    sector: input.sector.trim(),
    costNet: input.costNet,
    currency: input.currency.trim() || "EUR",
    stock: input.stock,
    maxQuantity: input.maxQuantity,
    active: input.active,
    seatingTogetherGuaranteed: input.seatingTogetherGuaranteed,
    deliveryType: input.deliveryType.trim(),
    deliveryNotes: input.deliveryNotes.trim(),
    restrictions: input.restrictions.trim(),
    internalNotes: input.internalNotes.trim(),
    validUntil: input.validUntil ? new Date(input.validUntil) : null,
    lastCheckedAt: new Date(),
  };

  const offer = input.id
    ? await prisma.ticketOffer.update({ where: { id: input.id }, data })
    : await prisma.ticketOffer.create({ data });

  revalidatePath("/admin/eventos");
  return { ok: true, id: offer.id };
}

export async function deleteTicketOffer(id: string) {
  await prisma.ticketOffer.delete({ where: { id } });
  revalidatePath("/admin/eventos");
}
