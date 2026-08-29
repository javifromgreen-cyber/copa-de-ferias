"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { updateTravelerContact } from "@/server/actions/mi-viaje";
import { formatDate } from "@/lib/utils";

export type TravelerContactData = {
  id: string;
  firstName: string;
  lastName: string;
  nationality: string;
  docType: string;
  maskedDocNumber: string;
  birthDate: Date | null;
  phone: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
};

const DOC_TYPE_LABELS: Record<string, string> = { dni: "DNI", passport: "Pasaporte" };

/**
 * §15: name/nationality/document belong to an already-issued ticket, so
 * they're shown read-only with a "contact us" note rather than a free-edit
 * form — only phone and emergency contact, which never affect a ticket,
 * hotel or flight already booked, are actually editable here.
 */
export function TravelerContactCard({ accessToken, traveler }: { accessToken: string; traveler: TravelerContactData }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState(traveler.phone);
  const [emergencyContactName, setEmergencyContactName] = useState(traveler.emergencyContactName);
  const [emergencyContactPhone, setEmergencyContactPhone] = useState(traveler.emergencyContactPhone);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    const result = await updateTravelerContact(accessToken, { travelerId: traveler.id, phone, emergencyContactName, emergencyContactPhone });
    setStatus(result.ok ? "saved" : "error");
    if (result.ok) router.refresh();
  }

  return (
    <article className="rounded-sm border border-carbon/15 p-5">
      <h3 className="mb-3 text-base font-semibold">
        {traveler.firstName} {traveler.lastName}
      </h3>
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        {traveler.nationality ? (
          <div>
            <dt className="text-xs text-carbon/50 uppercase">Nacionalidad</dt>
            <dd>{traveler.nationality}</dd>
          </div>
        ) : null}
        {traveler.docType ? (
          <div>
            <dt className="text-xs text-carbon/50 uppercase">Documento</dt>
            <dd>{DOC_TYPE_LABELS[traveler.docType] ?? traveler.docType}</dd>
          </div>
        ) : null}
        {traveler.maskedDocNumber ? (
          <div>
            <dt className="text-xs text-carbon/50 uppercase">Número</dt>
            <dd>{traveler.maskedDocNumber}</dd>
          </div>
        ) : null}
        {traveler.birthDate ? (
          <div>
            <dt className="text-xs text-carbon/50 uppercase">Fecha de nacimiento</dt>
            <dd>{formatDate(traveler.birthDate)}</dd>
          </div>
        ) : null}
      </dl>
      {traveler.docType ? <p className="mt-3 text-xs text-carbon/50">Para modificar estos datos, contacta con nosotros indicando tu referencia.</p> : null}

      <button type="button" onClick={() => setOpen((v) => !v)} className="mt-4 text-xs font-medium underline underline-offset-2">
        {open ? "Ocultar contacto" : "Editar teléfono / contacto de emergencia"}
      </button>

      {open ? (
        <form onSubmit={handleSubmit} className="mt-3 space-y-3 border-t border-carbon/10 pt-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-xs tracking-wide uppercase">Teléfono</span>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs tracking-wide uppercase">Contacto de emergencia — nombre</span>
              <input
                value={emergencyContactName}
                onChange={(e) => setEmergencyContactName(e.target.value)}
                className="w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs tracking-wide uppercase">Contacto de emergencia — teléfono</span>
              <input
                value={emergencyContactPhone}
                onChange={(e) => setEmergencyContactPhone(e.target.value)}
                className="w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm"
              />
            </label>
          </div>
          <Button type="submit" variant="secondary" disabled={status === "saving"} className="text-xs">
            {status === "saving" ? "Guardando…" : "Guardar"}
          </Button>
          {status === "saved" ? <span className="ml-3 text-xs text-carbon/50">Guardado.</span> : null}
          {status === "error" ? <span className="ml-3 text-xs text-stamp">No se ha podido guardar.</span> : null}
        </form>
      ) : null}
    </article>
  );
}
