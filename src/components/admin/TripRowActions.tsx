"use client";

import { useTransition } from "react";
import { duplicateTrip, archiveTrip } from "@/server/actions/admin-trips";

export function TripRowActions({ tripId }: { tripId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex gap-3 text-xs">
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => duplicateTrip(tripId))}
        className="underline"
      >
        Duplicar
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (confirm("¿Archivar este viaje? Dejará de mostrarse públicamente.")) {
            startTransition(() => archiveTrip(tripId));
          }
        }}
        className="text-stamp underline"
      >
        Archivar
      </button>
    </div>
  );
}
