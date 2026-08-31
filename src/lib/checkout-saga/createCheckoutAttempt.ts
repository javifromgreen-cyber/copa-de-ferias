import type { PackageType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recordCheckoutAttemptEvent, type Db } from "./events";

/**
 * Creates a new CheckoutAttempt in DRAFT — the raw entry point of the
 * saga. Deliberately minimal: no revalidation, no TicketHold, no
 * snapshot — those are separate steps (ticketHold.ts,
 * finalQuoteSnapshot.ts) a future orchestrator composes on top of this.
 */
export async function createCheckoutAttempt(params: { tripId: string; packageType: PackageType; partySize: number }, db: Db = prisma) {
  const attempt = await db.checkoutAttempt.create({
    data: { tripId: params.tripId, packageType: params.packageType, partySize: params.partySize },
  });
  await recordCheckoutAttemptEvent(attempt.id, "checkout_created", {}, db);
  return attempt;
}
