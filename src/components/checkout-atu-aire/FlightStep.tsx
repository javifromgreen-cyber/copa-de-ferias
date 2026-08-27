import { PlaneIcon } from "@/components/icons";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { AtuAireQuote, FlightDaypartPreference } from "@/lib/checkout-atu-aire/types";

function PreferenceGroup({
  legend,
  options,
  selected,
  onSelect,
}: {
  legend: string;
  options: { value: FlightDaypartPreference; label: string; priceFromPerPerson: number | null }[];
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
              onClick={() => onSelect(option.value)}
              className={`rounded-sm border px-4 py-2 text-left text-sm transition-colors ${
                isSelected ? "border-carbon bg-carbon text-ivory" : "border-carbon/20 hover:border-carbon/50"
              }`}
            >
              <span className="block font-medium">{option.label}</span>
              <span className={`block text-xs ${isSelected ? "text-ivory/70" : "text-carbon/50"}`}>
                {option.priceFromPerPerson !== null ? `Desde ${formatCurrency(option.priceFromPerPerson)}` : "Sin vuelos"}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function noCompatibleFlightsMessage(outbound: FlightDaypartPreference, ret: FlightDaypartPreference): string {
  const labels: Record<FlightDaypartPreference, string> = { ANY: "cualquier horario", MORNING: "mañana", AFTERNOON: "tarde" };
  if (outbound === "ANY" && ret === "ANY") {
    return "No hemos encontrado vuelos compatibles con el horario del partido.";
  }
  const legs: string[] = [];
  if (outbound !== "ANY") legs.push(`ida por la ${labels[outbound]}`);
  if (ret !== "ANY") legs.push(`vuelta por la ${labels[ret]}`);
  return `No hemos encontrado vuelos de ${legs.join(" y ")} compatibles con el horario del partido. Prueba con cualquier horario.`;
}

export function FlightStep({
  quote,
  outboundPreference,
  returnPreference,
  flightOfferId,
  onChangeOutbound,
  onChangeReturn,
  onSelectFlight,
}: {
  quote: AtuAireQuote;
  outboundPreference: FlightDaypartPreference;
  returnPreference: FlightDaypartPreference;
  flightOfferId: string | null;
  onChangeOutbound: (value: FlightDaypartPreference) => void;
  onChangeReturn: (value: FlightDaypartPreference) => void;
  onSelectFlight: (offerId: string) => void;
}) {
  if (quote.flightAvailability.blocked) {
    return (
      <section aria-labelledby="flight-heading" className="rounded-sm border border-stamp/30 bg-stamp/5 p-5">
        <h2 id="flight-heading" className="mb-2 flex items-center gap-2 text-lg font-semibold">
          <PlaneIcon className="h-5 w-5 text-stamp" />
          Vuelo
        </h2>
        <p className="text-sm text-carbon/80">{quote.flightAvailability.reason}</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="flight-heading" className="space-y-4 rounded-sm border border-carbon/15 bg-white p-5">
      <h2 id="flight-heading" className="flex items-center gap-2 text-lg font-semibold">
        <PlaneIcon className="h-5 w-5 text-carbon/60" />
        Preferencias de vuelo
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <PreferenceGroup legend="Ida" options={quote.outboundPreferenceOptions} selected={outboundPreference} onSelect={onChangeOutbound} />
        <PreferenceGroup legend="Vuelta" options={quote.returnPreferenceOptions} selected={returnPreference} onSelect={onChangeReturn} />
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium text-carbon/70">Vuelos disponibles</h3>
        {quote.flightOffers.length === 0 ? (
          <p className="rounded-sm bg-ivory-dark/50 p-3 text-sm text-carbon/70">{noCompatibleFlightsMessage(outboundPreference, returnPreference)}</p>
        ) : (
          <div className="space-y-2">
            {quote.flightOffers.map((offer) => {
              const isSelected = flightOfferId === offer.id;
              return (
                <button
                  key={offer.id}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => onSelectFlight(offer.id)}
                  className={`flex w-full flex-wrap items-center justify-between gap-2 rounded-sm border p-4 text-left transition-colors ${
                    isSelected ? "border-carbon bg-ivory-dark" : "border-carbon/15 hover:border-carbon/40"
                  }`}
                >
                  <span className="text-sm">
                    <span className="block font-medium">
                      {offer.originAirport} → {offer.destinationAirport}
                    </span>
                    <span className="block text-carbon/60">
                      Ida: {formatDate(offer.outboundDeparture, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} — Vuelta:{" "}
                      {formatDate(offer.returnDeparture, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </span>
                  <span className="font-display text-lg">{formatCurrency(offer.pricePerPerson)} / persona</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
