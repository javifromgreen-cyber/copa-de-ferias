import type { Metadata } from "next";
import { getBrand } from "@/lib/brand";
import { BrandConfigForm } from "@/components/admin/BrandConfigForm";

export const metadata: Metadata = { title: "Admin — Configuración" };

export default async function AdminConfigPage() {
  const brand = await getBrand();

  return (
    <div className="max-w-2xl">
      <h1 className="font-display mb-6 text-2xl uppercase">Configuración</h1>
      <BrandConfigForm brand={brand} />
    </div>
  );
}
