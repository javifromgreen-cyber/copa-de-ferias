"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import {
  updateBookingNotes,
  cancelAndRefundBooking,
  updatePassportStatus,
  resolveChangeRequest,
  updateAdditionalDataNote,
} from "@/server/actions/admin-bookings";

export function BookingNotesEditor({ bookingId, initialNotes }: { bookingId: string; initialNotes: string }) {
  const [notes, setNotes] = useState(initialNotes);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  return (
    <div>
      <textarea
        value={notes}
        onChange={(e) => {
          setNotes(e.target.value);
          setSaved(false);
        }}
        rows={3}
        className="w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm"
      />
      <Button
        type="button"
        variant="secondary"
        className="mt-2 text-xs"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await updateBookingNotes(bookingId, notes);
            setSaved(true);
          })
        }
      >
        {pending ? "Guardando…" : "Guardar notas"}
      </Button>
      {saved ? <span className="ml-2 text-xs text-carbon/50">Guardado.</span> : null}
    </div>
  );
}

export function AdditionalDataNoteEditor({ bookingId, initialNote }: { bookingId: string; initialNote: string }) {
  const [note, setNote] = useState(initialNote);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  return (
    <div>
      <textarea
        value={note}
        onChange={(e) => {
          setNote(e.target.value);
          setSaved(false);
        }}
        rows={2}
        placeholder="Ej. Necesitamos el número de vuelo para gestionar tu transfer."
        className="w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm"
      />
      <Button
        type="button"
        variant="secondary"
        className="mt-2 text-xs"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await updateAdditionalDataNote(bookingId, note);
            setSaved(true);
          })
        }
      >
        {pending ? "Guardando…" : "Guardar aviso"}
      </Button>
      {saved ? <span className="ml-2 text-xs text-carbon/50">Guardado.</span> : null}
    </div>
  );
}

export function CancelBookingButton({ bookingId, disabled }: { bookingId: string; disabled?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (disabled) return null;

  return (
    <Button
      variant="secondary"
      className="text-xs text-stamp"
      disabled={pending}
      onClick={() => {
        if (confirm("¿Cancelar esta reserva y liberar sus plazas? Se marcará como reembolsada.")) {
          startTransition(async () => {
            await cancelAndRefundBooking(bookingId);
            router.refresh();
          });
        }
      }}
    >
      {pending ? "Procesando…" : "Cancelar y reembolsar"}
    </Button>
  );
}

export function PassportStatusSelect({ bookingId, initial }: { bookingId: string; initial: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [pending, startTransition] = useTransition();

  return (
    <select
      value={value}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value as "pending" | "prepared" | "sent";
        setValue(next);
        startTransition(async () => {
          await updatePassportStatus(bookingId, next);
          router.refresh();
        });
      }}
      className="rounded-sm border border-carbon/20 bg-white px-2 py-1 text-sm"
    >
      <option value="pending">Pendiente</option>
      <option value="prepared">Preparado</option>
      <option value="sent">Enviado</option>
    </select>
  );
}

export function ChangeRequestAdminRow({
  id,
  type,
  description,
  status,
}: {
  id: string;
  type: string;
  description: string;
  status: string;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <div className="rounded-sm border border-carbon/10 p-3 text-sm">
      <p className="font-medium">
        {type} — <span className="text-carbon/50">{status}</span>
      </p>
      <p className="mt-1 text-carbon/70">{description}</p>
      {status !== "completed" && status !== "rejected" ? (
        <div className="mt-3 space-y-2">
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notas de resolución (opcional)"
            className="w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-xs"
          />
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="text-xs"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await resolveChangeRequest(id, { status: "approved", resolutionNotes: notes });
                  router.refresh();
                })
              }
            >
              Aprobar
            </Button>
            <Button
              variant="secondary"
              className="text-xs"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await resolveChangeRequest(id, { status: "completed", resolutionNotes: notes });
                  router.refresh();
                })
              }
            >
              Completar
            </Button>
            <Button
              variant="secondary"
              className="text-xs text-stamp"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await resolveChangeRequest(id, { status: "rejected", resolutionNotes: notes });
                  router.refresh();
                })
              }
            >
              Rechazar
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
