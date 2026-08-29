import { BuildingIcon, BedIcon } from "@/components/icons";
import { formatDate } from "@/lib/utils";
import type { AtuAireMiViajeView } from "@/lib/mi-viaje/buildAtuAireView";

/**
 * Only rendered when the booking actually contracted a hotel (view.hotel
 * is null otherwise) — a ticket-only booking must never show an empty
 * hotel block (§8/§38).
 */
export function HotelSection({ view }: { view: AtuAireMiViajeView }) {
  if (!view.hotel) return null;

  return (
    <details id="hotel" open className="scroll-mt-6 border-b border-carbon/15 py-8">
      <summary className="mb-4 flex cursor-pointer list-none items-center gap-2 text-lg font-display uppercase">
        <BuildingIcon className="h-5 w-5 shrink-0" />
        Tu hotel
      </summary>

      <div className="mb-6 rounded-sm border border-carbon/15 p-5">
        <h3 className="mb-3 text-base font-semibold">{view.hotel.name}</h3>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-carbon/50 uppercase">Check-in</dt>
            <dd>{formatDate(view.hotel.checkIn, { day: "numeric", month: "long" })}</dd>
          </div>
          <div>
            <dt className="text-xs text-carbon/50 uppercase">Check-out</dt>
            <dd>{formatDate(view.hotel.checkOut, { day: "numeric", month: "long" })}</dd>
          </div>
          <div>
            <dt className="text-xs text-carbon/50 uppercase">Noches</dt>
            <dd>
              {view.hotel.nights} noche{view.hotel.nights > 1 ? "s" : ""}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-carbon/50 uppercase">Estado</dt>
            <dd className="font-medium">{view.hotel.statusLabel}</dd>
          </div>
        </dl>
      </div>

      {view.rooms ? (
        <div>
          <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold uppercase">
            <BedIcon className="h-4 w-4 shrink-0" />
            Habitaciones
          </h3>
          <p className="mb-3 text-sm text-carbon/60">Así queda organizado el grupo, tal y como se calculó al reservar.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {view.rooms.map((room, i) => (
              <div key={i} className="rounded-sm border border-carbon/15 bg-ivory-dark/30 p-4">
                <p className="mb-1 text-xs font-medium tracking-wide text-carbon/50 uppercase">{room.label}</p>
                <p className="text-sm">{room.travelerNames.join(", ")}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </details>
  );
}
