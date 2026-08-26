"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { runProcessPendingEmails } from "@/server/actions/admin-emails";

export function ProcessPendingEmailsButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  return (
    <div className="flex items-center gap-3">
      {message ? <span className="text-xs text-carbon/50">{message}</span> : null}
      <Button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await runProcessPendingEmails();
            setMessage(`${result.sent} emails procesados.`);
            router.refresh();
          })
        }
        className="text-xs"
      >
        {pending ? "Procesando…" : "Procesar emails pendientes"}
      </Button>
    </div>
  );
}
