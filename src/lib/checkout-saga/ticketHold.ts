import { prisma } from "@/lib/db";
import { recordCheckoutAttemptEvent, type Db } from "./events";

export type AcquireTicketHoldResult = { ok: true; hold: { id: string; status: string; quantity: number } } | { ok: false; reason: "insufficient_stock" };

/**
 * Atomic, race-safe acquisition of a TicketHold on PostgreSQL.
 *
 * Strategy: `SELECT "id" FROM "TicketOffer" WHERE "id" = ... FOR UPDATE`
 * takes an exclusive row lock on the specific TicketOffer being held
 * against, inside a transaction. A second, concurrent call for the SAME
 * ticketOfferId blocks on that lock — Postgres itself serializes the two
 * transactions, there is no read-then-write gap in application code for
 * a second writer to interleave into. The second transaction only
 * proceeds past the lock once the first commits (or rolls back), at
 * which point its own availability check re-reads the now-committed
 * state — so if the first transaction consumed the last unit of stock,
 * the second correctly sees zero available and returns
 * `insufficient_stock`, never oversubscribing. Different ticketOfferIds
 * never contend with each other (each locks only its own row).
 *
 * Deliberately NOT using a `heldQuantity` counter column (would add a
 * new invariant to keep correct across create/release/expire/confirm),
 * SERIALIZABLE+retry (no schema change needed either way, but adds
 * retry-loop control flow this doesn't need), or an advisory lock
 * (there's already a natural row to lock) — `FOR UPDATE` on the
 * contended row is the minimal mechanism that satisfies "if 1 ticket
 * remains and two concurrent checkouts race, exactly one gets HELD".
 *
 * Idempotent by (checkoutAttemptId, ticketOfferId) — see the @@unique
 * constraint on TicketHold. A second, SEQUENTIAL call for the same pair
 * (checked before taking the lock — this is a single-caller idempotency
 * guard, not the concurrency mechanism above) returns the existing hold
 * rather than erroring or creating a duplicate. Not covered: two
 * genuinely CONCURRENT calls for the exact same pair (the same
 * checkoutAttemptId calling this twice at once) — nothing in this
 * codebase's saga does that today (one attempt only ever runs this step
 * once, synchronously), so it's left as a known, narrow gap rather than
 * adding unverified error-code parsing for a scenario that can't
 * currently occur.
 *
 * Runs in its own transaction when called with the default `db = prisma`
 * (needed so the row lock and the subsequent insert share one
 * connection/transaction — a lock taken by one statement and released at
 * the end of that same statement would protect nothing). When called
 * with an already-open transaction client, composes into that
 * transaction directly instead of nesting — same convention as
 * transitionCheckoutAttempt (transitions.ts).
 */
export async function acquireTicketHold(params: { checkoutAttemptId: string; ticketOfferId: string; quantity: number; expiresAt: Date }, db: Db = prisma): Promise<AcquireTicketHoldResult> {
  if (db === prisma) {
    return prisma.$transaction((tx) => acquireTicketHoldSteps(params, tx));
  }
  return acquireTicketHoldSteps(params, db);
}

async function acquireTicketHoldSteps(params: { checkoutAttemptId: string; ticketOfferId: string; quantity: number; expiresAt: Date }, db: Db): Promise<AcquireTicketHoldResult> {
  const { checkoutAttemptId, ticketOfferId, quantity, expiresAt } = params;

  const existing = await db.ticketHold.findUnique({ where: { checkoutAttemptId_ticketOfferId: { checkoutAttemptId, ticketOfferId } } });
  if (existing) {
    return { ok: true, hold: existing };
  }

  // Locks this TicketOffer row for the rest of this transaction — a
  // concurrent call for the same ticketOfferId blocks here until this
  // transaction commits or rolls back.
  await db.$executeRaw`SELECT "id" FROM "TicketOffer" WHERE "id" = ${ticketOfferId} FOR UPDATE`;

  const id = crypto.randomUUID();
  const now = new Date();

  const affected = await db.$executeRaw`
    INSERT INTO "TicketHold" ("id", "checkoutAttemptId", "ticketOfferId", "quantity", "status", "expiresAt", "createdAt", "updatedAt")
    SELECT ${id}, ${checkoutAttemptId}, ${ticketOfferId}, ${quantity}, 'held', ${expiresAt}, ${now}, ${now}
    WHERE (
      (SELECT "stock" FROM "TicketOffer" WHERE "id" = ${ticketOfferId})
      - COALESCE((SELECT SUM("quantity") FROM "TicketHold" WHERE "ticketOfferId" = ${ticketOfferId} AND "status" = 'held' AND ("expiresAt" IS NULL OR "expiresAt" > ${now})), 0)
      - COALESCE((SELECT SUM("quantity") FROM "TicketHold" WHERE "ticketOfferId" = ${ticketOfferId} AND "status" = 'confirmed'), 0)
    ) >= ${quantity}
  `;

  if (affected === 1) {
    const hold = await db.ticketHold.findUniqueOrThrow({ where: { id } });
    await recordCheckoutAttemptEvent(checkoutAttemptId, "ticket_hold_created", { providerReference: ticketOfferId, sanitizedDetail: JSON.stringify({ quantity }) }, db);
    return { ok: true, hold };
  }

  // affected === 0: stock genuinely isn't available (already confirmed
  // by the FOR UPDATE lock above that this is evaluated against the
  // fully up-to-date, committed state — never a race).
  return { ok: false, reason: "insufficient_stock" };
}

