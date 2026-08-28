import { ButtonLink } from "@/components/ui/Button";
import { WaitlistCta } from "@/components/trips/WaitlistCta";
import { CheckIcon } from "@/components/icons";
import { formatCurrency } from "@/lib/utils";
import { isKnownTeamName } from "@/lib/trips/status";
import { scheduleStatusPublicLabel } from "@/lib/catalog/labels";
import type { ScheduleStatus, TripStatus } from "@prisma/client";

// Always-3-modalities (§76): checkout always offers these three, never a
// promise that flight/hotel is available for every origin — that's
// resolved per-traveler inside the checkout itself.
const ATU_AIRE_OPTIONS = ["Entrada", "Entrada + Hotel", "Entrada + Hotel + Vuelo"];

// Deliberately generic (§14/§15) — no provider name, no "mejor precio"/
// "más barato que X" superlative.
const TRUST_BULLETS = [
  "Entrada gestionada por proveedores oficiales de ticketing deportivo.",
  "Pago único y seguro al reservar, sin depósitos posteriores.",
  "Hotel y vuelo, si los añades, con partners especializados en viajes de fútbol.",
];

type PanelTrip = {
  id: string;
  slug: string;
  name: string;
  subtitle: string;
  homeTeam: string;
  awayTeam: string;
  stadium: string;
  city: string;
  price: number;
  currency: string;
  scheduleStatus: ScheduleStatus;
  origins: { city: string }[];
};

export function CommercialPanel({
  trip,
  status,
  isAtuAire,
  fromPrice,
  competitionName,
}: {
  trip: PanelTrip;
  status: TripStatus;
  isAtuAire: boolean;
  fromPrice: number | null;
  competitionName: string | null;
}) {
  const hasMatchup = isKnownTeamName(trip.homeTeam) && isKnownTeamName(trip.awayTeam);
  const matchTitle = hasMatchup ? `${trip.homeTeam} – ${trip.awayTeam}` : trip.name;
  const schedule = scheduleStatusPublicLabel(trip.scheduleStatus);

  return (
    <div className="rounded-sm border border-carbon/15 p-6">
      <p className="text-xs font-medium tracking-[0.2em] text-carbon/50 uppercase">{competitionName ?? trip.subtitle}</p>
      <h1 className="font-display mt-1 text-2xl uppercase sm:text-3xl">{matchTitle}</h1>
      <p className="mt-1 text-sm text-carbon/60">
        {trip.stadium}
        {trip.city ? `, ${trip.city}` : ""}
      </p>
      {hasMatchup && trip.subtitle ? <p className="mt-3 text-sm text-carbon/70">{trip.subtitle}</p> : null}

      <p className={`mt-3 flex items-center gap-1.5 text-xs ${schedule.confirmed ? "text-carbon/50" : "text-cement"}`}>
        {schedule.confirmed ? <CheckIcon className="h-3.5 w-3.5 shrink-0" /> : null}
        {schedule.text}
      </p>

      {isAtuAire ? (
        <>
          <p className="mt-6 mb-2 text-xs font-semibold tracking-widest text-carbon uppercase">Puedes reservar</p>
          <ul className="space-y-1.5 text-sm text-carbon/80">
            {ATU_AIRE_OPTIONS.map((opt) => (
              <li key={opt} className="flex items-center gap-2">
                <CheckIcon className="h-4 w-4 shrink-0 text-carbon/50" />
                {opt}
              </li>
            ))}
          </ul>

          <div className="mt-6 border-t border-carbon/10 pt-6">
            {fromPrice !== null ? (
              <>
                <p className="text-xs font-medium tracking-wide text-carbon/50 uppercase">Desde</p>
                <p className="font-display text-3xl">{formatCurrency(fromPrice, trip.currency)}</p>
                <p className="mb-4 text-sm text-carbon/50">/ persona</p>
              </>
            ) : (
              <p className="mb-4 text-sm text-carbon/60">Precio disponible próximamente.</p>
            )}

            {status === "open" ? (
              <>
                <ButtonLink href={`/viajes/${trip.slug}/reservar`} className="w-full justify-center">
                  Configurar mi viaje
                </ButtonLink>
                <p className="mt-3 text-center text-xs text-carbon/50">
                  También puedes reservar únicamente la entrada, sin hotel ni vuelo.
                </p>
              </>
            ) : status === "sold_out" ? (
              <WaitlistCta tripId={trip.id} tripName={matchTitle} />
            ) : (
              <p className="text-sm text-carbon/60">Este partido ya se jugó.</p>
            )}
          </div>

          <ul className="mt-6 space-y-2 border-t border-carbon/10 pt-6 text-xs text-carbon/60">
            {TRUST_BULLETS.map((bullet) => (
              <li key={bullet} className="flex items-start gap-2">
                <CheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {bullet}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="mt-6 border-t border-carbon/10 pt-6">
          <p className="font-display text-3xl">{formatCurrency(trip.price, trip.currency)}</p>
          <p className="mb-4 text-sm text-carbon/50">por persona</p>
          {status === "open" ? (
            <ButtonLink href={`/viajes/${trip.slug}/reservar`} className="w-full justify-center">
              Reservar plaza
            </ButtonLink>
          ) : status === "sold_out" ? (
            <WaitlistCta tripId={trip.id} tripName={matchTitle} />
          ) : (
            <p className="text-sm text-carbon/60">Este viaje ya se realizó.</p>
          )}
        </div>
      )}

      {trip.origins.length > 0 ? (
        <p className="mt-4 text-xs text-carbon/50">Salidas desde: {trip.origins.map((o) => o.city).join(" · ")}</p>
      ) : null}
    </div>
  );
}
