import { formatCurrency } from "@/lib/utils";
import { pairTravelers, setSoloChoice, computeRooms, type RoomChoice } from "@/lib/checkout/rooms";
import { BedIcon } from "@/components/icons";

type Traveler = { firstName: string; lastName: string; sex: string };

/**
 * Room-card UI: one "Habitación N" card per pair (two editable slots), plus
 * one "Viajero sin emparejar" card per still-solo traveler with the two
 * explicit choices (share with the group / individual + supplement). The
 * underlying roomOf[] pairing engine (mutual, exclusive, no duplicates) is
 * unchanged — this only changes how it's presented, so nobody has to
 * answer "who do you want to share with" once per traveler.
 */
export function RoomAssignmentStep({
  travelers,
  roomOf,
  onChange,
  onSexChange,
  singleSupplement,
  currency,
}: {
  travelers: Traveler[];
  roomOf: RoomChoice[];
  onChange: (next: RoomChoice[]) => void;
  onSexChange: (index: number, sex: string) => void;
  singleSupplement: number;
  currency: string;
}) {
  const { pairs, unpaired } = computeRooms(roomOf);

  function name(i: number) {
    const t = travelers[i];
    return `${t.firstName} ${t.lastName}`.trim() || `Viajero ${i + 1}`;
  }

  return (
    <section className="space-y-6">
      <div>
        <h2 className="font-display text-xl uppercase">Habitaciones</h2>
        <p className="mt-1 text-sm text-carbon/60">
          Habitación doble compartida por defecto. Así queda organizado el grupo — cambia cualquier nombre si
          preferís otra combinación.
        </p>
      </div>

      <div className="space-y-4">
        {pairs.map(([a, b], i) => (
          <div key={`${a}-${b}`} className="rounded-sm border border-carbon/15 p-4">
            <p className="mb-3 flex items-center gap-2 text-xs font-medium tracking-wide uppercase text-carbon/60">
              <BedIcon className="h-4 w-4 shrink-0" />
              Habitación {i + 1}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <RoomSlotSelect occupant={a} partner={b} travelers={travelers} roomOf={roomOf} onChange={onChange} />
              <RoomSlotSelect occupant={b} partner={a} travelers={travelers} roomOf={roomOf} onChange={onChange} />
            </div>
          </div>
        ))}

        {unpaired.map((i) => {
          const choice = roomOf[i];
          return (
            <div key={i} className="rounded-sm border border-carbon/15 p-4">
              <p className="mb-1 text-xs font-medium tracking-wide uppercase text-carbon/60">Viajero sin emparejar</p>
              <p className="mb-3 text-sm font-medium">{name(i)}</p>
              <p className="mb-2 text-sm text-carbon/70">¿Cómo prefieres alojarte?</p>
              <div className="space-y-2">
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name={`solo-${i}`}
                    checked={choice === "share_same_sex"}
                    onChange={() => onChange(setSoloChoice(roomOf, i, "share_same_sex"))}
                    className="mt-1"
                  />
                  Compartir habitación con otro viajero del grupo, compatible / de mi mismo sexo
                </label>
                {choice === "share_same_sex" ? (
                  <label className="ml-6 block max-w-xs">
                    <span className="mb-1 block text-xs tracking-wide uppercase text-carbon/50">
                      Sexo (para poder buscarte compañero)
                    </span>
                    <input
                      value={travelers[i].sex}
                      onChange={(e) => onSexChange(i, e.target.value)}
                      className="w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm"
                    />
                  </label>
                ) : null}
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name={`solo-${i}`}
                    checked={choice === "single"}
                    onChange={() => onChange(setSoloChoice(roomOf, i, "single"))}
                    className="mt-1"
                  />
                  Habitación individual (+{formatCurrency(singleSupplement, currency)})
                </label>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function RoomSlotSelect({
  occupant,
  partner,
  travelers,
  roomOf,
  onChange,
}: {
  occupant: number;
  partner: number;
  travelers: Traveler[];
  roomOf: RoomChoice[];
  onChange: (next: RoomChoice[]) => void;
}) {
  function name(i: number) {
    const t = travelers[i];
    return `${t.firstName} ${t.lastName}`.trim() || `Viajero ${i + 1}`;
  }

  return (
    <label className="block">
      <span className="sr-only">Persona en esta plaza de la habitación</span>
      <select
        value={occupant}
        onChange={(e) => onChange(pairTravelers(roomOf, Number(e.target.value), partner))}
        className="w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm"
      >
        {travelers.map((_, j) =>
          j === partner ? null : (
            <option key={j} value={j}>
              {name(j)}
            </option>
          )
        )}
      </select>
    </label>
  );
}
