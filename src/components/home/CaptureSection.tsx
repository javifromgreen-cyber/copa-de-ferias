"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { submitGeneralLead } from "@/server/actions/leads";

export function CaptureSection() {
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const emailId = useId();
  const consentId = useId();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setError("");
    const form = new FormData(e.currentTarget);
    const result = await submitGeneralLead({
      email: String(form.get("email") || ""),
      consent: form.get("consent") === "on",
    });
    if (result.ok) {
      setStatus("done");
    } else {
      setStatus("error");
      setError(result.error);
    }
  }

  return (
    <section className="bg-carbon py-20 text-ivory sm:py-24">
      <Container className="max-w-2xl text-center">
        <h2 className="font-display mb-4 text-3xl uppercase sm:text-4xl">
          Entérate antes que nadie de la próxima salida
        </h2>
        <p className="mb-8 text-ivory/70">
          El calendario decide el destino. En cuanto elegimos el próximo partido, te lo contamos primero a ti.
        </p>

        {status === "done" ? (
          <p className="font-display text-lg">Hecho. Estás en la lista.</p>
        ) : (
          <form onSubmit={handleSubmit} className="mx-auto max-w-md">
            <div className="flex flex-col gap-3 sm:flex-row">
              <label htmlFor={emailId} className="sr-only">
                Email
              </label>
              <input
                id={emailId}
                name="email"
                type="email"
                required
                placeholder="tu@email.com"
                className="w-full flex-1 rounded-sm border border-ivory/30 bg-transparent px-4 py-3 text-sm text-ivory placeholder:text-ivory/40 focus:border-ivory focus:outline-none"
              />
              <Button type="submit" variant="inverse" disabled={status === "submitting"}>
                {status === "submitting" ? "Enviando…" : "Avísame"}
              </Button>
            </div>
            <div className="mt-3 flex items-center justify-center gap-2 text-left">
              <input id={consentId} name="consent" type="checkbox" required />
              <label htmlFor={consentId} className="text-xs text-ivory/60">
                Acepto que Copa de Ferias use mi email para avisarme de próximos viajes, según la{" "}
                <a href="/privacidad" className="underline">
                  política de privacidad
                </a>
                .
              </label>
            </div>
          </form>
        )}
        {status === "error" ? <p className="mt-3 text-sm text-stamp">{error}</p> : null}
      </Container>
    </section>
  );
}
