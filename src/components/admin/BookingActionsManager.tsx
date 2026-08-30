"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/admin/FormField";
import { createBookingAction, completeBookingAction, reopenBookingAction } from "@/server/actions/admin-mi-viaje";
import { formatDate } from "@/lib/utils";

const TYPE_LABELS = {
  hotel_checkin: "Check-in de hotel",
  flight_checkin: "Check-in de vuelo",
  data_correction: "Corrección de datos",
  change_review: "Revisión de cambio",
  document: "Documento",
  other: "Otro",
} as const;

const inputClass = "w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm";

export type BookingActionRow = {
  id: string;
  type: keyof typeof TYPE_LABELS;
  title: string;
  description: string;
  status: "pending" | "completed";
  actionUrl: string;
  dueAt: string | null;
};

function blank() {
  return { type: "other" as keyof typeof TYPE_LABELS, title: "", description: "", actionUrl: "", dueAt: "" };
}

export function BookingActionsManager({ bookingId, actions }: { bookingId: string; actions: BookingActionRow[] }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blank());
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function set<K extends keyof ReturnType<typeof blank>>(key: K, value: ReturnType<typeof blank>[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    startTransition(async () => {
      const result = await createBookingAction({ bookingId, ...form });
      if (result.ok) {
        setForm(blank());
        setShowForm(false);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="space-y-3">
      {actions.length === 0 ? (
        <p className="text-sm text-carbon/60">Todavía no hay acciones para esta reserva.</p>
      ) : (
        <ul className="space-y-2">
          {actions.map((a) => (
            <li key={a.id} className="rounded-sm border border-carbon/10 bg-white p-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">
                    {a.title} <span className="text-xs text-carbon/50">({TYPE_LABELS[a.type]})</span>
                  </p>
                  {a.description ? <p className="mt-1 text-carbon/70">{a.description}</p> : null}
                  {a.dueAt ? <p className="mt-1 text-xs text-carbon/50">Antes del {formatDate(new Date(a.dueAt))}</p> : null}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span className={a.status === "pending" ? "text-xs text-stamp uppercase" : "text-xs text-carbon/50 uppercase"}>
                    {a.status === "pending" ? "Pendiente" : "Completada"}
                  </span>
                  <button
                    type="button"
                    disabled={pending}
                    className="text-xs underline"
                    onClick={() =>
                      startTransition(async () => {
                        if (a.status === "pending") await completeBookingAction(a.id);
                        else await reopenBookingAction(a.id);
                        router.refresh();
                      })
                    }
                  >
                    {a.status === "pending" ? "Marcar completada" : "Reabrir"}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {showForm ? (
        <form onSubmit={submit} className="space-y-3 rounded-sm border border-carbon/15 bg-ivory-dark/40 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tipo">
              <select value={form.type} onChange={(e) => set("type", e.target.value as typeof form.type)} className={inputClass}>
                {Object.entries(TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Fecha límite (opcional)">
              <input type="date" value={form.dueAt} onChange={(e) => set("dueAt", e.target.value)} className={inputClass} />
            </Field>
          </div>
          <Field label="Título">
            <input value={form.title} onChange={(e) => set("title", e.target.value)} className={inputClass} required />
          </Field>
          <Field label="Descripción (opcional)">
            <textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} className={inputClass} />
          </Field>
          <Field label="Enlace de la acción (opcional)">
            <input value={form.actionUrl} onChange={(e) => set("actionUrl", e.target.value)} placeholder="https://…" className={inputClass} />
          </Field>
          {error ? <p className="text-sm text-stamp">{error}</p> : null}
          <div className="flex gap-3">
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : "Añadir acción"}
            </Button>
            <button type="button" onClick={() => setShowForm(false)} className="text-sm underline">
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => setShowForm(true)} className="text-sm underline">
          + Añadir acción necesaria
        </button>
      )}
    </div>
  );
}
