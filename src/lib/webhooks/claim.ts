import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * Fase 3B.1 §6 — hardens Fase 3A §12's original webhook dedup (read a
 * marker, process, write the marker only after success — which leaves a
 * window where two concurrent deliveries of the SAME event.id can both
 * pass the read check before either writes anything) into a real atomic
 * claim, without building a queue/worker platform.
 *
 * The mechanism is a single INSERT racing on a primary key
 * (WebhookEventClaim.id = the provider's own event id): Postgres itself —
 * not application logic — guarantees at most one concurrent INSERT for
 * the same id succeeds. Whichever request's insert succeeds is the sole
 * owner of processing this event; every other concurrent (or later)
 * request for the same event.id sees the row already exists and never
 * runs the event's side effects a second time.
 *
 * Call sequence for a caller:
 *   1. `claimWebhookEvent(eventId)` — "claimed" means proceed; anything
 *      else means don't run the event's logic.
 *   2. Do the actual processing.
 *   3. `completeWebhookClaim(eventId)` on success, or
 *      `failWebhookClaim(eventId)` on a thrown error — a FAILED claim can
 *      be re-claimed by a later delivery (Stripe's own retry), so a
 *      transient failure is never permanently stuck; a COMPLETED claim
 *      never is.
 */
export type WebhookClaimOutcome = "claimed" | "in_progress" | "already_completed";

export async function claimWebhookEvent(eventId: string, provider = "stripe"): Promise<WebhookClaimOutcome> {
  try {
    await prisma.webhookEventClaim.create({ data: { id: eventId, provider, status: "processing" } });
    return "claimed";
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") throw err;
  }

  // The row already existed at insert time — read it to decide whether a
  // FAILED claim can be atomically reclaimed for a genuine retry.
  const existing = await prisma.webhookEventClaim.findUnique({ where: { id: eventId } });
  if (!existing) return "in_progress"; // raced again between the failed insert and this read — treat as someone else's in-flight claim.
  if (existing.status === "completed") return "already_completed";
  if (existing.status === "processing") return "in_progress";

  // status === "failed": try to atomically flip it back to "processing".
  // The WHERE clause guards against a second, concurrent retry doing the
  // exact same thing at the same instant — only one `updateMany` actually
  // matches a row still in "failed" and flips it; the loser sees count 0.
  const reclaimed = await prisma.webhookEventClaim.updateMany({ where: { id: eventId, status: "failed" }, data: { status: "processing" } });
  return reclaimed.count === 1 ? "claimed" : "in_progress";
}

export async function completeWebhookClaim(eventId: string): Promise<void> {
  await prisma.webhookEventClaim.update({ where: { id: eventId }, data: { status: "completed" } });
}

export async function failWebhookClaim(eventId: string): Promise<void> {
  await prisma.webhookEventClaim.update({ where: { id: eventId }, data: { status: "failed" } });
}
