"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { adminLogin } from "@/server/actions/admin-auth";

export function AdminLoginForm({ next }: { next?: string }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    const result = await adminLogin(password, next);
    if (result && !result.ok) {
      setError(result.error);
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-4 text-left">
      <label className="block">
        <span className="mb-1 block text-xs tracking-wide uppercase">Contraseña</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoFocus
          className="w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm"
        />
      </label>
      {error ? <p className="text-sm text-stamp">{error}</p> : null}
      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? "Accediendo…" : "Entrar"}
      </Button>
    </form>
  );
}
