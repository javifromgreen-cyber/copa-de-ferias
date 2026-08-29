import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { ButtonLink } from "@/components/ui/Button";
import { TripGallery } from "@/components/trips/TripGallery";
import { CommercialPanel } from "@/components/trips/CommercialPanel";
import { ScheduleStatusNote } from "@/components/trips/ScheduleStatusNote";
import { FaqAccordion } from "@/components/faq/FaqAccordion";
import { getAtuAireFaqItems } from "@/lib/faq/tripFaq";
import { getTripBySlug } from "@/lib/trips/queries";
import { effectiveStatus } from "@/lib/trips/status";
import { formatCurrency, formatDate } from "@/lib/utils";
import { TrackOnMount } from "@/components/analytics/TrackOnMount";
import { PlaneIcon, BuildingIcon, TicketIcon, StadiumIcon, CheckIcon, CrossIcon, ShieldIcon, BedIcon } from "@/components/icons";
import { prisma } from "@/lib/db";
import { computeTicketOnlyFromPricePerPerson } from "@/lib/checkout-atu-aire/publicPrice";

// Trip content and spots-left are admin/booking-driven — revalidate
// instead of a permanent build-time snapshot. Actual oversell prevention
// happens transactionally at booking time regardless of display staleness.
export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const trip = await getTripBySlug(slug);
  if (!trip || !trip.published) return {};
  return {
    title: trip.seoTitle || `${trip.name} — ${trip.subtitle}`,
    description: trip.seoDescription || trip.description,
    openGraph: { title: trip.seoTitle || trip.name, description: trip.seoDescription || trip.description },
  };
}

