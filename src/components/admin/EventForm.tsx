"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/admin/FormField";
import { saveEvent, type EventFormInput } from "@/server/actions/admin-events";
import { REGION_LABELS, COMPETITION_TYPE_LABELS } from "@/lib/catalog/labels";

const SCHEDULE_OPTIONS = ["confirmed", "time_provisional", "date_provisional"] as const;
const SCHEDULE_LABELS: Record<(typeof SCHEDULE_OPTIONS)[number], string> = {
  confirmed: "Confirmado",
  time_provisional: "Fecha confirmada, hora provisional",
  date_provisional: "Fecha provisional",
};
const STATUS_OPTIONS = ["draft", "published", "cancelled"] as const;

const inputClass = "w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm";

function toDateInput(value: string) {
  return value ? value.slice(0, 10) : "";
}

export type TripOption = { id: string; name: string; number: number; travelMode: string };
export type CompetitionOption = { id: string; name: string; region: string; country: string; competitionType: string };

export function EventForm({
  initial,
  trips,
  competitions,
}: {
  initial: EventFormInput;
  trips: TripOption[];
  competitions: CompetitionOption[];
}) {
  const router = useRouter();
  const [form, setForm] = useState<EventFormInput>(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [error, setError] = useState("");

  function set<K extends keyof EventFormInput>(key: K, value: EventFormInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const selectedCompetition = competitions.find((c) => c.id === form.competitionId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setError("");
    const result = await saveEvent(form);
    if (result.ok) {
      router.push(`/admin/eventos/${result.id}`);
      router.refresh();
      setStatus("idle");
    } else {
      setError(result.error);
      setStatus("error");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pb-24">
      <div className="rounded-sm border border-carbon/15 bg-white p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Producto (viaje)">
            <select value={form.tripId} onChange={(e) => set("tripId", e.target.value)} className={inputClass} required>
              <option value="">— selecciona —</option>
              {trips.map((t) => (
                <option key={t.id} value={t.id}>
                  #{String(t.number).padStart(3, "0")} {t.name} ({t.travelMode === "A_TU_AIRE" ? "A TU AIRE" : "GRUPO CDF"})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Nombre visible (opcional)">
            <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="El Derbi Eterno" className={inputClass} />
          </Field>
          <Field label="Equipo local">
            <input value={form.homeTeam} onChange={(e) => set("homeTeam", e.target.value)} className={inputClass} required />
          </Field>
          <Field label="Equipo visitante">
            <input value={form.awayTeam} onChange={(e) => set("awayTeam", e.target.value)} className={inputClass} required />
          </Field>
          <Field label="Estadio">
            <input value={form.stadium} onChange={(e) => set("stadium", e.target.value)} className={inputClass} required />
          </Field>
          <Field label="Ciudad">
            <input value={form.city} onChange={(e) => set("city", e.target.value)} className={inputClass} />
          </Field>
          <Field label="País (sede del partido)">
            <input value={form.country} onChange={(e) => set("country", e.target.value)} className={inputClass} />
          </Field>
          <Field label="Timezone">
            <input value={form.timezone} onChange={(e) => set("timezone", e.target.value)} placeholder="Europe/Madrid" className={inputClass} />
          </Field>
          <Field label="Fecha del partido">
            <input type="date" value={toDateInput(form.matchDate)} onChange={(e) => set("matchDate", e.target.value)} className={inputClass} required />
          </Field>
          <Field label="Hora del partido">
            <input type="time" value={form.matchTime} onChange={(e) => set("matchTime", e.target.value)} className={inputClass} />
          </Field>
          <Field label="Hora / kickoff (opcional)">
            <input type="datetime-local" value={form.kickoff} onChange={(e) => set("kickoff", e.target.value)} className={inputClass} />
          </Field>
        </div>
      </div>

      <div className="rounded-sm border border-carbon/15 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold tracking-wide uppercase">Clasificación</p>
          <Link href="/admin/competiciones/nueva" target="_blank" className="text-xs underline">
            + Nueva competición ↗
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Competición">
            <select value={form.competitionId} onChange={(e) => set("competitionId", e.target.value)} className={inputClass}>
              <option value="">— sin clasificar —</option>
              {competitions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({REGION_LABELS[c.region as keyof typeof REGION_LABELS]})
                </option>
              ))}
            </select>
          </Field>
          <div>
            <p className="mb-1 block text-xs tracking-wide text-carbon/60 uppercase">Región / tipo (según la competición)</p>
            <p className="rounded-sm border border-carbon/10 bg-ivory-dark/50 px-3 py-2 text-sm text-carbon/70">
              {selectedCompetition
                ? `${REGION_LABELS[selectedCompetition.region as keyof typeof REGION_LABELS]} · ${COMPETITION_TYPE_LABELS[selectedCompetition.competitionType as keyof typeof COMPETITION_TYPE_LABELS]}${selectedCompetition.country ? ` · ${selectedCompetition.country}` : ""}`
                : "Sin competición asignada"}
            </p>
          </div>
        </div>
        <p className="mt-2 text-xs text-carbon/60">
          La región y el tipo de competición no se editan aquí — se heredan de la competición elegida, para no duplicar
          la clasificación en cada evento.
        </p>
      </div>

      <div className="rounded-sm border border-carbon/15 bg-white p-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Horario">
            <select value={form.scheduleStatus} onChange={(e) => set("scheduleStatus", e.target.value as EventFormInput["scheduleStatus"])} className={inputClass}>
              {SCHEDULE_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {SCHEDULE_LABELS[s]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Estado del evento">
            <select value={form.status} onChange={(e) => set("status", e.target.value as EventFormInput["status"])} className={inputClass}>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s === "draft" ? "Borrador" : s === "published" ? "Publicado" : "Cancelado"}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Orden">
            <input type="number" value={form.order} onChange={(e) => set("order", Number(e.target.value))} className={inputClass} />
          </Field>
          <Field label="Clave de imagen (imageKey)">
            <input value={form.imageKey} onChange={(e) => set("imageKey", e.target.value)} className={inputClass} />
          </Field>
        </div>
        {form.scheduleStatus === "time_provisional" ? (
          <p className="mt-3 rounded-sm bg-stamp/10 px-3 py-2 text-xs text-stamp">
            Fecha confirmada, hora provisional: el motor de vuelos sigue vendiendo vuelo para A_TU_AIRE, pero solo
            ofertas suficientemente seguras para cualquier horario razonable de ese día (ventana conservadora).
          </p>
        ) : null}
        {form.scheduleStatus === "date_provisional" ? (
          <p className="mt-3 rounded-sm bg-stamp/10 px-3 py-2 text-xs text-stamp">
            Fecha provisional: ni siquiera el día es seguro todavía. El motor de vuelos bloquea la selección de vuelo
            para A_TU_AIRE hasta que se confirme la fecha — no se ofrecerá ningún vuelo inseguro.
          </p>
        ) : null}
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.primaryEvent} onChange={(e) => set("primaryEvent", e.target.checked)} />
          Evento principal del producto (ancla de fecha en tarjetas/listados)
        </label>
      </div>

      {error ? <p className="text-sm text-stamp">{error}</p> : null}

      <div className="sticky bottom-0 flex gap-3 border-t border-carbon/10 bg-ivory-dark/95 p-4">
        <Button type="submit" disabled={status === "saving"}>
          {status === "saving" ? "Guardando…" : "Guardar evento"}
        </Button>
      </div>
    </form>
  );
}
