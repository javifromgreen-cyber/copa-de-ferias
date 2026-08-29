import { formatCurrency, formatDate } from "@/lib/utils";
import { PriceTag } from "./PriceTag";
import type { AtuAireQuote, AtuAireSelection } from "@/lib/checkout-atu-aire/types";
import { packageRequiresFlight, packageRequiresHotel } from "@/lib/checkout-atu-aire/packageRequirements";
import { scheduleStatusBadgeLabel } from "@/lib/checkout-atu-aire/scheduleStatusLabel";

const PREFERENCE_LABELS: Record<string, string> = { ANY: "Cualquier horario", MORNING: "Mañana", AFTERNOON: "Tarde" };

/**
 * Always visible while the customer has at least chosen a modality —
 * so at every point they know what they've picked and what it currently
 * costs (§23/§24), without having to reach the end of the checkout.
 */
export function SummarySidebar({ quote, selection }: { quote: AtuAireQuote; selection: AtuAireSelection }) {
  const selectedHotel = quote.hotelOptions.find((h) => h.offer.id === selection.hotelOfferId);
  const selectedOutboundLeg = quote.outboundLegs.find((l) => l.id === selection.outboundLegId);
  const selectedReturnLeg = quote.returnLegs.find((l) => l.id === selection.returnLegId);
  const selectedOrigin = quote.eligibleOrigins.find((o) => o.iata === selection.originAirport);
  const flightRequired = selection.packageType ? packageRequiresFlight(selection.packageType) : false;

  return (
    <aside className="rounded-sm border border-carbon/15 bg-ivory-dark/40 p-5" aria-label="Resumen de tu reserva">
      <h2 className="font-display mb-3 text-lg uppercase">Tu viaje</h2>
      <ul className="mb-4 space-y-2 text-sm text-carbon/80">
        {quote.events.map((event) => {
          const options = quote.ticketOptionsByEvent[event.id] ?? [];
          const chosenCategory = selection.ticketSelections[event.id] ?? (options.length === 1 ? options[0].category : null);
          return (
            <li key={event.id}>
              <span>
                {event.homeTeam} – {event.awayTeam}
                {scheduleStatusBadgeLabel(event.scheduleStatus) ? (
                  <span className="ml-1 text-xs text-stamp">({scheduleStatusBadgeLabel(event.scheduleStatus)})</span>
                ) : null}
              </span>
              {chosenCategory ? <span className="block text-xs text-carbon/60">Entrada: {chosenCategory}</span> : null}
            </li>
          );
        })}
      </ul>

      <dl className="mb-4 space-y-3 text-sm">
        {selection.partySize ? (
          <div>
            <dt className="text-xs text-carbon/50 uppercase">Viajeros</dt>
            <dd>{selection.partySize}</dd>
          </div>
        ) : null}
        {selection.packageType && packageRequiresHotel(selection.packageType) ? (
          <div>
            <dt className="text-xs text-carbon/50 uppercase">Hotel</dt>
            <dd>
              {selection.nights ? `${selection.nights} noche${selection.nights > 1 ? "s" : ""}` : "Sin elegir"}
              {selectedHotel ? ` · ${selectedHotel.offer.name}` : ""}
            </dd>
          </div>
        ) : null}
        {flightRequired ? (
          <div>
            <dt className="text-xs text-carbon/50 uppercase">Salida</dt>
            <dd>{selectedOrigin ? `${selectedOrigin.city} (${selectedOrigin.iata})` : "Sin elegir"}</dd>
          </div>
        ) : null}
        {flightRequired && selectedOrigin ? (
          <div>
            <dt className="text-xs text-carbon/50 uppercase">Preferencia ida</dt>
            <dd>{PREFERENCE_LABELS[selection.outboundPreference]}</dd>
          </div>
        ) : null}
        {flightRequired ? (
          <div>
            <dt className="text-xs text-carbon/50 uppercase">Vuelo de ida</dt>
            <dd>
              {selectedOutboundLeg ? (
                <>
                  {selectedOutboundLeg.originAirport} → {selectedOutboundLeg.destinationAirport}
                  <br />
                  {formatDate(selectedOutboundLeg.departure, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </>
              ) : quote.flightAvailability.blocked ? (
                "Pendiente de horario"
              ) : (
                "Sin elegir"
              )}
            </dd>
          </div>
        ) : null}
        {flightRequired && selectedOrigin ? (
          <div>
            <dt className="text-xs text-carbon/50 uppercase">Preferencia vuelta</dt>
            <dd>{PREFERENCE_LABELS[selection.returnPreference]}</dd>
          </div>
        ) : null}
        {flightRequired ? (
          <div>
            <dt className="text-xs text-carbon/50 uppercase">Vuelo de vuelta</dt>
            <dd>
              {selectedReturnLeg ? (
                <>
                  {selectedReturnLeg.originAirport} → {selectedReturnLeg.destinationAirport}
                  <br />
                  {formatDate(selectedReturnLeg.departure, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </>
              ) : quote.flightAvailability.blocked ? (
                "Pendiente de horario"
              ) : (
                "Sin elegir"
              )}
            </dd>
          </div>
        ) : null}
      </dl>

      {quote.additionalMatchFeeApplies ? <p className="mb-3 text-xs text-carbon/60">Incluye el fee por partido adicional ({quote.events.length} partidos).</p> : null}

      <div className="border-t border-carbon/10 pt-3">
        <PriceTag label={quote.price.label} amount={quote.price.totalCommercial ?? quote.price.perPerson} perPerson={quote.price.totalCommercial === null} size="lg" />
        {quote.price.totalCommercial !== null && selection.partySize && selection.partySize > 1 ? (
          <p className="text-sm text-carbon/60">{formatCurrency(quote.price.perPerson ?? 0)} / persona</p>
        ) : null}
        {quote.price.missing.length > 0 ? <p className="mt-2 text-xs text-carbon/50">Falta por elegir: {quote.price.missing.join(", ")}.</p> : null}

        {quote.price.breakdown.length > 0 ? (
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer list-none text-xs text-carbon/50 underline">Ver detalle</summary>
            <dl className="mt-2 space-y-1.5">
              {quote.price.breakdown.map((item) => (
                <div key={item.label} className="flex items-center justify-between">
                  <dt className="text-carbon/70">{item.label}</dt>
                  <dd className="font-medium">{formatCurrency(item.amount)}</dd>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-carbon/10 pt-1.5 font-display">
                <dt>Total</dt>
                <dd>{formatCurrency(quote.price.totalCommercial ?? 0)}</dd>
              </div>
            </dl>
          </details>
        ) : null}
      </div>
    </aside>
  );
}
