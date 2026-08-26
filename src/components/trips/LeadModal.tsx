"use client";

import { useState, useId } from "react";
import { Button } from "@/components/ui/Button";
import { submitLead } from "@/server/actions/leads";
import { track } from "@/lib/analytics/events";

type Props = {
  open: boolean;
  onClose: () => void;
  tripId: string;
  tripName: string;
  type: "notify" | "waitlist";
};

export function LeadModal({ open, onClose, tripId, tripName, type }: Props) {
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const nameId = useId();
  const emailId = useId();
  const cityId = useId();
  const consentId = useId();

  if (!open) return null;

  const title = type === "waitlist" ? "Lista de espera" : "Avísame";
  const description =
    type === "waitlist"
      ? `${tripName} está agotado. Déjanos tus datos y te avisamos si se libera una plaza.`
      : `Te avisamos en cuanto abramos plazas para ${tripName}.`;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setError("");
    const form = new FormData(e.currentTarget);
    const result = await submitLead(type, {
      tripId,
      name: String(form.get("name") || ""),
      email: String(form.get("email") || ""),
      city: String(form.get("city") || ""),
      consent: form.get("consent") === "on",
    });
    if (result.ok) {
      setStatus("done");
      track(type === "waitlist" ? "waitlist_submit" : "notify_submit", { tripId });
    } else {
      setStatus("error");
      setError(result.error);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-carbon/60 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${nameId}-title`}
      onClick={onClose}
    >
      <div
        className="fade-in w-full max-w-md rounded-t-lg bg-ivory p-6 sm:rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {status === "done" ? (
          <div className="py-4 text-center">
            <p className="font-display mb-2 text-lg">¡Apuntado!</p>
            <p className="mb-6 text-sm text-carbon/70">
              {type === "waitlist"
                ? "Te avisaremos en cuanto se libere una plaza."
                : "Te avisaremos en cuanto abramos plazas para este viaje."}
            </p>
            <Button variant="secondary" onClick={onClose} className="w-full">
              Cerrar
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 id={`${nameId}-title`} className="font-display text-lg">
                  {title}
                </h2>
                <p className="mt-1 text-sm text-carbon/70">{description}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar"
                className="text-2xl leading-none text-carbon/50 hover:text-carbon"
              >
                ×
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label htmlFor={nameId} className="mb-1 block text-xs font-medium tracking-wide uppercase">
                  Nombre
                </label>
                <input
                  id={nameId}
                  name="name"
                  required
                  className="w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm focus:border-carbon focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor={emailId} className="mb-1 block text-xs font-medium tracking-wide uppercase">
                  Email
                </label>
                <input
                  id={emailId}
                  name="email"
                  type="email"
                  required
                  className="w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm focus:border-carbon focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor={cityId} className="mb-1 block text-xs font-medium tracking-wide uppercase">
                  Ciudad de salida
                </label>
                <input
                  id={cityId}
                  name="city"
                  required
                  className="w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm focus:border-carbon focus:outline-none"
                />
              </div>
              <div className="flex items-start gap-2 pt-1">
                <input id={consentId} name="consent" type="checkbox" required className="mt-1" />
                <label htmlFor={consentId} className="text-xs text-carbon/70">
                  Acepto que Copa de Ferias use estos datos para avisarme sobre este viaje, según la{" "}
                  <a href="/privacidad" className="underline" target="_blank" rel="noreferrer">
                    política de privacidad
                  </a>
                  .
                </label>
              </div>
            </div>

            {error ? <p className="mt-3 text-sm text-stamp">{error}</p> : null}

            <Button type="submit" disabled={status === "submitting"} className="mt-5 w-full">
              {status === "submitting" ? "Enviando…" : "Avisadme"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
