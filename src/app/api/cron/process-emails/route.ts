import { NextResponse, type NextRequest } from "next/server";
import { processPendingEmails } from "@/lib/email";
import { getCronSecret } from "@/lib/env";

/**
 * Protected daily cron endpoint. Configure a scheduler (Vercel Cron, etc.)
 * to call this with header "Authorization: Bearer $CRON_SECRET". In demo
 * this can also be triggered manually from Admin > Emails.
 */
export async function GET(request: NextRequest) {
  const secret = getCronSecret();
  const auth = request.headers.get("authorization");

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await processPendingEmails();
  return NextResponse.json(result);
}
