import { formatCurrency } from "@/lib/utils";
import { pairTravelers, setSoloChoice, type RoomChoice } from "@/lib/checkout/rooms";
import { BedIcon } from "@/components/icons";

type Traveler = { firstName: string; lastName: string };

export function RoomAssignmentStep({
  travelers,
  roomOf,
  onChange,
  singleSupplement,
  currency,
}: {
  travelers: Traveler[];
  roomOf: RoomChoice[];
  onChange: (next: RoomChoice[]) => void;
  singleSupplement: number;
  currency: string;
}) {
  function selectValue(i: number): string {
    const r = roomOf[i];
    if (typeof r === "number") return `pair:${r}`;
    return r ?? "";
  }

  function handleChange(i: number, value: string) {
    if (value === "") return;
    if (value.startsWith("pair:")) {
      onChange(pairTravelers(roomOf, i, Number(value.slice(5))));
    } else {
      onChange(setSoloChoice(roomOf, i, value as "single" | "share_same_sex"));
    }
  }

  function name(i: number) {
    const t = travelers[i];
    return `${t.firstName} ${t.lastName}`.trim() || `Viajero ${i + 1}`;
  }

  return (
    <section className="space-y-6">
      <div>
        <h2 className="font-display text-xl uppercase">Habitaciones</h2>
        <p className="mt-1 text-sm text-carbon/60">
          Habitación doble compartida por defecto. Decide quién comparte con quién antes de continuar.
        </p>
      </div>

      <div className="space-y-3">
        {travelers.map((t, i) => {
          const paired = typeof roomOf[i] === "number";
          return (
            <div key={i} className="flex flex-col gap-2 rounded-sm border border-carbon/15 p-4 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm font-medium">{name(i)}</span>
              <label className="sm:w-72">
                <span className="sr-only">Habitación de {name(i)}</span>
                <select
                  value={selectValue(i)}
                  onChange={(e) => handleChange(i, e.target.value)}
                  className="w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm"
                >
                  <option value="" disabled>
                    Selecciona…
                  </option>
                  {travelers.map((_, j) =>
                    j === i ? null : (
                      <option key={j} value={`pair:${j}`}>
                        Comparte con {name(j)}
                      </option>
                    )
                  )}
                  <option value="share_same_sex">Comparte con otro participante (lo asignamos nosotros)</option>
                  <option value="single">Habitación individual (+{formatCurrency(singleSupplement, currency)})</option>
                </select>
              </label>
              {paired ? (
                <span className="text-xs text-carbon/50 sm:hidden">Comparte con {name(roomOf[i] as number)}</span>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="rounded-sm border border-carbon/10 bg-ivory-dark/40 p-4">
        <p className="mb-2 flex items-center gap-2 text-xs font-medium tracking-wide uppercase">
          <BedIcon className="h-4 w-4 shrink-0" />
          Resumen de habitaciones
        </p>
        <RoomSummaryList travelers={travelers} roomOf={roomOf} />
      </div>
    </section>
  );
}

function RoomSummaryList({ travelers, roomOf }: { travelers: Traveler[]; roomOf: RoomChoice[] }) {
  const name = (i: number) => `${travelers[i].firstName} ${travelers[i].lastName}`.trim() || `Viajero ${i + 1}`;
  const seen = new Set<number>();
  const rows: string[] = [];

  travelers.forEach((_, i) => {
    if (seen.has(i)) return;
    const r = roomOf[i];
    if (typeof r === "number") {
      seen.add(i);
      seen.add(r);
      rows.push(`${name(i)} + ${name(r)} — habitación compartida`);
    } else if (r === "single") {
      seen.add(i);
      rows.push(`${name(i)} — habitación individual`);
    } else if (r === "share_same_sex") {
      seen.add(i);
      rows.push(`${name(i)} — comparte con otro participante (por asignar)`);
    } else {
      seen.add(i);
      rows.push(`${name(i)} — pendiente de elegir`);
    }
  });

  return (
    <ul className="space-y-1 text-sm text-carbon/70">
      {rows.map((row, i) => (
        <li key={i}>{row}</li>
      ))}
    </ul>
  );
}
