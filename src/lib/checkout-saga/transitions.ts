import type { CheckoutAttemptStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recordCheckoutAttemptEvent, type Db } from "./events";

/**
 * The single allowed-transition table for CheckoutAttempt.status — no
 * other code in this codebase should ever write `status: "..."` on a
 * CheckoutAttempt directly; every write goes through
 * transitionCheckoutAttempt() below, which validates against this table
 * first. Terminal states (confirmed/failed/cancelled) have no outgoing
 * entries at all.
 *
 * recovery_required intentionally DOES have valid outgoing edges
 * (confirmed/failed/cancelled) — per design, it is "automation-terminal,
 * human-resolvable": no code in this phase calls
 * transitionCheckoutAttempt() to leave recovery_required automatically
 * (there is no Admin recovery panel yet), but the graph itself doesn't
 * forbid a future human-triggered resolution from using this same table.
 */
const ALLOWED_TRANSITIONS: Record<CheckoutAttemptStatus, CheckoutAttemptStatus[]> = {
  draft: ["revalidating", "cancelled"],
  revalidating: ["ready_to_pay", "failed", "cancelled"],
  ready_to_pay: ["payment_authorizing", "revalidating", "cancelled"],
  payment_authorizing: ["payment_authorized", "failed"],
  payment_authorized: ["fulfilling"],
  fulfilling: ["payment_capturing", "compensating"],
  payment_capturing: ["finalizing", "recovery_required"],
  finalizing: ["confirmed", "recovery_required"],
  compensating: ["failed", "recovery_required"],
  recovery_required: ["confirmed", "failed", "cancelled"],
  confirmed: [],
  failed: [],
  cancelled: [],
};

export class CheckoutSagaTransitionError extends Error {
  constructor(
    readonly from: CheckoutAttemptStatus,
    readonly to: CheckoutAttemptStatus,
  ) {
    super(`Invalid CheckoutAttempt transition: ${from} -> ${to}`);
    this.name = "CheckoutSagaTransitionError";
  }
}

export function isValidGlobalTransition(from: CheckoutAttemptStatus, to: CheckoutAttemptStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertGlobalTransition(from: CheckoutAttemptStatus, to: CheckoutAttemptStatus): void {
  if (!isValidGlobalTransition(from, to)) {
    throw new CheckoutSagaTransitionError(from, to);
  }
}

/**
 * The ONLY function in this codebase that should ever write
 * CheckoutAttempt.status. Reads the current status, validates the
 * requested transition against ALLOWED_TRANSITIONS, and — only if
 * valid — writes the new status and records a `state_changed` event in
 * the same transaction. Throws CheckoutSagaTransitionError (never writes
 * anything) on an invalid transition.
 *
 * Accepts an optional Prisma transaction client so callers already
 * inside a $transaction (e.g. finalize.ts) can compose this without
 * nesting transactions.
 */
export async function transitionCheckoutAttempt(checkoutAttemptId: string, to: CheckoutAttemptStatus, db: Db = prisma) {
  const current = await db.checkoutAttempt.findUniqueOrThrow({ where: { id: checkoutAttemptId }, select: { status: true } });
  assertGlobalTransition(current.status, to);

  const updated = await db.checkoutAttempt.update({ where: { id: checkoutAttemptId }, data: { status: to } });
  await recordCheckoutAttemptEvent(checkoutAttemptId, "state_changed", { sanitizedDetail: JSON.stringify({ from: current.status, to }) }, db);
  return updated;
}
