import { NextResponse } from "next/server";
import { paypalConfig } from "@/lib/env";

/**
 * PayPal webhook placeholder. Not wired to real payment confirmation yet —
 * see docs/PAYMENTS.md for the activation checklist. When activated, this
 * must verify the webhook signature against PAYPAL_WEBHOOK_ID before
 * trusting the payload, and be idempotent on event id.
 */
export async function POST() {
  if (!paypalConfig.webhookId) {
    return NextResponse.json({ error: "PayPal webhook not configured" }, { status: 501 });
  }
  return NextResponse.json({ error: "not implemented" }, { status: 501 });
}
