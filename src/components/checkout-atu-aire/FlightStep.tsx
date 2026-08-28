import { PlaneIcon } from "@/components/icons";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { AtuAireQuote, FlightDaypartPreference, FlightLegView, FlightPreferenceOption } from "@/lib/checkout-atu-aire/types";

function PreferenceGroup({
  legend,
  options,
  selected,
  onSelect,
}: {
  legend: string;
  options: FlightPreferenceOption[];
  selected: FlightDaypartPreference;
  onSelect: (value: FlightDaypartPreference) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-xs font-medium tracking-wide text-carbon/60 uppercase">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const isSelected = selected === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={isSelected}
              disabled={!option.available}
              onClick={() => option.available && onSelect(option.value)}
              className={`rounded-sm border px-4 py-2 text-left text-sm transition-colors ${
                !option.available
                  ? "cursor-not-allowed border-carbon/10 bg-ivory-dark/50 text-carbon/40"
                  : isSelected
                    ? "border-carbon bg-carbon text-ivory"
                    : "border-carbon/20 hover:border-carbon/50"
              }`}
            >
              <span className="block font-medium">{option.label}</span>
              <span className={`block text-xs ${!option.available ? "text-carbon/40" : isSelected ? "text-ivory/70" : "text-carbon/50"}`}>
                {option.available && option.priceFromPerPerson !== null ? `Desde ${formatCurrency(option.priceFromPerPerson)}` : "No disponible"}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function noCompatibleLegsMessage(direction: "ida" | "vuelta", preference: FlightDaypartPreference): string {
  if (preference === "ANY") {
    return direction === "ida"
      ? "No hemos encontrado vuelos de ida compatibles con el horario del partido."
      : "No hemos encontrado vuelos de vuelta compatibles con el horario del partido.";
  }
  const label = preference === "MORNING" ? "por la mañana" : "por la tarde";
  return `No hemos encontrado vuelos de ${direction} ${label} compatibles con el horario del partido. Prueba con cualquier horario.`;
}

// Every card here shows ONLY that leg's own price — never the trip's
// resultant/total, which lives exclusively in the summary sidebar (§9).
function LegList({ legs, selectedId, onSelect }: { legs: FlightLegView[]; selectedId: string | null; onSelect: (legId: string) => void }) {
  return (
    <div className="space-y-2">
      {legs.map((leg) => {
        const isSelected = selectedId === leg.id;
        return (
          <button
            key={leg.id}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onSelect(leg.id)}
            className={`flex w-full flex-wrap items-center justify-between gap-2 rounded-sm border p-4 text-left transition-colors ${
              isSelected ? "border-carbon bg-ivory-dark" : "border-carbon/15 hover:border-carbon/40"
            }`}
          >
            <span className="text-sm">
              <span className="block font-medium">
                {leg.originAirport} → {leg.destinationAirport}
              </span>
              <span className="block text-carbon/60">{formatDate(leg.departure, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
            </span>
            <span className="text-right">
              <span className="block font-display text-lg">{formatCurrency(leg.pricePerPerson)} / persona</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function BlockedFlightSection({ heading, reason }: { heading: string; reason: string }) {
  return (
    <section aria-labelledby="flight-heading" className="rounded-sm border border-stamp/30 bg-stamp/5 p-5">
      <h2 id="flight-heading" className="mb-2 flex items-center gap-2 text-lg font-semibold">
        <PlaneIcon className="h-5 w-5 text-stamp" />
        {heading}
      </h2>
      <p className="text-sm text-carbon/80">{reason}</p>
    </section>
  );
}

/**
 * First of the two sequential flight steps (§10): the customer picks the
 * outbound leg before the return step ever appears. Its preference options
 * and leg list come only from quote.outboundPreferenceOptions/outboundLegs
 * — never touched by anything on the return side (§11).
 */
export function OutboundFlightStep({
  quote,
  preference,
  legId,
  onChangePreference,
  onSelectLeg,
}: {
  quote: AtuAireQuote;
  preference: FlightDaypartPreference;
  legId: string | null;
  onChangePreference: (value: FlightDaypartPreference) => void;
  onSelectLeg: (legId: string) => void;
}) {
  if (quote.flightAvailability.blocked) {
    return <BlockedFlightSection heading="Vuelo de ida" reason={quote.flightAvailability.reason} />;
  }

  return (
    <section aria-labelledby="outbound-flight-heading" className="space-y-4 rounded-sm border border-carbon/15 bg-white p-5">
      <h2 id="outbound-flight-heading" className="flex items-center gap-2 text-lg font-semibold">
        <PlaneIcon className="h-5 w-5 text-carbon/60" />
        Vuelo de ida
      </h2>
      <PreferenceGroup legend="Ida" options={quote.outboundPreferenceOptions} selected={preference} onSelect={onChangePreference} />
      <div>
        <h3 className="mb-2 text-sm font-medium text-carbon/70">Vuelos de ida disponibles</h3>
        {quote.outboundLegs.length === 0 ? (
          <p className="rounded-sm bg-ivory-dark/50 p-3 text-sm text-carbon/70">{noCompatibleLegsMessage("ida", preference)}</p>
        ) : (
          <LegList legs={quote.outboundLegs} selectedId={legId} onSelect={onSelectLeg} />
        )}
      </div>
    </section>
  );
}

/**
 * Second of the two sequential flight steps — only rendered once an
 * outbound leg has been chosen. Same independence guarantee as above, in
 * the other direction: quote.returnPreferenceOptions/returnLegs never
 * depend on the outbound preference or selection (§11).
 */
export function ReturnFlightStep({
  quote,
  preference,
  legId,
  onChangePreference,
  onSelectLeg,
}: {
  quote: AtuAireQuote;
  preference: FlightDaypartPreference;
  legId: string | null;
  onChangePreference: (value: FlightDaypartPreference) => void;
  onSelectLeg: (legId: string) => void;
}) {
  return (
    <section aria-labelledby="return-flight-heading" className="space-y-4 rounded-sm border border-carbon/15 bg-white p-5">
      <h2 id="return-flight-heading" className="flex items-center gap-2 text-lg font-semibold">
        <PlaneIcon className="h-5 w-5 text-carbon/60" />
        Vuelo de vuelta
      </h2>
      <PreferenceGroup legend="Vuelta" options={quote.returnPreferenceOptions} selected={preference} onSelect={onChangePreference} />
      <div>
        <h3 className="mb-2 text-sm font-medium text-carbon/70">Vuelos de vuelta disponibles</h3>
        {quote.returnLegs.length === 0 ? (
          <p className="rounded-sm bg-ivory-dark/50 p-3 text-sm text-carbon/70">{noCompatibleLegsMessage("vuelta", preference)}</p>
        ) : (
          <LegList legs={quote.returnLegs} selectedId={legId} onSelect={onSelectLeg} />
        )}
      </div>
    </section>
  );
}
