import { NextResponse } from "next/server";
import { stripeConfig } from "@/lib/env";

/**
 * Stripe webhook placeholder. Not wired to real payment confirmation yet —
 * see docs/PAYMENTS.md for the activation checklist. When activated, this
 * must verify the Stripe-Signature header against STRIPE_WEBHOOK_SECRET
 * before trusting the payload, and be idempotent on event.id (never trust
 * a client-side redirect as proof of payment).
 */
export async function POST() {
  if (!stripeConfig.webhookSecret) {
    return NextResponse.json({ error: "Stripe webhook not configured" }, { status: 501 });
  }
  // Intentionally not implemented in this build.
  return NextResponse.json({ error: "not implemented" }, { status: 501 });
}
