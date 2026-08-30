"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/admin/FormField";
import { createBookingDocument, updateBookingDocument, deleteBookingDocument } from "@/server/actions/admin-mi-viaje";

const TYPE_LABELS = { ticket: "Entrada", hotel: "Hotel", flight: "Vuelo", other: "Otro" } as const;
const STATUS_LABELS = { pending: "Pendiente", available: "Disponible", delivered: "Entregado", action_required: "Requiere acción" } as const;

const inputClass = "w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm";

export type BookingDocumentRow = {
  id: string;
  type: keyof typeof TYPE_LABELS;
  eventId: string;
  label: string;
  status: keyof typeof STATUS_LABELS;
  fileUrl: string;
};

type FormState = { type: keyof typeof TYPE_LABELS; eventId: string; label: string; status: keyof typeof STATUS_LABELS; fileUrl: string };

function blank(): FormState {
  return { type: "other", eventId: "", label: "", status: "pending", fileUrl: "" };
}

function DocForm({
  bookingId,
  eventOptions,
  initial,
  docId,
  onDone,
}: {
  bookingId: string;
  eventOptions: { id: string; label: string }[];
  initial: FormState;
  docId?: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    startTransition(async () => {
      const result = docId ? await updateBookingDocument(docId, form) : await createBookingDocument({ bookingId, ...form });
      if (result.ok) {
        router.refresh();
        onDone();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-sm border border-carbon/15 bg-ivory-dark/40 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tipo">
          <select value={form.type} onChange={(e) => set("type", e.target.value as FormState["type"])} className={inputClass}>
            {Object.entries(TYPE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        {form.type === "ticket" ? (
          <Field label="Partido">
            <select value={form.eventId} onChange={(e) => set("eventId", e.target.value)} className={inputClass}>
              <option value="">— selecciona —</option>
              {eventOptions.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.label}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <Field label="Título / etiqueta">
          <input value={form.label} onChange={(e) => set("label", e.target.value)} placeholder="Ej. Bono de hotel" className={inputClass} />
        </Field>
        <Field label="Estado">
          <select value={form.status} onChange={(e) => set("status", e.target.value as FormState["status"])} className={inputClass}>
            {Object.entries(STATUS_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="URL del documento (opcional)">
          <input value={form.fileUrl} onChange={(e) => set("fileUrl", e.target.value)} placeholder="https://…" className={inputClass} />
        </Field>
      </div>
      {error ? <p className="text-sm text-stamp">{error}</p> : null}
      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar documento"}
        </Button>
        <button type="button" onClick={onDone} className="text-sm underline">
          Cancelar
        </button>
      </div>
    </form>
  );
}

export function BookingDocumentsManager({
  bookingId,
  documents,
  eventOptions,
}: {
  bookingId: string;
  documents: BookingDocumentRow[];
  eventOptions: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [pending, startTransition] = useTransition();

  function eventLabel(eventId: string) {
    return eventOptions.find((e) => e.id === eventId)?.label ?? eventId;
  }

  return (
    <div className="space-y-3">
      {documents.length === 0 ? (
        <p className="text-sm text-carbon/60">Todavía no hay documentos para esta reserva.</p>
      ) : (
        <div className="overflow-x-auto rounded-sm border border-carbon/15 bg-white">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b border-carbon/10 text-xs tracking-wide text-carbon/50 uppercase">
              <tr>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Etiqueta</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr key={doc.id} className="border-b border-carbon/5 last:border-0">
                  <td className="px-3 py-2">
                    {TYPE_LABELS[doc.type]}
                    {doc.type === "ticket" && doc.eventId ? ` — ${eventLabel(doc.eventId)}` : ""}
                  </td>
                  <td className="px-3 py-2">{doc.label || "—"}</td>
                  <td className="px-3 py-2">
                    <span className={doc.status === "action_required" ? "text-stamp" : ""}>{STATUS_LABELS[doc.status]}</span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-3 text-xs">
                      <button type="button" className="underline" onClick={() => setEditingId(doc.id)}>
                        Editar
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        className="text-stamp underline"
                        onClick={() => {
                          if (confirm("¿Eliminar este documento?")) {
                            startTransition(async () => {
                              await deleteBookingDocument(doc.id);
                              router.refresh();
                            });
                          }
                        }}
                      >
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {documents.map((doc) =>
        editingId === doc.id ? (
          <DocForm
            key={doc.id}
            bookingId={bookingId}
            eventOptions={eventOptions}
            docId={doc.id}
            initial={{ type: doc.type, eventId: doc.eventId, label: doc.label, status: doc.status, fileUrl: doc.fileUrl }}
            onDone={() => setEditingId(null)}
          />
        ) : null,
      )}

      {editingId === "new" ? (
        <DocForm bookingId={bookingId} eventOptions={eventOptions} initial={blank()} onDone={() => setEditingId(null)} />
      ) : (
        <button type="button" onClick={() => setEditingId("new")} className="text-sm underline">
          + Nuevo documento
        </button>
      )}
    </div>
  );
}
