import { prisma } from "@/lib/db";
import { recordCheckoutAttemptEvent, type Db } from "./events";

export type AcquireTicketHoldResult = { ok: true; hold: { id: string; status: string; quantity: number } } | { ok: false; reason: "insufficient_stock" };

/**
 * Atomic, race-safe acquisition of a TicketHold — see the architecture
 * report §5/§9 of this session's own record for the full reasoning; the
 * short version:
 *
 * This project runs on SQLite (see prisma/schema.prisma's datasource —
 * "provider = sqlite", DATABASE_URL=file:./dev.db). SQLite allows exactly
 * one writer at a time for the whole database file — there is no
 * per-row/per-table locking and no MVCC snapshot isolation for writers
 * the way Postgres has under READ COMMITTED. That single-writer property
 * is what this function actually relies on: the availability check and
 * the insert happen in ONE SQL statement (INSERT ... SELECT ... WHERE),
 * so there is no read-then-write gap in application code for a second
 * writer to interleave into — SQLite itself cannot let a second write
 * statement execute in the middle of this one's evaluation.
 *
 * IMPORTANT — this specific guarantee is SQLite-specific. The schema's
 * own header comment says it's written to be Postgres-compatible, and
 * this raw SQL is syntactically portable, but its ATOMICITY on Postgres
 * under default READ COMMITTED is NOT guaranteed the same way: two
 * concurrent Postgres transactions could each evaluate this statement's
 * WHERE-clause subqueries against their own snapshot (neither seeing the
 * other's still-uncommitted insert) and both succeed, oversubscribing
 * stock. If/when this project migrates to Postgres, this function must
 * be revisited — e.g. `SELECT ... FOR UPDATE` on the TicketOffer row (or
 * an advisory lock, or SERIALIZABLE isolation with retry) before the
 * availability check. Flagging this now rather than pretending SQLite's
 * guarantee travels for free.
 *
 * Idempotent by (checkoutAttemptId, ticketOfferId) — see the @@unique
 * constraint on TicketHold. A second call for the same pair returns the
 * existing hold rather than erroring or creating a duplicate.
 */
export async function acquireTicketHold(params: { checkoutAttemptId: string; ticketOfferId: string; quantity: number; expiresAt: Date }, db: Db = prisma): Promise<AcquireTicketHoldResult> {
  const { checkoutAttemptId, ticketOfferId, quantity, expiresAt } = params;

  const existing = await db.ticketHold.findUnique({ where: { checkoutAttemptId_ticketOfferId: { checkoutAttemptId, ticketOfferId } } });
  if (existing) {
    return { ok: true, hold: existing };
  }

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

  // affected === 0: either a concurrent call for this exact same pair
  // just won the race (re-check — idempotent, not a real conflict), or
  // stock genuinely isn't available.
  const raced = await db.ticketHold.findUnique({ where: { checkoutAttemptId_ticketOfferId: { checkoutAttemptId, ticketOfferId } } });
  if (raced) return { ok: true, hold: raced };
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
