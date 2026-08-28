"use client";

import { useState } from "react";
import Link from "next/link";
import type { TripStatus, ScheduleStatus } from "@prisma/client";
import { TripPhoto, type PhotoTone } from "@/components/trips/TripPhoto";
import { StatusBadge } from "@/components/trips/StatusBadge";
import { LeadModal } from "@/components/trips/LeadModal";
import { Button, ButtonLink } from "@/components/ui/Button";
import { CheckIcon } from "@/components/icons";
import { effectiveStatus, isKnownTeamName } from "@/lib/trips/status";
import { scheduleStatusPublicLabel } from "@/lib/catalog/labels";
import { track } from "@/lib/analytics/events";
import { formatCurrency, formatDate, cn } from "@/lib/utils";

export type TripCardData = {
  id: string;
  slug: string;
  number: number;
  name: string;
  subtitle: string;
  homeTeam: string;
  awayTeam: string;
  status: TripStatus;
  published: boolean;
  maxSpots: number;
  soldSpots: number;
  heroImageKey: string;
  origins?: string[];
  matchDate: Date;
  scheduleStatus: ScheduleStatus;
  /** null when no Event on this trip has a Competition assigned yet. */
  competitionName: string | null;
  /** Cheapest real TICKET_ONLY price — never hotel/flight (§7). null only when no active offer exists yet. */
  fromPricePerPerson: number | null;
  currency: string;
};

function toneFor(status: TripStatus): PhotoTone {
  if (status === "upcoming") return "gray";
  if (status === "completed") return "sepia";
  return "color";
}

/**
 * The match card, everywhere it appears (Home destacados/próximos, /viajes
 * catálogo). Photo-forward, the matchup itself is the headline — not the
 * trip/product name — per §2/§4: the customer is looking for "Arsenal –
 * Tottenham", not "a trip to London". Never shows a discount/strikethrough
 * price (§5) or a capacity/plazas count (still the case here — none of
 * maxSpots/soldSpots is ever rendered, only used for the `sold_out`
 * waitlist branch below).
 */
export function TripCard({ trip, showOrigins = false, compact = false }: { trip: TripCardData; showOrigins?: boolean; compact?: boolean }) {
  const [modalOpen, setModalOpen] = useState(false);
  const status = effectiveStatus(trip);
  const tone = toneFor(status);
  const hasMatchup = isKnownTeamName(trip.homeTeam) && isKnownTeamName(trip.awayTeam);
  const schedule = scheduleStatusPublicLabel(trip.scheduleStatus);

  const canLinkToTrip = trip.published;
  const modalType: "notify" | "waitlist" = status === "sold_out" ? "waitlist" : "notify";

  const dateLabel = schedule.confirmed
    ? `${formatDate(trip.matchDate, { day: "numeric", month: "short" })} · ${formatDate(trip.matchDate, { hour: "2-digit", minute: "2-digit" })}`
    : formatDate(trip.matchDate, { day: "numeric", month: "short", year: "numeric" });

  const photo = (
    <TripPhoto heroImageKey={trip.heroImageKey} tone={tone} className={cn("aspect-[4/3] w-full", !compact && "sm:aspect-[16/10]")}>
      <StatusBadge status={status} className="absolute top-3 left-3" />
    </TripPhoto>
  );

  return (
    <article className="group flex flex-col overflow-hidden rounded-sm border border-carbon/10 bg-white/40 transition-shadow hover:shadow-[0_8px_28px_-12px_rgba(27,25,18,0.35)]">
      {canLinkToTrip ? (
        <Link href={`/viajes/${trip.slug}`} onClick={() => track("trip_card_view", { tripId: trip.id })} aria-label={`Ver partido ${hasMatchup ? `${trip.homeTeam} – ${trip.awayTeam}` : trip.name}`}>
          {photo}
        </Link>
      ) : (
        photo
      )}

      <div className={cn("flex flex-1 flex-col gap-2.5", compact ? "p-4" : "p-5")}>
        <div>
          <h3 className={cn("font-display uppercase", compact ? "text-lg" : "text-xl")}>{hasMatchup ? `${trip.homeTeam} – ${trip.awayTeam}` : trip.name}</h3>
          {hasMatchup ? (
            <p className="text-xs text-carbon/50">
              {trip.name} · {trip.subtitle}
            </p>
          ) : trip.subtitle ? (
            <p className="text-sm text-carbon/70">{trip.subtitle}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-carbon/70">
          <span>{dateLabel}</span>
          {trip.competitionName ? (
            <>
              <span aria-hidden className="text-carbon/30">
                ·
              </span>
              <span>{trip.competitionName}</span>
            </>
          ) : null}
        </div>

        <p className={cn("flex items-center gap-1 text-xs", schedule.confirmed ? "text-carbon/50" : "text-cement")}>
          {schedule.confirmed ? <CheckIcon className="h-3 w-3 shrink-0" /> : null}
          {schedule.text}
        </p>

        {showOrigins && trip.origins && trip.origins.length > 0 ? (
          <p className="text-xs text-carbon/50">Salidas desde: {trip.origins.join(" · ")}</p>
        ) : null}

        <div className="mt-auto flex items-center justify-between gap-3 pt-2">
          <div>
            {trip.fromPricePerPerson !== null ? (
              <>
                <span className="block text-[10px] tracking-[0.15em] text-carbon/50 uppercase">Desde</span>
                <span className="font-display text-lg">{formatCurrency(trip.fromPricePerPerson, trip.currency)}</span>
              </>
            ) : (
              <span className="text-xs text-carbon/50">Precio disponible próximamente</span>
            )}
          </div>

          {canLinkToTrip && status !== "sold_out" ? (
            <ButtonLink href={`/viajes/${trip.slug}`} variant="secondary">
              Ver partido
            </ButtonLink>
          ) : (
            <Button variant="secondary" onClick={() => setModalOpen(true)}>
              {status === "sold_out" ? "Lista de espera" : "Avísame"}
            </Button>
          )}
        </div>
      </div>

      <LeadModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        tripId={trip.id}
        tripName={hasMatchup ? `${trip.homeTeam} – ${trip.awayTeam}` : trip.name}
        type={modalType}
      />
    </article>
  );
}