export default async function TripPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const trip = await getTripBySlug(slug);
  if (!trip || !trip.published) notFound();

  const status = effectiveStatus(trip);
  const included = trip.inclusions.filter((i) => i.included);
  const excluded = trip.inclusions.filter((i) => !i.included);

  // A_TU_AIRE has no fixed group-capacity pool and no single bundled price
  // — its public "Desde X €/persona" is always the cheapest TICKET_ONLY
  // combination, computed through the same commercial engine the checkout
  // uses (§8), never trip.price / maxSpots-soldSpots (§7).
  const isAtuAire = trip.travelMode === "A_TU_AIRE";
  let atuAireFromPrice: number | null = null;
  if (isAtuAire) {
    const [events, feeConfig] = await Promise.all([
      prisma.event.findMany({
        where: { tripId: trip.id, status: "published" },
        include: { ticketOffers: { where: { active: true } } },
      }),
      prisma.organizationFeeConfig.upsert({ where: { id: "default" }, create: { id: "default" }, update: {} }),
    ]);
    atuAireFromPrice = computeTicketOnlyFromPricePerPerson({
      events: events.map((e) => ({ id: e.id })),
      ticketOffersByEventId: Object.fromEntries(events.map((e) => [e.id, e.ticketOffers.map((o) => ({ costNet: o.costNet }))])),
      feeConfig: {
        feeTicketOnly: feeConfig.feeTicketOnly,
        feeHotelTiers: feeConfig.feeHotelTiers,
        feeHotelFlightTiers: feeConfig.feeHotelFlightTiers,
        additionalMatchFee: feeConfig.additionalMatchFee,
      },
      tripOverrides: {
        orgFeeTicketOnlyOverride: trip.orgFeeTicketOnlyOverride,
        orgFeeHotelTiersOverride: trip.orgFeeHotelTiersOverride,
        orgFeeHotelFlightTiersOverride: trip.orgFeeHotelFlightTiersOverride,
        additionalMatchFeeOverride: trip.additionalMatchFeeOverride,
      },
    });
  }

  const competitionName = trip.events[0]?.competition?.name ?? null;

  return (
    <div>
      <TrackOnMount event="trip_view" payload={{ tripId: trip.id }} />

      <Container className="pt-8 sm:pt-10">
        <TripGallery heroImageKey={trip.heroImageKey} tone={status === "completed" ? "sepia" : "color"} />
      </Container>

      <Container className="pt-8">
        <ScheduleStatusNote matchDate={trip.matchDate} scheduleStatus={trip.scheduleStatus} />
      </Container>

      {/* Commercial panel + main content share one grid: a single
          CommercialPanel instance, positioned first on mobile/tablet
          (order-1, right under the schedule note) and as the sticky right
          column on desktop (order-2) — never duplicated in the DOM. */}
      <Container className="grid gap-16 py-8 sm:py-10 lg:grid-cols-[1fr_380px]">
        <div className="order-2 space-y-16 lg:order-1">
          {/* Por qué vamos */}
          {trip.whyWeGo ? (
            <section>
              <h2 className="font-display mb-4 text-2xl uppercase">Por qué vamos</h2>
              <p className="text-carbon/80 whitespace-pre-line">{trip.whyWeGo}</p>
            </section>
          ) : null}

          {/* El grupo / comunidad — a GROUP_CDF concept (a coordinator, a
              host); A_TU_AIRE never shows this section. Never mentions a
              capacity/headcount number — that's never shown publicly (§1). */}
          {!isAtuAire ? (
            <section>
              <h2 className="font-display mb-4 text-2xl uppercase">El grupo</h2>
              <p className="text-carbon/80">
                Grupo pequeño. Puedes venir solo, con un amigo o en grupo: lo normal es encontrarse allí con gente que
                va exactamente por lo mismo que tú.
                {trip.coordinatorName ? ` Coordina el grupo: ${trip.coordinatorName}.` : ""}
                {trip.hostName ? ` En destino, ${trip.hostName}.` : ""}
              </p>
            </section>
          ) : null}

          {/* Planning */}
          {trip.planningDays.length > 0 ? (
            <section>
              <h2 className="font-display mb-6 text-2xl uppercase">Planning</h2>
              <ol className="space-y-6">
                {trip.planningDays.map((day) => (
                  <li key={day.id} className="border-l-2 border-carbon/15 pl-5">
                    <p className="font-display text-sm tracking-[0.15em] text-cement uppercase">{day.title}</p>
                    <p className="mt-1 text-carbon/80 whitespace-pre-line">{day.description}</p>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {/* Transporte */}
          <section>
            <h2 className="font-display mb-4 flex items-center gap-2 text-2xl uppercase">
              <PlaneIcon className="h-6 w-6 shrink-0" />
              Transporte
            </h2>
            <dl className="grid grid-cols-2 gap-4 text-sm sm:max-w-sm">
              <div>
                <dt className="text-carbon/50 uppercase">Salida</dt>
                <dd className="mt-1 text-carbon/80">{trip.departureText || "Por confirmar"}</dd>
              </div>
              <div>
                <dt className="text-carbon/50 uppercase">Regreso / llegada</dt>
                <dd className="mt-1 text-carbon/80">{trip.returnText || "Por confirmar"}</dd>
              </div>
            </dl>
          </section>

          {/* Hotel — GROUP_CDF books one specific hotel for the whole
              group (trip.hotelStars/hotelZone/hotelDescription describe
              it exactly). A_TU_AIRE instead offers several hotels to pick
              from during checkout, so a single fixed star rating here
              would misrepresent it — this branch stays generic on
              purpose (§7). */}
          <section>
            <h2 className="font-display mb-4 flex items-center gap-2 text-2xl uppercase">
              <BuildingIcon className="h-6 w-6 shrink-0" />
              Hotel
            </h2>
            {isAtuAire ? (
              <p className="text-carbon/80">Podrás elegir tu hotel durante la configuración de la reserva, entre varias opciones disponibles para este partido.</p>
            ) : (
              <p className="text-carbon/80">
                Hotel {trip.hotelCentric ? "céntrico " : ""}de {trip.hotelStars} estrellas
                {trip.hotelZone ? ` en ${trip.hotelZone}` : ""}. {trip.hotelDescription}
              </p>
            )}
          </section>

          {/* Partido / Entrada */}
          <section>
            <h2 className="font-display mb-4 flex items-center gap-2 text-2xl uppercase">
              <TicketIcon className="h-6 w-6 shrink-0" />
              Partido y entrada
            </h2>
            <p className="text-carbon/80">
              Entrada incluida en {trip.stadium}
              {trip.ticketCategory ? ` — ${trip.ticketCategory}` : ""}
              {trip.ticketSector ? `, ${trip.ticketSector}` : ""}.
            </p>
            {trip.ticketSeating ? <p className="mt-2 text-sm text-carbon/60">{trip.ticketSeating}</p> : null}
          </section>

          {/* Experiencia futbolística */}
          {trip.activities.length > 0 ? (
            <section>
              <h2 className="font-display mb-6 flex items-center gap-2 text-2xl uppercase">
                <StadiumIcon className="h-6 w-6 shrink-0" />
                Experiencia futbolística
              </h2>
              <ul className="grid gap-6 sm:grid-cols-2">
                {trip.activities.map((activity) => (
                  <li key={activity.id}>
                    <p className="font-medium text-carbon">{activity.title}</p>
                    {activity.description ? <p className="mt-1 text-sm text-carbon/70">{activity.description}</p> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* Incluido / no incluido */}
          {trip.inclusions.length > 0 ? (
            <section>
              <h2 className="font-display mb-6 text-2xl uppercase">Incluido / no incluido</h2>
              <div className="grid gap-8 sm:grid-cols-2">
                <div>
                  <p className="mb-3 text-xs font-semibold tracking-widest text-carbon uppercase">Incluido</p>
                  <ul className="space-y-2 text-sm text-carbon/80">
                    {included.map((i) => (
                      <li key={i.id} className="flex items-start gap-2">
                        <CheckIcon className="mt-0.5 h-4 w-4 shrink-0" />
                        {i.text}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="mb-3 text-xs font-semibold tracking-widest text-carbon/60 uppercase">No incluido</p>
                  <ul className="space-y-2 text-sm text-carbon/60">
                    {excluded.map((i) => (
                      <li key={i.id} className="flex items-start gap-2">
                        <CrossIcon className="mt-0.5 h-4 w-4 shrink-0" />
                        {i.text}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          ) : null}

          {/* Seguro */}
          {trip.insuranceDescription ? (
            <section>
              <h2 className="font-display mb-4 flex items-center gap-2 text-2xl uppercase">
                <ShieldIcon className="h-6 w-6 shrink-0" />
                Seguro
              </h2>
              <p className="text-carbon/80">{trip.insuranceDescription}</p>
            </section>
          ) : null}

          {/* Habitaciones — a GROUP_CDF concept (one fixed default room mix
              + a fixed single-supplement). A_TU_AIRE resolves the room mix
              per traveler inside checkout instead, so this static block
              would be wrong there — never shown for it. */}
          {!isAtuAire ? (
            <section>
              <h2 className="font-display mb-4 flex items-center gap-2 text-2xl uppercase">
                <BedIcon className="h-6 w-6 shrink-0" />
                Habitaciones
              </h2>
              <ul className="space-y-2 text-carbon/80">
                <li>· Habitación doble compartida, incluida por defecto.</li>
                <li>· Durante la reserva eliges quién comparte habitación con quién.</li>
                <li>· Si vienes solo, te asignamos con otro participante de tu mismo sexo.</li>
                <li>
                  · Habitación individual: suplemento de {formatCurrency(trip.singleSupplement, trip.currency)}.
                </li>
              </ul>
              <p className="mt-3 text-sm text-carbon/50">Viaje para mayores de 18 años.</p>
            </section>
          ) : null}

          {/* Qué ocurre después — every traveler's core data is already
              collected during checkout (§8), so this never frames "Mi
              Viaje" as where the main data-gathering happens. */}
          <section>
            <h2 className="font-display mb-4 text-2xl uppercase">Qué ocurre después de reservar</h2>
            <p className="text-carbon/80">
              Recibes la confirmación al instante. Desde tu área &quot;Mi Viaje&quot; puedes consultar toda la
              información de tu reserva; cualquier actualización, cambio o dato adicional que pueda hacer falta se
              gestiona desde ese mismo espacio{trip.whatsappUrl ? ", y unos 15 días antes se activa el grupo de WhatsApp del viaje" : ""}.
            </p>
          </section>

          {/* FAQ específica — A_TU_AIRE gets a generated, always-present set
              (dynamic schedule Q&A + 4 universal Q&As, §22); GROUP_CDF
              keeps its own admin-authored trip.faqs rows as before. */}
          {isAtuAire ? (
            <section>
              <h2 className="font-display mb-6 text-2xl uppercase">Preguntas sobre este partido</h2>
              <FaqAccordion items={getAtuAireFaqItems(trip)} />
              <Link href="/faq" className="mt-4 inline-block text-sm underline">
                Ver todas las preguntas frecuentes
              </Link>
            </section>
          ) : trip.faqs.length > 0 ? (
            <section>
              <h2 className="font-display mb-6 text-2xl uppercase">Preguntas sobre este viaje</h2>
              <div className="space-y-6">
                {trip.faqs.map((faq) => (
                  <div key={faq.id}>
                    <p className="font-medium text-carbon">{faq.question}</p>
                    <p className="mt-1 text-sm text-carbon/70">{faq.answer}</p>
                  </div>
                ))}
              </div>
              <Link href="/faq" className="mt-4 inline-block text-sm underline">
                Ver todas las preguntas frecuentes
              </Link>
            </section>
          ) : null}

          {/* Condiciones importantes */}
          {(trip.importantConditions || trip.cancellationPolicy) ? (
            <section>
              <h2 className="font-display mb-4 text-2xl uppercase">Condiciones importantes</h2>
              {trip.importantConditions ? <p className="mb-3 text-sm text-carbon/70">{trip.importantConditions}</p> : null}
              {trip.cancellationPolicy ? <p className="text-sm text-carbon/70">{trip.cancellationPolicy}</p> : null}
              {trip.minDeadlineDate ? (
                <p className="mt-3 text-sm text-carbon/50">
                  Este viaje requiere un mínimo de {trip.minSpots} viajeros antes del{" "}
                  {formatDate(trip.minDeadlineDate)}. Si no se alcanza, se cancela con reembolso íntegro.
                </p>
              ) : null}
            </section>
          ) : null}
        </div>

        {/* Capacity/plazas is never shown publicly, for any travel mode
            (§1/§20) — internal availability still gates the CTA via
            effectiveStatus, it's just never surfaced as a number. */}
        <aside className="order-1 lg:sticky lg:top-24 lg:order-2 lg:h-fit">
          <CommercialPanel trip={trip} status={status} isAtuAire={isAtuAire} fromPrice={isAtuAire ? atuAireFromPrice : trip.price} competitionName={competitionName} />
        </aside>
      </Container>

      {/* Mobile sticky CTA */}
      {status === "open" ? (
        <div className="sticky-cta-safe-area fixed inset-x-0 bottom-0 z-30 border-t border-carbon/10 bg-ivory p-3 lg:hidden">
          <ButtonLink href={`/viajes/${trip.slug}/reservar`} className="w-full justify-center">
            {isAtuAire
              ? atuAireFromPrice !== null
                ? `Configurar mi viaje · Desde ${formatCurrency(atuAireFromPrice, trip.currency)}`
                : "Configurar mi viaje"
              : `Reservar plaza · ${formatCurrency(trip.price, trip.currency)}`}
          </ButtonLink>
        </div>
      ) : null}
      {status === "open" ? <div className="h-20 lg:hidden" aria-hidden /> : null}
    </div>
  );
}
