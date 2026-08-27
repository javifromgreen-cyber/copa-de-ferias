"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { updateTravelerDetails } from "@/server/actions/mi-viaje";
import { track } from "@/lib/analytics/events";
import { isTravelerComplete } from "@/lib/mi-viaje/completeness";

export type TravelerDetailsData = {
  id: string;
  firstName: string;
  lastName: string;
  nationality: string;
  sex: string;
  docType: string;
  docNumber: string;
  docExpiry: string; // yyyy-mm-dd or ""
  docCountry: string;
  phone: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
};

/**
 * A consult-first row: for a normal booking these fields were already
 * collected at checkout, so this defaults to collapsed with a "Datos
 * completos" summary. It only opens automatically when something is
 * genuinely still missing (see checkout §11) — it is not a place a
 * client is routinely invited to "complete" things.
 */
export function TravelerDetailsForm({ accessToken, traveler }: { accessToken: string; traveler: TravelerDetailsData }) {
  const router = useRouter();
  const [form, setForm] = useState(traveler);
  const [open, setOpen] = useState(!isTravelerComplete(traveler));
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    const result = await updateTravelerDetails(accessToken, { travelerId: traveler.id, ...form });
    if (result.ok) {
      setStatus("saved");
      track("traveler_data_completed", { travelerId: traveler.id });
      router.refresh();
    } else {
      setStatus("error");
    }
  }

  const complete = isTravelerComplete(form);

  return (
    <div className="rounded-sm border border-carbon/15">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium"
      >
        <span>
          {traveler.firstName} {traveler.lastName}
        </span>
        <span className={complete ? "text-xs text-carbon/50 uppercase" : "text-xs text-stamp uppercase"}>
          {complete ? "Datos completos" : "Datos pendientes"}
        </span>
      </button>

      {open ? (
        <form onSubmit={handleSubmit} className="space-y-3 border-t border-carbon/10 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs tracking-wide uppercase">Nacionalidad</span>
              <input
                value={form.nationality}
                onChange={(e) => setForm((f) => ({ ...f, nationality: e.target.value }))}
                className="w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs tracking-wide uppercase">Sexo</span>
              <input
                value={form.sex}
                onChange={(e) => setForm((f) => ({ ...f, sex: e.target.value }))}
                className="w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs tracking-wide uppercase">Tipo de documento</span>
              <select
                value={form.docType}
                onChange={(e) => setForm((f) => ({ ...f, docType: e.target.value }))}
                className="w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm"
              >
                <option value="">Selecciona</option>
                <option value="dni">DNI</option>
                <option value="passport">Pasaporte</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs tracking-wide uppercase">Número de documento</span>
              <input
                value={form.docNumber}
                onChange={(e) => setForm((f) => ({ ...f, docNumber: e.target.value }))}
                className="w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs tracking-wide uppercase">Caducidad</span>
              <input
                type="date"
                value={form.docExpiry}
                onChange={(e) => setForm((f) => ({ ...f, docExpiry: e.target.value }))}
                className="w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs tracking-wide uppercase">País emisor</span>
              <input
                value={form.docCountry}
                onChange={(e) => setForm((f) => ({ ...f, docCountry: e.target.value }))}
                className="w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs tracking-wide uppercase">Teléfono</span>
              <input
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                className="w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs tracking-wide uppercase">Contacto de emergencia — nombre</span>
              <input
                value={form.emergencyContactName}
                onChange={(e) => setForm((f) => ({ ...f, emergencyContactName: e.target.value }))}
                className="w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs tracking-wide uppercase">Contacto de emergencia — teléfono</span>
              <input
                value={form.emergencyContactPhone}
                onChange={(e) => setForm((f) => ({ ...f, emergencyContactPhone: e.target.value }))}
                className="w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm"
              />
            </label>
          </div>
          <Button type="submit" disabled={status === "saving"} className="mt-1">
            {status === "saving" ? "Guardando…" : "Guardar"}
          </Button>
          {status === "saved" ? <span className="ml-3 text-xs text-carbon/50">Guardado.</span> : null}
        </form>
      ) : null}
    </div>
  );
}
