import { formatCurrency, formatDate } from "@/lib/utils";
import { PriceTag } from "./PriceTag";
import type { AtuAireQuote, AtuAireSelection } from "@/lib/checkout-atu-aire/types";
import { packageRequiresFlight, packageRequiresHotel } from "@/lib/checkout-atu-aire/packageRequirements";

/**
 * Always visible while the customer has at least chosen a modality —
 * so at every point they know what they've picked and what it currently
 * costs (§23/§24), without having to reach the end of the checkout.
 */
export function SummarySidebar({ quote, selection }: { quote: AtuAireQuote; selection: AtuAireSelection }) {
  const selectedTicket = quote.ticketOptions.find((t) => t.category === selection.ticketCategory);
  const selectedHotel = quote.hotelOptions.find((h) => h.offer.id === selection.hotelOfferId);
  const selectedFlight = quote.flightOffers.find((f) => f.id === selection.flightOfferId);

  return (
    <aside className="rounded-sm border border-carbon/15 bg-ivory-dark/40 p-5" aria-label="Resumen de tu reserva">
      <h2 className="font-display mb-3 text-lg uppercase">Tu viaje</h2>
      <ul className="mb-4 space-y-1 text-sm text-carbon/80">
        {quote.events.map((event) => (
          <li key={event.id}>
            {event.homeTeam} – {event.awayTeam}
            {event.scheduleStatus === "provisional" ? <span className="ml-1 text-xs text-stamp">(provisional)</span> : null}
          </li>
        ))}
      </ul>

      <dl className="mb-4 space-y-3 text-sm">
        {selection.partySize ? (
          <div>
            <dt className="text-xs text-carbon/50 uppercase">Viajeros</dt>
            <dd>{selection.partySize}</dd>
          </div>
        ) : null}
        {selectedTicket ? (
          <div>
            <dt className="text-xs text-carbon/50 uppercase">Entrada</dt>
            <dd>{selectedTicket.category}</dd>
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
        {selection.packageType && packageRequiresFlight(selection.packageType) ? (
          <div>
            <dt className="text-xs text-carbon/50 uppercase">Vuelo</dt>
            <dd>
              {selectedFlight ? (
                <>
                  {selectedFlight.originAirport} → {selectedFlight.destinationAirport}
                  <br />
                  {formatDate(selectedFlight.outboundDeparture, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
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
      </div>
    </aside>
  );
}
