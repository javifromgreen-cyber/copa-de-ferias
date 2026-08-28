"use client";

import { useState } from "react";
import Link from "next/link";
import type { TripStatus } from "@prisma/client";
import { TripPhoto, type PhotoTone } from "@/components/trips/TripPhoto";
import { StatusBadge } from "@/components/trips/StatusBadge";
import { LeadModal } from "@/components/trips/LeadModal";
import { Button, ButtonLink } from "@/components/ui/Button";
import { effectiveStatus } from "@/lib/trips/status";
import { track } from "@/lib/analytics/events";

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
};

function toneFor(status: TripStatus): PhotoTone {
  if (status === "upcoming") return "gray";
  if (status === "completed") return "sepia";
  return "color";
}

function isKnownTeam(name: string) {
  return Boolean(name) && name.trim().toLowerCase() !== "por confirmar";
}

export function TripCard({ trip, showOrigins = false }: { trip: TripCardData; showOrigins?: boolean }) {
  const [modalOpen, setModalOpen] = useState(false);
  const status = effectiveStatus(trip);
  const tone = toneFor(status);
  const hasMatchup = isKnownTeam(trip.homeTeam) && isKnownTeam(trip.awayTeam);

  const canLinkToTrip = trip.published;
  const modalType: "notify" | "waitlist" = status === "sold_out" ? "waitlist" : "notify";

  const photo = (
    <TripPhoto heroImageKey={trip.heroImageKey} tone={tone} className="aspect-[4/3] w-full">
      <StatusBadge status={status} className="absolute top-3 left-3" />
    </TripPhoto>
  );

  return (
    <article className="group flex flex-col overflow-hidden rounded-sm border border-carbon/10 bg-white/40">
      {canLinkToTrip ? (
        <Link href={`/viajes/${trip.slug}`} onClick={() => track("trip_card_view", { tripId: trip.id })}>
          {photo}
        </Link>
      ) : (
        photo
      )}

      <div className="flex flex-1 flex-col gap-3 p-5">
        <div>
          <h3 className="font-display text-xl uppercase">{trip.name}</h3>
          <p className="text-sm text-carbon/70">{trip.subtitle}</p>
        </div>
        {hasMatchup ? (
          <p className="text-sm text-carbon/60">
            {trip.homeTeam} – {trip.awayTeam}
          </p>
        ) : null}

        {showOrigins && trip.origins && trip.origins.length > 0 ? (
          <p className="text-xs text-carbon/50">Salidas desde: {trip.origins.join(" · ")}</p>
        ) : null}

        <div className="mt-auto pt-2">
          {canLinkToTrip && status !== "sold_out" ? (
            <ButtonLink href={`/viajes/${trip.slug}`} variant="secondary" className="w-full">
              Ver viaje
            </ButtonLink>
          ) : (
            <Button variant="secondary" className="w-full" onClick={() => setModalOpen(true)}>
              {status === "sold_out" ? "Lista de espera" : "Avísame"}
            </Button>
          )}
        </div>
      </div>

      <LeadModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        tripId={trip.id}
        tripName={trip.name}
        type={modalType}
      />
    </article>
  );
}
