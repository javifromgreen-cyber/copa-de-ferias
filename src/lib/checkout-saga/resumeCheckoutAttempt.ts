import { prisma } from "@/lib/db";
import { parseFinalQuoteSnapshot, type FinalQuoteSnapshot } from "./finalQuoteSnapshot";

export type ResumeCheckoutAttemptView = {
  checkoutAttemptId: string;
  packageType: string;
  finalQuoteSnapshot: FinalQuoteSnapshot;
  buyer: { firstName: string; lastName: string; email: string };
  travelers: { firstName: string; lastName: string }[];
};

/**
 * Fase 2.5 §22 — reconstructs the READY_TO_PAY screen after a browser
 * refresh from persisted server-side state only (CheckoutAttempt +
 * CheckoutAttemptTraveler), looked up by the opaque, unguessable
 * accessToken generated at createCheckoutAttempt — never the raw cuid id,
 * mirroring the established Booking.accessToken "public reference vs
 * secret token" convention. Returns null for anything that isn't a
 * genuine, still-current READY_TO_PAY attempt — never partially
 * reconstructs a DRAFT/REVALIDATING/FAILED/CONFIRMED attempt, and never
 * falls back to any client-supplied state.
 */
export async function getReadyToPayView(accessToken: string): Promise<ResumeCheckoutAttemptView | null> {
  if (!accessToken) return null;
  const attempt = await prisma.checkoutAttempt.findUnique({ where: { accessToken } });
  if (!attempt || attempt.status !== "ready_to_pay") return null;
  const snapshot = parseFinalQuoteSnapshot(attempt.finalQuoteSnapshot);
  if (!snapshot) return null;
  const travelers = await prisma.checkoutAttemptTraveler.findMany({ where: { checkoutAttemptId: attempt.id }, orderBy: { order: "asc" } });
  return {
    checkoutAttemptId: attempt.id,
    packageType: attempt.packageType,
    finalQuoteSnapshot: snapshot,
    buyer: { firstName: attempt.buyerFirstName, lastName: attempt.buyerLastName, email: attempt.buyerEmail },
    travelers: travelers.map((t) => ({ firstName: t.firstName, lastName: t.lastName })),
  };
}
