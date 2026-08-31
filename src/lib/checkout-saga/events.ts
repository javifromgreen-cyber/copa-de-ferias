import type { Prisma, CheckoutAttemptEventType } from "@prisma/client";
import { prisma } from "@/lib/db";

/** Any Prisma client shape this module needs — the real singleton or a $transaction callback's `tx`, interchangeably. */
export type Db = Prisma.TransactionClient;

/**
 * Append-only — this is NOT event sourcing. CheckoutAttempt's own columns
 * remain the live state; this log exists purely for auditoría/recovery/
 * debugging (§26 of the architecture report). `sanitizedDetail` must
 * never carry a raw provider payload, a secret, or traveler PII — small
 * JSON only, and the caller is responsible for keeping it that way (this
 * function does not attempt to sanitize automatically).
 */
export async function recordCheckoutAttemptEvent(
  checkoutAttemptId: string,
  type: CheckoutAttemptEventType,
  opts: { providerReference?: string; sanitizedDetail?: string } = {},
  db: Db = prisma,
) {
  return db.checkoutAttemptEvent.create({
    data: {
      checkoutAttemptId,
      type,
      providerReference: opts.providerReference ?? "",
      sanitizedDetail: opts.sanitizedDetail ?? "",
    },
  });
}
