"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { requestBookingChange } from "@/server/actions/mi-viaje";

export function ChangeRequestButton({
  accessToken,
  type,
  label,
  placeholder,
}: {
  accessToken: string;
  type: "name_change" | "important_change" | "cancellation";
  label: string;
  placeholder: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");

  if (status === "sent") {
    return <p className="text-sm text-carbon/60">Solicitud enviada. Te responderemos por email.</p>;
  }

  if (!open) {
    return (
      <Button variant="secondary" className="text-xs" onClick={() => setOpen(true)}>
        {label}
      </Button>
    );
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setStatus("sending");
        await requestBookingChange(accessToken, { type, description });
        setStatus("sent");
        router.refresh();
      }}
      className="space-y-2 rounded-sm border border-carbon/15 p-4"
    >
      <label className="block text-xs tracking-wide uppercase">{label}</label>
      <textarea
        required
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm"
      />
      <div className="flex gap-2">
        <Button type="submit" disabled={status === "sending"} className="text-xs">
          {status === "sending" ? "Enviando…" : "Enviar solicitud"}
        </Button>
        <Button type="button" variant="ghost" className="text-xs" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
