"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/admin/FormField";
import { saveCompetition, type CompetitionFormInput } from "@/server/actions/admin-competitions";
import { REGIONS, COMPETITION_TYPES, REGION_LABELS, COMPETITION_TYPE_LABELS } from "@/lib/catalog/labels";

const inputClass = "w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm";

export function CompetitionForm({ initial }: { initial: CompetitionFormInput }) {
  const router = useRouter();
  const [form, setForm] = useState<CompetitionFormInput>(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [error, setError] = useState("");

  function set<K extends keyof CompetitionFormInput>(key: K, value: CompetitionFormInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setError("");
    const result = await saveCompetition(form);
    if (result.ok) {
      router.push("/admin/competiciones");
      router.refresh();
      setStatus("idle");
    } else {
      setError(result.error);
      setStatus("error");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-sm border border-carbon/15 bg-white p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre">
          <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Premier League" className={inputClass} required />
        </Field>
        <Field label="País (vacío para competiciones continentales)">
          <input value={form.country} onChange={(e) => set("country", e.target.value)} placeholder="England" className={inputClass} />
        </Field>
        <Field label="Región">
          <select value={form.region} onChange={(e) => set("region", e.target.value as CompetitionFormInput["region"])} className={inputClass}>
            {REGIONS.map((r) => (
              <option key={r} value={r}>
                {REGION_LABELS[r]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Tipo de competición">
          <select value={form.competitionType} onChange={(e) => set("competitionType", e.target.value as CompetitionFormInput["competitionType"])} className={inputClass}>
            {COMPETITION_TYPES.map((t) => (
              <option key={t} value={t}>
                {COMPETITION_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {error ? <p className="text-sm text-stamp">{error}</p> : null}

      <Button type="submit" disabled={status === "saving"}>
        {status === "saving" ? "Guardando…" : "Guardar competición"}
      </Button>
    </form>
  );
}
