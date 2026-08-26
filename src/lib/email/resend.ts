import type { EmailProvider, OutgoingEmail, SendResult } from "./types";
import { resendConfig } from "@/lib/env";

/**
 * Prepared for Resend. Not wired to the real API yet — only used when
 * APP_MODE=production and RESEND_API_KEY is set. See docs/EMAILS.md.
 */
export class ResendEmailProvider implements EmailProvider {
  async send(_email: OutgoingEmail): Promise<SendResult> {
    if (!resendConfig.isConfigured) {
      throw new Error("ResendEmailProvider: no RESEND_API_KEY configured.");
    }
    throw new Error("ResendEmailProvider is not activated in this build. See docs/EMAILS.md.");
  }
}
