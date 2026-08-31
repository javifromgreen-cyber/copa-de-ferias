import type { PackageType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { generateAccessToken } from "@/lib/utils";
import { recordCheckoutAttemptEvent, type Db } from "./events";

/**
 * Creates a new CheckoutAttempt in DRAFT — the raw entry point of the
 * saga. Deliberately minimal: no revalidation, no TicketHold, no
 * snapshot — those are separate steps (ticketHold.ts,
 * finalQuoteSnapshot.ts) a future orchestrator composes on top of this.
 *
 * Fase 2.5 §22 — always generates its own `accessToken` (same
 * generateAccessToken() helper Booking already uses), the opaque,
 * unguessable lookup the /reservar-real flow uses to reconstruct
 * READY_TO_PAY after a refresh — never the raw id, matching the
 * established "public reference vs. secret token" split (see
 * Booking.accessToken / Mi Viaje). Generated unconditionally, for every
 * attempt, not just ones that reach READY_TO_PAY — simpler than
 * special-casing it later, and an unused token on a failed attempt costs
 * nothing.
 */
export async function createCheckoutAttempt(params: { tripId: string; packageType: PackageType; partySize: number }, db: Db = prisma) {
  const attempt = await db.checkoutAttempt.create({
    data: { tripId: params.tripId, packageType: params.packageType, partySize: params.partySize, accessToken: generateAccessToken() },
  });
  await recordCheckoutAttemptEvent(attempt.id, "checkout_created", {}, db);
  return attempt;
}
