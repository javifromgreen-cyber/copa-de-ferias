"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { updateEmailTemplate, sendTestEmail } from "@/server/actions/admin-emails";
import { renderTemplate } from "@/lib/email/render";

type Template = { key: string; name: string; subject: string; body: string; active: boolean };

export function EmailTemplateForm({ template }: { template: Template }) {
  const [form, setForm] = useState(template);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [testTo, setTestTo] = useState("");
  const [testStatus, setTestStatus] = useState("");

  const previewVars = {
    customerName: "Nombre de prueba",
    tripName: "Manchester",
    matchName: "Manchester City – Manchester United",
    bookingReference: "CDF-DEMO1234",
    total: "415 €",
    partySize: "2",
    travelMode: "A TU AIRE",
    myTripUrl: "https://copadeferias.com/mi-viaje/token-de-ejemplo",
    actionTitle: "Completa el check-in del hotel",
    actionDescription: "El hotel requiere completar el check-in online antes de tu llegada.",
    actionDueDate: "Fecha límite: 4 de diciembre de 2026",
    updateTitle: "El horario del partido ha sido actualizado.",
  };

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    await updateEmailTemplate(form.key, { name: form.name, subject: form.subject, body: form.body, active: form.active });
    setStatus("saved");
  }

  async function handleTest() {
    if (!testTo) return;
    setTestStatus("Enviando…");
    const result = await sendTestEmail(form.key, testTo);
    setTestStatus(result ? `Prueba registrada en el log (modo ${result.mode}).` : "No se pudo enviar la prueba.");
  }

  return (
    <div className="space-y-8">
      <form onSubmit={handleSave} className="space-y-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} />
          Activo
        </label>
        <label className="block">
          <span className="mb-1 block text-xs tracking-wide uppercase">Nombre interno</span>
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs tracking-wide uppercase">Asunto</span>
          <input
            value={form.subject}
            onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
            className="w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs tracking-wide uppercase">Cuerpo</span>
          <textarea
            value={form.body}
            onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
            rows={10}
            className="w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm"
          />
        </label>
        <Button type="submit" disabled={status === "saving"}>
          {status === "saving" ? "Guardando…" : "Guardar"}
        </Button>
        {status === "saved" ? <span className="ml-3 text-xs text-carbon/50">Guardado.</span> : null}
      </form>

      <div>
        <h2 className="font-display mb-2 text-sm tracking-widest uppercase">Vista previa</h2>
        <div className="rounded-sm border border-carbon/15 bg-white p-4 text-sm">
          <p className="mb-2 font-medium">{renderTemplate(form.subject, previewVars)}</p>
          <p className="whitespace-pre-line text-carbon/70">{renderTemplate(form.body, previewVars)}</p>
        </div>
      </div>

      <div>
        <h2 className="font-display mb-2 text-sm tracking-widest uppercase">Enviar prueba</h2>
        <div className="flex gap-2">
          <input
            type="email"
            aria-label="Email de prueba"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            placeholder="tu@email.com"
            className="w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm"
          />
          <Button type="button" variant="secondary" onClick={handleTest} className="whitespace-nowrap text-xs">
            Enviar prueba
          </Button>
        </div>
        {testStatus ? <p className="mt-2 text-xs text-carbon/50">{testStatus}</p> : null}
      </div>
    </div>
  );
}
