"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { lookupTripAccess } from "@/server/actions/mi-viaje";

export function MiViajeLookupForm() {
  const router = useRouter();
  const [reference, setReference] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    const result = await lookupTripAccess({ reference, email });
    if (result.ok) {
      router.push(`/mi-viaje/${result.accessToken}`);
    } else {
      setError(result.error);
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="block">
        <span className="mb-1 block text-xs tracking-wide uppercase">Número de reserva</span>
        <input
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="CDF-XXXXXXXX"
          required
          className="w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs tracking-wide uppercase">Email</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm"
        />
      </label>
      {error ? <p className="text-sm text-stamp">{error}</p> : null}
      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? "Buscando…" : "Acceder"}
      </Button>
    </form>
  );
}
