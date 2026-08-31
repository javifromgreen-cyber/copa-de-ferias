import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { getTripBySlug } from "@/lib/trips/queries";
import { getRealCheckoutTicketOptions } from "@/server/actions/prepare-checkout-attempt";
import { RealCheckoutPrototype } from "@/components/checkout-real/RealCheckoutPrototype";

// Fase 2 §24/§25 — the NEW real pre-payment saga's own route, deliberately
// separate from /reservar (the legacy demo flow, untouched — see
// atu-aire-booking.ts's own doc comment). Not linked from public
// navigation yet; reachable directly for this phase's own verification
// and e2e coverage. Must reflect live ticket availability.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Reservar (real)" };

export default async function ReservarRealPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const trip = await getTripBySlug(slug);
  if (!trip || !trip.published || trip.travelMode !== "A_TU_AIRE") notFound();

  const ticketOptions = await getRealCheckoutTicketOptions(slug);

  return (
    <Container className="py-10 sm:py-14">
      <h1 className="font-display mb-8 text-3xl uppercase sm:text-4xl">
        {trip.name} — {trip.subtitle}
      </h1>
      <RealCheckoutPrototype tripSlug={slug} ticketOptions={ticketOptions} />
    </Container>
  );
}
