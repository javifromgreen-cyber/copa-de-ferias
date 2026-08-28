import { BedIcon } from "@/components/icons";
import type { RoomAssignment } from "@/lib/checkout-atu-aire/rooming";

const ROOM_TYPE_LABELS: Record<string, string> = { single: "Individual", double: "Doble", triple: "Triple" };

/**
 * Shows the room mix that was actually used to price the trip (§6/§16) —
 * never silently decided in the background. `assignments` comes from
 * assignTravelersToRooms (deterministic fill, no peer-pairing puzzle to
 * solve) so this is purely a clear visualization, not a room designer.
 */
export function RoomingStep({ assignments, travelerNames }: { assignments: RoomAssignment[]; travelerNames: string[] }) {
  return (
    <section aria-labelledby="rooming-heading" className="space-y-3 rounded-sm border border-carbon/15 bg-white p-5">
      <h2 id="rooming-heading" className="flex items-center gap-2 text-lg font-semibold">
        <BedIcon className="h-5 w-5 text-carbon/60" />
        Habitaciones
      </h2>
      <p className="text-sm text-carbon/60">Así se organiza vuestro alojamiento con el hotel elegido:</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {assignments.map((room, i) => (
          <div key={i} className="rounded-sm border border-carbon/15 bg-ivory-dark/30 p-4">
            <p className="mb-1 text-xs font-medium tracking-wide text-carbon/50 uppercase">
              Habitación {i + 1} · {ROOM_TYPE_LABELS[room.type]}
            </p>
            <p className="text-sm">{room.travelerIndices.map((idx) => travelerNames[idx]?.trim() || `Viajero ${idx + 1}`).join(", ")}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
