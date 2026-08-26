"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { sendTemplatedEmail, processPendingEmails } from "@/lib/email";

export async function updateEmailTemplate(
  key: string,
  input: { name: string; subject: string; body: string; active: boolean }
) {
  await prisma.emailTemplate.update({ where: { key }, data: input });
  revalidatePath("/admin/emails");
  revalidatePath(`/admin/emails/${key}`);
}

export async function sendTestEmail(key: string, to: string) {
  const result = await sendTemplatedEmail({
    templateKey: key,
    to,
    force: true,
    variables: {
      firstName: "Nombre de prueba",
      tripName: "Belgrado",
      tripNumber: "#001",
      departureCity: "Barcelona",
      departureDate: "14 de noviembre de 2026",
      returnDate: "16 de noviembre de 2026",
      whatsappUrl: "https://chat.whatsapp.com/demo",
    },
  });
  revalidatePath(`/admin/emails/${key}`);
  return result;
}

export async function runProcessPendingEmails() {
  const result = await processPendingEmails();
  revalidatePath("/admin/emails");
  return result;
}

export async function toggleNotifyEmail(enabled: boolean) {
  await prisma.brandConfig.update({ where: { id: "default" }, data: { notifyEmailEnabled: enabled } });
  revalidatePath("/admin/emails");
  revalidatePath("/admin/configuracion");
}
