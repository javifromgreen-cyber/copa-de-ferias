import { prisma } from "@/lib/db";
import { getAppMode, resendConfig } from "@/lib/env";
import { ConsoleEmailProvider } from "./console";
import { ResendEmailProvider } from "./resend";
import { renderTemplate, type EmailVariables } from "./render";
import { formatDate } from "@/lib/utils";
import type { EmailProvider } from "./types";

export { renderTemplate };
export type { EmailVariables };

function getEmailProvider(): EmailProvider {
  if (getAppMode() === "production" && resendConfig.isConfigured) {
    return new ResendEmailProvider();
  }
  return new ConsoleEmailProvider();
}

/**
 * Renders + "sends" (or logs, in demo) a template by key, and always
 * writes an EmailLog row so Admin has full history regardless of mode.
 * Returns null if the template doesn't exist or is inactive.
 */
export async function sendTemplatedEmail(opts: {
  templateKey: string;
  to: string;
  variables: EmailVariables;
  bookingId?: string;
  /** Send even if the template is marked inactive (used by "enviar prueba" in Admin). */
  force?: boolean;
}) {
  const template = await prisma.emailTemplate.findUnique({ where: { key: opts.templateKey } });
  if (!template) return null;
  if (!template.active && !opts.force) return null;

  const subject = renderTemplate(template.subject, opts.variables);
  const body = renderTemplate(template.body, opts.variables);

  const provider = getEmailProvider();
  const result = await provider.send({ to: opts.to, subject, body });

  await prisma.emailLog.create({
    data: {
      templateKey: template.key,
      to: opts.to,
      subject,
      body,
      mode: result.mode,
      bookingId: opts.bookingId,
    },
  });

  return { subject, body, mode: result.mode };
}

/**
 * Runs the day-based email sequence for all confirmed bookings (spec §43).
 * Idempotent: never re-sends a (bookingId, templateKey) pair that already
 * has an EmailLog entry. Call manually from Admin ("procesar emails
 * pendientes") or from the protected /api/cron/process-emails route.
 *
 * Trip return date is approximated as matchDate + 1 day (fits the standard
 * Fri travel / Sat match / Sun return shape used across demo trips). See
 * docs/EMAILS.md for how to make this precise per trip in a future version.
 */
export async function processPendingEmails(): Promise<{ sent: number }> {
  const templates = await prisma.emailTemplate.findMany({ where: { active: true } });
  const bookings = await prisma.booking.findMany({
    where: { bookingStatus: "confirmed" },
    include: { trip: true },
  });

  let sent = 0;
  const now = new Date();

  for (const booking of bookings) {
    const departureDate = new Date(booking.trip.matchDate);
    departureDate.setDate(departureDate.getDate() - 1);
    const returnDate = new Date(booking.trip.matchDate);
    returnDate.setDate(returnDate.getDate() + 1);

    for (const template of templates) {
      let targetDate: Date | null = null;
      if (template.timingReference === "booking_plus_1") {
        targetDate = new Date(booking.createdAt);
        targetDate.setDate(targetDate.getDate() + (template.timingDaysOffset ?? 1));
      } else if (template.timingReference === "before_departure" && template.timingDaysOffset != null) {
        targetDate = new Date(departureDate);
        targetDate.setDate(targetDate.getDate() - template.timingDaysOffset);
      } else if (template.timingReference === "after_return" && template.timingDaysOffset != null) {
        targetDate = new Date(returnDate);
        targetDate.setDate(targetDate.getDate() + template.timingDaysOffset);
      } else {
        // "immediate" templates (booking_confirmed, pending_data, ...) are
        // triggered directly at the relevant action, not by this sweep.
        continue;
      }

      if (targetDate > now) continue;

      const alreadySent = await prisma.emailLog.findFirst({
        where: { bookingId: booking.id, templateKey: template.key },
      });
      if (alreadySent) continue;

      await sendTemplatedEmail({
        templateKey: template.key,
        to: booking.buyerEmail,
        bookingId: booking.id,
        variables: {
          firstName: booking.buyerFirstName,
          tripName: booking.trip.name,
          tripNumber: `#${String(booking.trip.number).padStart(3, "0")}`,
          departureCity: booking.originCity,
          departureDate: formatDate(departureDate),
          returnDate: formatDate(returnDate),
          whatsappUrl: booking.trip.whatsappUrl || "",
        },
      });
      sent++;
    }
  }

  return { sent };
}
