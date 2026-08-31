import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { getTripBySlug } from "@/lib/trips/queries";
import { getRealCheckoutTicketOptions } from "@/server/actions/prepare-checkout-attempt";
import { RealCheckoutPrototype } from "@/components/checkout-real/RealCheckoutPrototype";
import { ReadyToPaySummary } from "@/components/checkout-real/ReadyToPaySummary";
import { getReadyToPayView } from "@/lib/checkout-saga/resumeCheckoutAttempt";

// Fase 2 §24/§25, extended in Fase 2.5 §23 — the NEW real pre-payment
// saga's own route, deliberately separate from /reservar (the legacy
// demo flow, untouched — see atu-aire-booking.ts's own doc comment). Not
// linked from public navigation yet; reachable directly for this phase's
// own verification and e2e coverage. Must reflect live ticket
// availability. `noindex` while it's a development route with no real
// payment behind it — see the metadata export below.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Reservar (real)", robots: { index: false, follow: false } };

function matchLabelFor(trip: { events: { homeTeam: string; awayTeam: string; matchDate: Date }[] }): string {
  const event = trip.events[0];
  if (!event) return "";
  return `${event.homeTeam} vs ${event.awayTeam} — ${event.matchDate.toLocaleDateString("es-ES")}`;
}

export default async function ReservarRealPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ attempt?: string }> }) {
  const { slug } = await params;
  const { attempt } = await searchParams;
  const trip = await getTripBySlug(slug);
  if (!trip || !trip.published || trip.travelMode !== "A_TU_AIRE") notFound();

  // §22 — a page refresh at READY_TO_PAY carries ?attempt=<accessToken>;
  // when it resolves to a genuine, still-current READY_TO_PAY attempt,
  // the summary is reconstructed entirely from persisted server-side
  // state — never from browser/React state, which a refresh discards.
  if (attempt) {
    const view = await getReadyToPayView(attempt);
    if (view) {
      return (
        <Container className="py-10 sm:py-14">
          <h1 className="font-display mb-8 text-3xl uppercase sm:text-4xl">
            {trip.name} — {trip.subtitle}
          </h1>
          <ReadyToPaySummary tripName={trip.name} matchLabel={matchLabelFor(trip)} snapshot={view.finalQuoteSnapshot} travelers={view.travelers} />
        </Container>
      );
    }
  }

  const ticketOptions = await getRealCheckoutTicketOptions(slug);

  return (
    <Container className="py-10 sm:py-14">
      <h1 className="font-display mb-8 text-3xl uppercase sm:text-4xl">
        {trip.name} — {trip.subtitle}
      </h1>
      <RealCheckoutPrototype tripSlug={slug} tripName={trip.name} matchLabel={matchLabelFor(trip)} ticketOptions={ticketOptions} />
    </Container>
  );
}
