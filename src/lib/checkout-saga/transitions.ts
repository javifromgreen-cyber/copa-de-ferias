import type { CheckoutAttemptStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recordCheckoutAttemptEvent, type Db } from "./events";
import { releaseHeldTicketHoldsForAttempt } from "./ticketHold";

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
  // Fase 3A §14 — recovery_required is reachable directly from
  // payment_authorizing (not just from later saga steps): when Stripe's
  // own authorization result cannot be verified at all (network/API
  // failure while checking, not merely "still in progress"), this
  // attempt must not be silently released (a hold could still exist at
  // Stripe's own bank rail) nor silently marked authorized. It parks
  // here for the same human-resolvable escape hatch recovery_required
  // already exists for elsewhere in this table — see its own doc
  // comment above.
  payment_authorizing: ["payment_authorized", "failed", "recovery_required"],
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
 * nesting transactions — see the `db === prisma` branch below.
 *
 * Fase 1.5 §1 — reaching either terminal failure state also releases any
 * TicketHold still HELD for this attempt (releaseHeldTicketHoldsForAttempt,
 * see ticketHold.ts). This lives HERE, tied to the terminal status itself
 * rather than duplicated at every call site that transitions to
 * failed/cancelled, precisely so no future caller can reach FAILED or
 * CANCELLED through this function without the release happening — no path
 * through the state machine can leave a stock reservation orphaned. It is
 * safe from every inbound edge (revalidating/payment_authorizing/
 * compensating/recovery_required -> failed; draft/revalidating/
 * ready_to_pay/recovery_required -> cancelled) because releasing a
 * TicketHold is a purely local, reversible action — it never touches an
 * external provider, so it needs no compensation logic of its own and
 * cannot conflict with whatever compensation already happened upstream
 * (e.g. via the `compensating` state) on the way to FAILED. RECOVERY_REQUIRED
 * and COMPENSATING are deliberately NOT included here — a hold reaching
 * this function while the attempt lands in either of those still-active
 * states must stay HELD (see EXPIRABLE_ATTEMPT_STATUSES's own doc comment).
 *
 * Fase 1.6 §1 — everything below (the status read+write, the state_changed
 * event, and — for a terminal transition — the hold release plus its own
 * ticket_hold_released events) now runs atomically. When this function is
 * called at the top level (the default `db = prisma`, i.e. the caller has
 * NOT already opened a transaction), the whole sequence is wrapped in ONE
 * `prisma.$transaction`: a crash or thrown error anywhere in the middle —
 * e.g. right after the status write but before the hold release runs —
 * rolls back EVERYTHING, leaving CheckoutAttempt at its PREVIOUS status and
 * every TicketHold at its previous status, safely retryable. There is no
 * window where CheckoutAttempt=FAILED can be observed with a TicketHold
 * still HELD. When called with an explicit `db` that is already a
 * transaction client (`db !== prisma`, e.g. finalize.ts's own
 * `transitionCheckoutAttempt(id, "confirmed", tx)`), this function does
 * NOT open a nested transaction — Prisma doesn't support nesting
 * `$transaction` calls — it simply runs the same sequence directly against
 * the caller's `tx`, which is already atomic as part of whatever larger
 * transaction the caller is composing. No external call (provider API,
 * email, etc.) is ever made from within this transaction — see
 * releaseHeldTicketHoldsForAttempt/releaseTicketHold's own doc comments:
 * releasing a hold is purely local.
 */
export async function transitionCheckoutAttempt(checkoutAttemptId: string, to: CheckoutAttemptStatus, db: Db = prisma) {
  if (db === prisma) {
    return prisma.$transaction((tx) => transitionCheckoutAttemptSteps(checkoutAttemptId, to, tx));
  }
  return transitionCheckoutAttemptSteps(checkoutAttemptId, to, db);
}

async function transitionCheckoutAttemptSteps(checkoutAttemptId: string, to: CheckoutAttemptStatus, db: Db) {
  const current = await db.checkoutAttempt.findUniqueOrThrow({ where: { id: checkoutAttemptId }, select: { status: true } });
  assertGlobalTransition(current.status, to);

  const updated = await db.checkoutAttempt.update({ where: { id: checkoutAttemptId }, data: { status: to } });
  await recordCheckoutAttemptEvent(checkoutAttemptId, "state_changed", { sanitizedDetail: JSON.stringify({ from: current.status, to }) }, db);

  if (to === "failed" || to === "cancelled") {
    await releaseHeldTicketHoldsForAttempt(checkoutAttemptId, db);
  }

  return updated;
}