/** Only ever moves a HELD hold to RELEASED — a CONFIRMED hold is never touched by this. Safe to call more than once. */
export async function releaseTicketHold(id: string, db: Db = prisma): Promise<void> {
  const result = await db.ticketHold.updateMany({ where: { id, status: "held" }, data: { status: "released" } });
  if (result.count > 0) {
    const hold = await db.ticketHold.findUniqueOrThrow({ where: { id } });
    await recordCheckoutAttemptEvent(hold.checkoutAttemptId, "ticket_hold_released", { providerReference: hold.ticketOfferId }, db);
  }
}

/** Only ever moves a HELD hold to CONFIRMED — used exclusively by finalize.ts, inside its own transaction. Safe to call more than once (idempotent no-op if already confirmed). */
export async function confirmTicketHold(id: string, db: Db = prisma): Promise<void> {
  const result = await db.ticketHold.updateMany({ where: { id, status: "held" }, data: { status: "confirmed" } });
  if (result.count > 0) {
    const hold = await db.ticketHold.findUniqueOrThrow({ where: { id } });
    await recordCheckoutAttemptEvent(hold.checkoutAttemptId, "ticket_hold_confirmed", { providerReference: hold.ticketOfferId }, db);
  }
}

/**
 * Fase 1.5 §1 — releases every currently-HELD TicketHold belonging to one
 * CheckoutAttempt. This is the local, purely-reversible side of reaching a
 * terminal failure state: it never talks to an external provider (there is
 * nothing to compensate here, only our own stock reservation), so it is
 * safe to run regardless of which path led to the terminal state — see
 * transitionCheckoutAttempt() in transitions.ts, the single call site,
 * which invokes this after writing status ONLY when the new status is
 * `failed` or `cancelled`. Idempotent: reuses releaseTicketHold's
 * `updateMany({ where: { status: "held" } })` guard, so holds already
 * released/confirmed/expired are silently skipped and a second call finds
 * nothing left to do.
 */
export async function releaseHeldTicketHoldsForAttempt(checkoutAttemptId: string, db: Db = prisma): Promise<number> {
  const held = await db.ticketHold.findMany({ where: { checkoutAttemptId, status: "held" }, select: { id: true } });
  for (const hold of held) {
    await releaseTicketHold(hold.id, db);
  }
  return held.length;
}

/**
 * §11 — only releases holds whose CheckoutAttempt is in a state where an
 * unattended expiration is actually safe. From payment_authorizing
 * onward (through fulfilling/payment_capturing/finalizing) the hold
 * belongs to an active saga and must NEVER be released just because time
 * passed — only an explicit saga outcome (payment/fulfillment failure,
 * completed compensation, or a human resolution out of
 * recovery_required) may release it there. recovery_required is
 * deliberately excluded too, even though nothing is actively "in
 * flight" — it may still need the entry for a human resolution.
 *
 * No cron/worker is wired up in this phase — this is a plain,
 * synchronously-callable function so it stays testable; a scheduled
 * caller is future infrastructure work.
 */
const EXPIRABLE_ATTEMPT_STATUSES = ["draft", "revalidating", "ready_to_pay"] as const;

export async function releaseExpiredTicketHolds(now: Date = new Date(), db: Db = prisma): Promise<number> {
  const expired = await db.ticketHold.findMany({
    where: {
      status: "held",
      expiresAt: { not: null, lte: now },
      checkoutAttempt: { status: { in: [...EXPIRABLE_ATTEMPT_STATUSES] } },
    },
    select: { id: true, checkoutAttemptId: true, ticketOfferId: true },
  });

  for (const hold of expired) {
    const result = await db.ticketHold.updateMany({ where: { id: hold.id, status: "held" }, data: { status: "expired" } });
    if (result.count > 0) {
      await recordCheckoutAttemptEvent(hold.checkoutAttemptId, "ticket_hold_expired", { providerReference: hold.ticketOfferId }, db);
    }
  }

  return expired.length;
}
