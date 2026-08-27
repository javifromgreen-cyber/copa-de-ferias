import { formatCurrency } from "@/lib/utils";
import { computeRooms, type RoomChoice } from "@/lib/checkout/rooms";

type ReviewTraveler = { firstName: string; lastName: string; originCity: string };

/**
 * Mandatory review screen before payment (checkout §27) — a compact
 * summary, not a re-run of the trip landing page: travelers with their
 * individual origin, how rooms ended up organized, a short what's-included
 * list, and the final price breakdown. Back/Continuar live in the shared
 * CheckoutFlow nav bar, not here.
 */
export function ReviewStep({
  tripName,
  tripSubtitle,
  hotelStars,
  ticketCategory,
  hasInsurance,
  price,
  singleSupplement,
  currency,
  travelers,
  roomOf,
  singleRooms,
  total,
}: {
  tripName: string;
  tripSubtitle: string;
  hotelStars: number;
  ticketCategory: string;
  hasInsurance: boolean;
  price: number;
  singleSupplement: number;
  currency: string;
  travelers: ReviewTraveler[];
  roomOf: RoomChoice[];
  singleRooms: number;
  total: number;
}) {
  const { pairs, unpaired } = computeRooms(roomOf);
  const name = (i: number) => `${travelers[i].firstName} ${travelers[i].lastName}`.trim() || `Viajero ${i + 1}`;
  const baseSubtotal = price * travelers.length;
  const supplementSubtotal = singleSupplement * singleRooms;

  return (
    <section className="space-y-8">
      <div>
        <h2 className="font-display text-xl uppercase">Revisar reserva</h2>
        <p className="mt-1 text-sm text-carbon/60">
          {tripName} — {tripSubtitle}. Última comprobación antes de pagar; puedes volver atrás y cambiar cualquier dato.
        </p>
      </div>

      <div>
        <p className="mb-3 text-xs font-medium tracking-wide uppercase text-carbon/60">Viajeros</p>
        <ul className="space-y-2 text-sm">
          {travelers.map((t, i) => (
            <li key={i} className="flex items-center justify-between border-b border-carbon/10 pb-2">
              <span>{name(i)}</span>
              <span className="text-carbon/60">Salida: {t.originCity || "—"}</span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <p className="mb-3 text-xs font-medium tracking-wide uppercase text-carbon/60">Habitaciones</p>
        <ul className="space-y-2 text-sm text-carbon/80">
          {pairs.map(([a, b], i) => (
            <li key={i}>
              Habitación {i + 1}: {name(a)} + {name(b)}
            </li>
          ))}
          {unpaired.map((i) => (
            <li key={i}>
              {name(i)}:{" "}
              {roomOf[i] === "single"
                ? `habitación individual (+${formatCurrency(singleSupplement, currency)})`
                : "compartirá con otro participante del grupo — asignación pendiente"}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <p className="mb-3 text-xs font-medium tracking-wide uppercase text-carbon/60">Viaje</p>
        <ul className="space-y-1 text-sm text-carbon/70">
          <li>Transporte incluido</li>
          <li>Hotel {hotelStars}★</li>
          <li>{ticketCategory ? `Entrada — ${ticketCategory}` : "Entrada al partido incluida"}</li>
          {hasInsurance ? <li>Seguro de asistencia incluido</li> : null}
        </ul>
      </div>

      <div className="rounded-sm border border-carbon/15 p-4">
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt>
              {travelers.length} × {formatCurrency(price, currency)}
            </dt>
            <dd>{formatCurrency(baseSubtotal, currency)}</dd>
          </div>
          {singleRooms > 0 ? (
            <div className="flex justify-between">
              <dt>Habitación individual</dt>
              <dd>+{formatCurrency(supplementSubtotal, currency)}</dd>
            </div>
          ) : null}
        </dl>
        <div className="mt-3 flex justify-between border-t border-carbon/15 pt-3 text-base font-semibold">
          <span>Total</span>
          <span>{formatCurrency(total, currency)}</span>
        </div>
      </div>
    </section>
  );
}
