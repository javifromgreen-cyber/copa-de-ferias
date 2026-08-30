"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/admin/FormField";
import { createBookingUpdate } from "@/server/actions/admin-mi-viaje";
import { formatDate } from "@/lib/utils";

const inputClass = "w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm";

export type BookingUpdateRow = { id: string; title: string; message: string; createdAt: string };

export function BookingUpdatesManager({ bookingId, updates }: { bookingId: string; updates: BookingUpdateRow[] }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    startTransition(async () => {
      const result = await createBookingUpdate({ bookingId, title, message });
      if (result.ok) {
        setTitle("");
        setMessage("");
        setShowForm(false);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="space-y-3">
      {updates.length === 0 ? (
        <p className="text-sm text-carbon/60">Todavía no hay actualizaciones para esta reserva.</p>
      ) : (
        <ul className="space-y-2">
          {updates.map((u) => (
            <li key={u.id} className="rounded-sm border border-carbon/10 bg-white p-3 text-sm">
              <p className="mb-1 flex items-center justify-between">
                <span className="font-medium">{u.title}</span>
                <span className="text-xs text-carbon/50">{formatDate(new Date(u.createdAt))}</span>
              </p>
              {u.message ? <p className="text-carbon/70">{u.message}</p> : null}
            </li>
          ))}
        </ul>
      )}

      {showForm ? (
        <form onSubmit={submit} className="space-y-3 rounded-sm border border-carbon/15 bg-ivory-dark/40 p-3">
          <Field label="Título">
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} required />
          </Field>
          <Field label="Mensaje (opcional)">
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} className={inputClass} />
          </Field>
          {error ? <p className="text-sm text-stamp">{error}</p> : null}
          <div className="flex gap-3">
            <Button type="submit" disabled={pending}>
              {pending ? "Publicando…" : "Publicar actualización"}
            </Button>
            <button type="button" onClick={() => setShowForm(false)} className="text-sm underline">
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => setShowForm(true)} className="text-sm underline">
          + Nueva actualización
        </button>
      )}
    </div>
  );
}
