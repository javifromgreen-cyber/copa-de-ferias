"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import type { Region, CompetitionType } from "@prisma/client";

export type CompetitionFormInput = {
  id?: string;
  name: string;
  region: Region;
  country: string;
  competitionType: CompetitionType;
};

export async function saveCompetition(input: CompetitionFormInput): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!input.name.trim()) {
    return { ok: false, error: "El nombre es obligatorio" };
  }

  const data = {
    name: input.name.trim(),
    region: input.region,
    country: input.country.trim(),
    competitionType: input.competitionType,
  };

  try {
    const competition = input.id
      ? await prisma.competition.update({ where: { id: input.id }, data })
      : await prisma.competition.create({ data });

    revalidatePath("/admin/competiciones");
    revalidatePath("/admin/eventos");
    return { ok: true, id: competition.id };
  } catch (err) {
    if (err instanceof Error && err.message.includes("Unique constraint")) {
      return { ok: false, error: "Ya existe una competición con ese nombre en esa región" };
    }
    throw err;
  }
}
