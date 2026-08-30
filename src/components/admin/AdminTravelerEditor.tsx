"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/admin/FormField";
import { adminUpdateTraveler } from "@/server/actions/admin-mi-viaje";
import { formatDate } from "@/lib/utils";

const inputClass = "w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm";

export type AdminTravelerRow = {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string; // yyyy-mm-dd or ""
  originCity: string;
  nationality: string;
  sex: string;
  docType: "" | "dni" | "passport";
  docNumber: string;
  docExpiry: string; // yyyy-mm-dd or ""
  docCountry: string;
  phone: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
};

export function AdminTravelerEditor({ traveler }: { traveler: AdminTravelerRow }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(traveler);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function set<K extends keyof AdminTravelerRow>(key: K, value: AdminTravelerRow[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    startTransition(async () => {
      const result = await adminUpdateTraveler({ travelerId: traveler.id, ...form });
      if (result.ok) {
        setEditing(false);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  if (!editing) {
    return (
      <div className="rounded-sm border border-carbon/10 bg-white p-3 text-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-medium">
              {traveler.firstName} {traveler.lastName}
            </p>
            <p className="text-carbon/60">
              {traveler.nationality || "—"} · {traveler.docType || "—"} {traveler.docNumber}
              {traveler.docExpiry ? ` (caduca ${formatDate(new Date(traveler.docExpiry))})` : ""}
            </p>
            <p className="text-carbon/60">
              Nacimiento: {traveler.birthDate ? formatDate(new Date(traveler.birthDate)) : "—"} · Origen: {traveler.originCity || "—"} ·
              Tel: {traveler.phone || "—"}
            </p>
            <p className="text-carbon/60">
              Emergencia: {traveler.emergencyContactName || "—"} {traveler.emergencyContactPhone ? `(${traveler.emergencyContactPhone})` : ""}
            </p>
          </div>
          <button type="button" onClick={() => setEditing(true)} className="shrink-0 text-xs underline">
            Editar
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-sm border border-carbon/15 bg-ivory-dark/40 p-3 text-sm">
      <p className="rounded-sm bg-stamp/10 px-3 py-2 text-xs text-stamp">
        Modificar este dato después de la reserva puede requerir validación con el proveedor (entrada, hotel o vuelo ya
        emitidos a este nombre).
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre">
          <input value={form.firstName} onChange={(e) => set("firstName", e.target.value)} className={inputClass} required />
        </Field>
        <Field label="Apellidos">
          <input value={form.lastName} onChange={(e) => set("lastName", e.target.value)} className={inputClass} required />
        </Field>
        <Field label="Fecha de nacimiento">
          <input type="date" value={form.birthDate} onChange={(e) => set("birthDate", e.target.value)} className={inputClass} />
        </Field>
        <Field label="Ciudad de origen">
          <input value={form.originCity} onChange={(e) => set("originCity", e.target.value)} className={inputClass} />
        </Field>
        <Field label="Nacionalidad">
          <input value={form.nationality} onChange={(e) => set("nationality", e.target.value)} className={inputClass} />
        </Field>
        <Field label="Sexo (solo si aplica a emparejamiento de habitación)">
          <input value={form.sex} onChange={(e) => set("sex", e.target.value)} className={inputClass} />
        </Field>
        <Field label="Tipo de documento">
          <select value={form.docType} onChange={(e) => set("docType", e.target.value as AdminTravelerRow["docType"])} className={inputClass}>
            <option value="">—</option>
            <option value="dni">DNI</option>
            <option value="passport">Pasaporte</option>
          </select>
        </Field>
        <Field label="Número de documento">
          <input value={form.docNumber} onChange={(e) => set("docNumber", e.target.value)} className={inputClass} />
        </Field>
        <Field label="Caducidad del documento">
          <input type="date" value={form.docExpiry} onChange={(e) => set("docExpiry", e.target.value)} className={inputClass} />
        </Field>
        <Field label="País emisor del documento">
          <input value={form.docCountry} onChange={(e) => set("docCountry", e.target.value)} className={inputClass} />
        </Field>
        <Field label="Teléfono">
          <input value={form.phone} onChange={(e) => set("phone", e.target.value)} className={inputClass} />
        </Field>
        <Field label="Contacto de emergencia">
          <input value={form.emergencyContactName} onChange={(e) => set("emergencyContactName", e.target.value)} className={inputClass} />
        </Field>
        <Field label="Teléfono de emergencia">
          <input value={form.emergencyContactPhone} onChange={(e) => set("emergencyContactPhone", e.target.value)} className={inputClass} />
        </Field>
      </div>
      {error ? <p className="text-sm text-stamp">{error}</p> : null}
      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar viajero"}
        </Button>
        <button type="button" onClick={() => { setEditing(false); setForm(traveler); }} className="text-sm underline">
          Cancelar
        </button>
      </div>
    </form>
  );
}
