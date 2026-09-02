import { prisma } from "@/lib/db";
import { parseFinalQuoteSnapshot, type FinalQuoteSnapshot } from "./finalQuoteSnapshot";

export type ResumeCheckoutAttemptView = {
  checkoutAttemptId: string;
  packageType: string;
  finalQuoteSnapshot: FinalQuoteSnapshot;
  buyer: { firstName: string; lastName: string; email: string };
  travelers: { firstName: string; lastName: string }[];
  /** Fase 2.6 §3/§5 — persisted separately from FinalQuoteSnapshot, same treatment as buyer. */
  travelOriginCountry: string;
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
    travelOriginCountry: attempt.travelOriginCountry,
  };
}

export type PaymentResumeView = ResumeCheckoutAttemptView & { status: "ready_to_pay" | "payment_authorizing" | "payment_authorized" };

const PAYMENT_RESUMABLE_STATUSES = new Set(["ready_to_pay", "payment_authorizing", "payment_authorized"]);

/**
 * Fase 3A §17/§19 — a superset of getReadyToPayView() above: also
 * reconstructs the trip/quote/traveler context (needed to render the
 * page around the Payment Element) when the attempt has moved PAST
 * READY_TO_PAY into the payment saga itself (payment_authorizing —
 * still filling in card details or mid-3DS — or payment_authorized —
 * the dev-only post-authorization barrier screen, §19). Deliberately a
 * SEPARATE function from getReadyToPayView rather than broadening that
 * one's contract: getReadyToPayView's existing "only a genuine, current
 * READY_TO_PAY attempt" behavior is already relied upon elsewhere and
 * tested as such (see resume-checkout-attempt.test.ts) — this one adds
 * `status` to the returned view so the page/UI can branch, and is used
 * by the payment page path exclusively.
 */
export async function getPaymentResumeView(accessToken: string): Promise<PaymentResumeView | null> {
  if (!accessToken) return null;
  const attempt = await prisma.checkoutAttempt.findUnique({ where: { accessToken } });
  if (!attempt || !PAYMENT_RESUMABLE_STATUSES.has(attempt.status)) return null;
  const snapshot = parseFinalQuoteSnapshot(attempt.finalQuoteSnapshot);
  if (!snapshot) return null;
  const travelers = await prisma.checkoutAttemptTraveler.findMany({ where: { checkoutAttemptId: attempt.id }, orderBy: { order: "asc" } });
  return {
    checkoutAttemptId: attempt.id,
    packageType: attempt.packageType,
    finalQuoteSnapshot: snapshot,
    buyer: { firstName: attempt.buyerFirstName, lastName: attempt.buyerLastName, email: attempt.buyerEmail },
    travelers: travelers.map((t) => ({ firstName: t.firstName, lastName: t.lastName })),
    travelOriginCountry: attempt.travelOriginCountry,
    status: attempt.status as "ready_to_pay" | "payment_authorizing" | "payment_authorized",
  };
}
