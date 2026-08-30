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
      customerName: "Nombre de prueba",
      tripName: "Manchester",
      matchName: "Manchester City – Manchester United",
      bookingReference: "CDF-DEMO1234",
      total: "415 €",
      partySize: "2",
      travelMode: "A TU AIRE",
      myTripUrl: "https://copadeferias.com/mi-viaje/token-de-ejemplo",
      actionTitle: "Completa el check-in del hotel",
      actionDescription: "El hotel requiere completar el check-in online antes de tu llegada.",
      actionDueDate: "Fecha límite: 4 de diciembre de 2026",
      updateTitle: "El horario del partido ha sido actualizado.",
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
