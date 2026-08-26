"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/admin/FormField";
import { updateBrandConfig } from "@/server/actions/admin-config";
import type { Brand } from "@/lib/brand";

const inputClass = "w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm";

export function BrandConfigForm({ brand }: { brand: Brand }) {
  const [form, setForm] = useState<Brand>(brand);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");

  function set<K extends keyof Brand>(key: K, value: Brand[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    await updateBrandConfig(form);
    setStatus("saved");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-10">
      <section className="space-y-4">
        <h2 className="font-display text-sm tracking-widest uppercase">Marca</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre">
            <input value={form.name} onChange={(e) => set("name", e.target.value)} className={inputClass} />
          </Field>
          <Field label="Nombre corto">
            <input value={form.shortName} onChange={(e) => set("shortName", e.target.value)} className={inputClass} />
          </Field>
        </div>
        <Field label="Claim">
          <input value={form.claim} onChange={(e) => set("claim", e.target.value)} className={inputClass} />
        </Field>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-sm tracking-widest uppercase">Contacto y redes</h2>
        <Field label="Email de contacto">
          <input value={form.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} className={inputClass} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Instagram">
            <input value={form.instagramUrl} onChange={(e) => set("instagramUrl", e.target.value)} className={inputClass} />
          </Field>
          <Field label="Facebook">
            <input value={form.facebookUrl} onChange={(e) => set("facebookUrl", e.target.value)} className={inputClass} />
          </Field>
          <Field label="TikTok">
            <input value={form.tiktokUrl} onChange={(e) => set("tiktokUrl", e.target.value)} className={inputClass} />
          </Field>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-sm tracking-widest uppercase">Legal (revisar antes de producción)</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Razón social">
            <input value={form.legalName} onChange={(e) => set("legalName", e.target.value)} className={inputClass} />
          </Field>
          <Field label="NIF / CIF">
            <input value={form.legalTaxId} onChange={(e) => set("legalTaxId", e.target.value)} className={inputClass} />
          </Field>
          <Field label="Domicilio">
            <input value={form.legalAddress} onChange={(e) => set("legalAddress", e.target.value)} className={inputClass} />
          </Field>
          <Field label="Registro / licencia">
            <input value={form.legalLicense} onChange={(e) => set("legalLicense", e.target.value)} className={inputClass} />
          </Field>
        </div>
        <Field label="Información del seguro">
          <input value={form.insuranceInfo} onChange={(e) => set("insuranceInfo", e.target.value)} className={inputClass} />
        </Field>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-sm tracking-widest uppercase">Reseñas</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Proveedor">
            <select value={form.reviewsProvider} onChange={(e) => set("reviewsProvider", e.target.value)} className={inputClass}>
              <option value="none">Ninguno</option>
              <option value="google">Google</option>
              <option value="trustpilot">Trustpilot</option>
            </select>
          </Field>
          <Field label="URL de reseñas">
            <input value={form.reviewsUrl} onChange={(e) => set("reviewsUrl", e.target.value)} className={inputClass} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.reviewsVisible} onChange={(e) => set("reviewsVisible", e.target.checked)} />
          Mostrar reseñas públicamente
        </label>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-sm tracking-widest uppercase">Analítica</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="GA4 ID">
            <input value={form.ga4Id} onChange={(e) => set("ga4Id", e.target.value)} className={inputClass} />
          </Field>
          <Field label="Meta Pixel ID">
            <input value={form.metaPixelId} onChange={(e) => set("metaPixelId", e.target.value)} className={inputClass} />
          </Field>
          <Field label="TikTok Pixel ID">
            <input value={form.tiktokPixelId} onChange={(e) => set("tiktokPixelId", e.target.value)} className={inputClass} />
          </Field>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-sm tracking-widest uppercase">Emails</h2>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.notifyEmailEnabled} onChange={(e) => set("notifyEmailEnabled", e.target.checked)} />
          Enviar email de confirmación al usar el formulario &quot;Avísame&quot;
        </label>
      </section>

      <Button type="submit" disabled={status === "saving"}>
        {status === "saving" ? "Guardando…" : "Guardar configuración"}
      </Button>
      {status === "saved" ? <span className="ml-3 text-xs text-carbon/50">Guardado.</span> : null}
    </form>
  );
}
