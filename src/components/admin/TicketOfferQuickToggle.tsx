"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleTicketOfferActive } from "@/server/actions/admin-ticket-offers";

export function TicketOfferQuickToggle({ id, active }: { id: string; active: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      className={`rounded-sm px-2 py-1 text-xs ${active ? "bg-carbon text-ivory" : "border border-carbon/20 text-carbon/60"}`}
      onClick={() =>
        startTransition(async () => {
          await toggleTicketOfferActive(id, !active);
          router.refresh();
        })
      }
    >
      {active ? "Activa" : "Inactiva"}
    </button>
  );
}
