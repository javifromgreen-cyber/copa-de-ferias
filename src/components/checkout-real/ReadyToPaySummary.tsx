import { Button } from "@/components/ui/Button";
import type { FinalQuoteSnapshot } from "@/lib/checkout-saga/finalQuoteSnapshot";
import type { RoomType } from "@/lib/pricing/roomMix";
import { COUNTRIES } from "@/lib/checkout-atu-aire/countries";

const ROOM_TYPE_LABEL: Record<RoomType, string> = { single: "individual", double: "doble", triple: "triple" };

function countryName(code: string): string {
  return COUNTRIES.find((c) => c.code === code)?.name ?? code;
}

/**
 * Fase 2.5 §16/§17/§22 — the real READY_TO_PAY screen. Shown both right
 * after CONTINUAR (client-driven, inside RealCheckoutPrototype) and when
 * resuming from a refresh via ?attempt=<accessToken> (server-rendered
 * directly from getReadyToPayView — see reservar-real/page.tsx). No
 * hooks/interactivity here beyond the disabled Pagar button, so this
 * component works unchanged in both a Server Component tree and inside a
 * Client Component.
 *
 * §16 — deliberately never renders costNet, provider margin, orgFee, or
 * any internal buffer: only the fields a customer is meant to see.
 */
export function ReadyToPaySummary({
  tripName,
  matchLabel,
  snapshot,
  travelers,
  travelOriginCountry,
}: {
  tripName: string;
  matchLabel: string;
  snapshot: FinalQuoteSnapshot;
  travelers: { firstName: string; lastName: string }[];
  /** Fase 2.6 §5 — "¿Desde qué país viajas?", persisted on CheckoutAttempt (never a traveler's nationality). */
  travelOriginCountry?: string;
}) {
  const ticket = snapshot.ticket[0];
  return (
    <div data-testid="ready-to-pay" className="max-w-xl space-y-6 border border-carbon/20 p-6">
      <h2 className="font-display text-2xl uppercase">Listo para pagar</h2>

      <section className="space-y-1 text-sm">
        <h3 className="font-semibold uppercase text-carbon/60">Partido</h3>
        <p>{tripName}</p>
        <p className="text-carbon/70">{matchLabel}</p>
        {ticket && (
          <p className="text-carbon/70">
            Entrada: {ticket.category} × {ticket.quantity}
          </p>
        )}
        {travelOriginCountry && <p className="text-carbon/70">Viajas desde: {countryName(travelOriginCountry)}</p>}
      </section>

      {snapshot.hotel && (
        <section className="space-y-1 border-t border-carbon/10 pt-4 text-sm">
          <h3 className="font-semibold uppercase text-carbon/60">Hotel</h3>
          <p>{snapshot.hotel.name}</p>
          <p className="text-carbon/70">
            {snapshot.hotel.checkIn} → {snapshot.hotel.checkOut}
          </p>
          <p className="text-carbon/70">Habitaciones: {snapshot.hotel.roomMix.map((m) => `${m.count} × ${ROOM_TYPE_LABEL[m.type]}`).join(", ")}</p>
          {snapshot.hotel.excludedTaxesAndFees.length > 0 && (
            <p className="text-carbon/70">
              Tasas a pagar en destino: {snapshot.hotel.excludedTaxesAndFees.map((t) => `${t.description} (${t.amount.toFixed(2)} ${t.currency})`).join(", ")}
            </p>
          )}
          <p className="text-carbon/70">{snapshot.hotel.refundable ? "Cancelación gratuita" : "No reembolsable"}</p>
        </section>
      )}

      {snapshot.flight && (
        <section className="space-y-1 border-t border-carbon/10 pt-4 text-sm">
          <h3 className="font-semibold uppercase text-carbon/60">Vuelo</h3>
          <p className="text-carbon/70">
            Ida: {snapshot.flight.outbound.segments[0]?.originAirport} → {snapshot.flight.outbound.segments[snapshot.flight.outbound.segments.length - 1]?.destinationAirport} (
            {snapshot.flight.outbound.segments[0]?.carrier})
          </p>
          <p className="text-carbon/70">
            Vuelta: {snapshot.flight.return.segments[0]?.originAirport} → {snapshot.flight.return.segments[snapshot.flight.return.segments.length - 1]?.destinationAirport} (
            {snapshot.flight.return.segments[0]?.carrier})
          </p>
          <p className="text-carbon/70">
            {snapshot.flight.commercialProduct.outbound.fareBrandName ?? "Tarifa estándar"} ·{" "}
            {snapshot.flight.commercialProduct.outbound.baggage?.checkedIncluded ? "Equipaje facturado incluido" : "Sin equipaje facturado incluido"}
          </p>
        </section>
      )}

      <section className="space-y-1 border-t border-carbon/10 pt-4 text-sm">
        <h3 className="font-semibold uppercase text-carbon/60">Viajeros</h3>
        {travelers.map((t, i) => (
          <p key={i} className="text-carbon/70">
            {t.firstName} {t.lastName}
          </p>
        ))}
      </section>

      <dl className="space-y-2 border-t border-carbon/10 pt-4 text-sm">
        {snapshot.flight && (
          <div className="flex justify-between">
            <dt className="text-carbon/70">Vuelo ida y vuelta</dt>
            <dd>
              {snapshot.flight.pricePerPerson.toFixed(2)} {snapshot.flight.currency}/persona
            </dd>
          </div>
        )}
        <div className="flex justify-between border-t border-carbon/20 pt-2 font-semibold">
          <dt>Total</dt>
          <dd data-testid="pvp-total">
            {snapshot.commercial.pvpTotal.toFixed(2)} {snapshot.commercial.currency}
          </dd>
        </div>
        <div className="flex justify-between text-carbon/70">
          <dt>Por persona</dt>
          <dd>
            {snapshot.commercial.pvpPerPerson.toFixed(2)} {snapshot.commercial.currency}
          </dd>
        </div>
      </dl>

      <Button disabled title="Pago todavía no disponible en sandbox">
        Pagar {snapshot.commercial.pvpTotal.toFixed(2)} {snapshot.commercial.currency} — pago todavía no disponible en sandbox
      </Button>
    </div>
  );
}
