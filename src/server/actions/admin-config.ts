"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import type { Brand } from "@/lib/brand";

export async function updateBrandConfig(input: Brand) {
  await prisma.brandConfig.update({ where: { id: "default" }, data: input });
  revalidatePath("/", "layout");
  revalidatePath("/admin/configuracion");
}
