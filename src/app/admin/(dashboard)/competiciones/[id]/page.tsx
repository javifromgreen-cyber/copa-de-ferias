import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { CompetitionForm } from "@/components/admin/CompetitionForm";

export const metadata: Metadata = { title: "Admin — Editar competición" };

export default async function EditCompetitionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const competition = await prisma.competition.findUnique({ where: { id } });
  if (!competition) notFound();

  return (
    <div>
      <h1 className="font-display mb-6 text-2xl uppercase">Editar — {competition.name}</h1>
      <CompetitionForm initial={competition} />
    </div>
  );
}
