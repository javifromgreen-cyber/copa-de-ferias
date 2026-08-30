import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { EmailTemplateForm } from "@/components/admin/EmailTemplateForm";

export const metadata: Metadata = { title: "Admin — Editar email" };

export default async function AdminEmailTemplatePage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const template = await prisma.emailTemplate.findUnique({ where: { key } });
  if (!template) notFound();

  return (
    <div className="max-w-2xl">
      <h1 className="font-display mb-2 text-2xl uppercase">{template.name}</h1>
      <p className="mb-6 text-sm text-carbon/60">{template.description}</p>
      <p className="mb-6 text-xs text-carbon/40">
        Variables disponibles: {"{{customerName}} {{tripName}} {{matchName}} {{bookingReference}} {{total}} {{partySize}} {{travelMode}} {{myTripUrl}}"}
        {" "}
        — y, según la plantilla: {"{{actionTitle}} {{actionDescription}} {{actionDueDate}} {{updateTitle}}"}
      </p>
      <EmailTemplateForm template={{ key: template.key, name: template.name, subject: template.subject, body: template.body, active: template.active }} />
    </div>
  );
}
