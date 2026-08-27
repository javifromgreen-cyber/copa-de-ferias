import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { getTripBySlug } from "@/lib/trips/queries";
import { effectiveStatus, spotsLeft } from "@/lib/trips/status";
import { CheckoutFlow } from "@/components/checkout/CheckoutFlow";
import { AtuAireCheckout } from "@/components/checkout-atu-aire/AtuAireCheckout";
import { isDemoMode } from "@/lib/env";
import { parseRequiredFields } from "@/lib/checkout/travelerFields";

// Must reflect live spots-left at the moment checkout starts.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Reservar plaza" };

export default async function ReservarPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const trip = await getTripBySlug(slug);
  if (!trip || !trip.published) notFound();

  // A_TU_AIRE has its own progressive checkout — party size isn't a fixed
  // "plazas restantes" pool the way GROUP_CDF's is, so none of the
  // open/spots-left gating below applies to it.
  if (trip.travelMode === "A_TU_AIRE") {
    return (
      <Container className="py-10 sm:py-14">
        <p className="font-display mb-2 text-xs tracking-[0.25em] text-cement uppercase">
          Viaje #{String(trip.number).padStart(3, "0")}
        </p>
        <h1 className="font-display mb-8 text-3xl uppercase sm:text-4xl">
          {trip.name} — {trip.subtitle}
        </h1>
        <AtuAireCheckout tripSlug={trip.slug} />
      </Container>
    );
  }

  const status = effectiveStatus(trip);
  const left = spotsLeft(trip);

  if (status !== "open" || left <= 0) {
    return (
      <Container className="py-20 text-center">
        <h1 className="font-display mb-4 text-3xl uppercase">Este viaje ya no admite reservas</h1>
        <p className="text-carbon/70">Vuelve a la ficha del viaje para ver su estado actual.</p>
      </Container>
    );
  }

  return (
    <Container className="py-10 sm:py-14">
      <p className="font-display mb-2 text-xs tracking-[0.25em] text-cement uppercase">
        Viaje #{String(trip.number).padStart(3, "0")}
      </p>
      <h1 className="font-display mb-8 text-3xl uppercase sm:text-4xl">
        Reservar — {trip.name}, {trip.subtitle}
      </h1>

      <CheckoutFlow
        trip={{
          id: trip.id,
          slug: trip.slug,
          name: trip.name,
          subtitle: trip.subtitle,
          price: trip.price,
          currency: trip.currency,
          singleSupplement: trip.singleSupplement,
          spotsLeft: left,
          isDemo: trip.isDemo,
          origins: trip.origins.map((o) => o.city),
          requiredTravelerFields: parseRequiredFields(trip.requiredTravelerFields),
          requiresShippingAddress: trip.requiresShippingAddress,
          hotelStars: trip.hotelStars,
          ticketCategory: trip.ticketCategory,
          hasInsurance: Boolean(trip.insuranceDescription),
        }}
        isSimulation={isDemoMode() || trip.isDemo}
      />
    </Container>
  );
}
