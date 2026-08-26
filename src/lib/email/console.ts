import type { EmailProvider, OutgoingEmail, SendResult } from "./types";

/**
 * Demo-mode email "provider": never sends anything externally. The actual
 * persistence into EmailLog (so Admin can see history/preview) happens in
 * src/lib/email/index.ts's sendTemplatedEmail — this class just logs.
 */
export class ConsoleEmailProvider implements EmailProvider {
  async send(email: OutgoingEmail): Promise<SendResult> {
    console.log("[demo email] to:", email.to, "| subject:", email.subject);
    return { delivered: false, mode: "demo" };
  }
}
