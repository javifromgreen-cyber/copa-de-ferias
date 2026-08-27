import { prisma } from "@/lib/db";
import type { TicketProvider, NormalizedTicketOffer } from "../types";

/**
 * P1 ticket inventory: no live ticketing API in V1. Admin enters/updates
 * stock and cost by hand per Event (TicketOffer table); this provider just
 * reads it back in the normalized shape the pricing/checkout engine expects.
 */
export class P1ManualTicketProvider implements TicketProvider {
  readonly kind = "manual";

  async getOffers(eventId: string): Promise<NormalizedTicketOffer[]> {
    const rows = await prisma.ticketOffer.findMany({ where: { eventId, stock: { gt: 0 } } });
    return rows.map((row) => ({
      id: row.id,
      eventId: row.eventId,
      provider: row.provider,
      category: row.category,
      sector: row.sector,
      costNet: row.costNet,
      stock: row.stock,
      seatingTogetherGuaranteed: row.seatingTogetherGuaranteed,
      deliveryType: row.deliveryType,
      deliveryNotes: row.deliveryNotes,
      validUntil: row.validUntil,
    }));
  }
}
