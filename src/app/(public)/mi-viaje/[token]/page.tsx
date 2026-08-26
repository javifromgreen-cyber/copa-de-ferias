import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { prisma } from "@/lib/db";
import { formatCurrency, formatDate, daysUntil } from "@/lib/utils";
import { getBrand } from "@/lib/brand";
import { TravelerDetailsForm } from "@/components/mi-viaje/TravelerDetailsForm";
import { isTravelerComplete } from "@/lib/mi-viaje/completeness";
import { ChangeRequestButton } from "@/components/mi-viaje/ChangeRequestButton";
import { WhatsAppLink } from "@/components/mi-viaje/WhatsAppLink";
import { TrackOnMount } from "@/components/analytics/TrackOnMount";

// Must always reflect the traveler's live booking state (data just saved,
// change requests, passport status) — never cache this per-token page.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Mi Viaje" };

export default async function MiViajeDashboard({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const booking = await prisma.booking.findUnique({
    where: { accessToken: token },
    include: {
      trip: { include: { planningDays: { orderBy: { order: "asc" } }, requirements: { orderBy: { order: "asc" } } } },
      travelers: true,
    },
  });
  if (!booking) notFound();

  const brand = await getBrand();

  const departureDate = new Date(booking.trip.matchDate);
  departureDate.setDate(departureDate.getDate() - 1);
  const returnDate = new Date(booking.trip.matchDate);
  returnDate.setDate(returnDate.getDate() + 1);

  const pendingTravelers = booking.travelers.filter((t) => !isTravelerComplete(t));
  const whatsappReady = booking.trip.whatsappAvailableAt ? booking.trip.whatsappAvailableAt <= new Date() : false;
  const daysToWhatsapp = booking.trip.whatsappAvailableAt ? daysUntil(booking.trip.whatsappAvailableAt) : null;

  const statusLabel: Record<string, string> = {
    pending_payment: "Pago pendiente",
    confirmed: "Reserva confirmada",
    cancellation_requested: "Cancelación solicitada",
    cancelled: "Cancelada",
    refund_pending: "Reembolso en curso",
    refunded: "Reembolsada",
  };

  return (
    <Container className="max-w-3xl py-10 sm:py-14">
      <TrackOnMount event="my_trip_view" payload={{ bookingId: booking.id }} />
      <p className="font-display mb-2 text-xs tracking-[0.25em] text-cement uppercase">
        Viaje #{String(booking.trip.number).padStart(3, "0")} · {booking.reference}
      </p>
      <h1 className="font-display mb-2 text-3xl uppercase sm:text-4xl">
        {booking.trip.name} — {booking.trip.subtitle}
      </h1>
      <p className="mb-10 text-carbon/70">{statusLabel[booking.bookingStatus] ?? booking.bookingStatus}</p>

      {pendingTravelers.length > 0 ? (
        <div className="mb-8 rounded-sm border border-stamp/40 bg-stamp/10 p-4 text-sm text-stamp">
          Te faltan datos por completar de {pendingTravelers.length} viajero{pendingTravelers.length === 1 ? "" : "s"}.
        </div>
      ) : null}

      <section className="mb-12 rounded-sm border border-carbon/15 p-6">
        <h2 className="font-display mb-4 text-lg uppercase">Resumen</h2>
        <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-carbon/50 uppercase">Viajeros</dt>
            <dd>{booking.travelersCount}</dd>
          </div>
          <div>
            <dt className="text-carbon/50 uppercase">Origen</dt>
            <dd>{booking.originCity}</dd>
          </div>
          <div>
            <dt className="text-carbon/50 uppercase">Salida</dt>
            <dd>{formatDate(departureDate)}</dd>
          </div>
          <div>
            <dt className="text-carbon/50 uppercase">Regreso</dt>
            <dd>{formatDate(returnDate)}</dd>
          </div>
          <div>
            <dt className="text-carbon/50 uppercase">Hotel</dt>
            <dd>
              {booking.trip.hotelStars}★ {booking.trip.hotelZone}
            </dd>
          </div>
          <div>
            <dt className="text-carbon/50 uppercase">Partido</dt>
            <dd>
              {booking.trip.homeTeam} – {booking.trip.awayTeam}
            </dd>
          </div>
          <div>
            <dt className="text-carbon/50 uppercase">Entrada</dt>
            <dd>{booking.trip.ticketCategory || "Incluida"}</dd>
          </div>
          <div>
            <dt className="text-carbon/50 uppercase">Total pagado</dt>
            <dd>{formatCurrency(booking.totalPrice, booking.currency)}</dd>
          </div>
        </dl>
      </section>

      {booking.trip.planningDays.length > 0 ? (
        <section className="mb-12">
          <h2 className="font-display mb-4 text-lg uppercase">Planning</h2>
          <ol className="space-y-4">
            {booking.trip.planningDays.map((day) => (
              <li key={day.id} className="border-l-2 border-carbon/15 pl-4">
                <p className="font-display text-xs tracking-widest text-cement uppercase">{day.title}</p>
                <p className="mt-1 text-sm text-carbon/80">{day.description}</p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <section className="mb-12">
        <h2 className="font-display mb-4 text-lg uppercase">Datos de los viajeros</h2>
        <div className="space-y-3">
          {booking.travelers.map((t) => (
            <TravelerDetailsForm
              key={t.id}
              accessToken={token}
              traveler={{
                id: t.id,
                firstName: t.firstName,
                lastName: t.lastName,
                nationality: t.nationality,
                sex: t.sex,
                docType: t.docType,
                docNumber: t.docNumber,
                docExpiry: t.docExpiry ? t.docExpiry.toISOString().slice(0, 10) : "",
                docCountry: t.docCountry,
                phone: t.phone,
                emergencyContact: t.emergencyContact,
                address: t.address,
              }}
            />
          ))}
        </div>
      </section>

      {booking.trip.requirements.length > 0 ? (
        <section className="mb-12">
          <h2 className="font-display mb-4 text-lg uppercase">Checklist y requisitos</h2>
          <ul className="space-y-2 text-sm text-carbon/80">
            {booking.trip.requirements.map((r) => (
              <li key={r.id} className="flex gap-2">
                <span aria-hidden>·</span>
                {r.text}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mb-12">
        <h2 className="font-display mb-4 text-lg uppercase">Grupo de WhatsApp</h2>
        {whatsappReady && booking.trip.whatsappUrl ? (
          <WhatsAppLink url={booking.trip.whatsappUrl} />
        ) : (
          <p className="text-sm text-carbon/70">
            Grupo de WhatsApp disponible
            {daysToWhatsapp && daysToWhatsapp > 0 ? ` en ${daysToWhatsapp} días.` : " próximamente."}
          </p>
        )}
      </section>

      <section className="mb-12">
        <h2 className="font-display mb-4 text-lg uppercase">Pasaporte CDF</h2>
        <p className="text-sm text-carbon/70">
          Estado:{" "}
          {booking.passportStatus === "sent"
            ? "Enviado"
            : booking.passportStatus === "prepared"
              ? "Preparado"
              : "Pendiente"}
          . Tu pasaporte de viajero y la pegatina de este viaje se preparan una vez confirmados tus datos.
        </p>
      </section>

      <section className="mb-12 space-y-4">
        <h2 className="font-display text-lg uppercase">Gestionar mi reserva</h2>
        <div className="flex flex-wrap gap-3">
          <ChangeRequestButton
            accessToken={token}
            type="name_change"
            label="Solicitar cambio de viajero"
            placeholder="Indica qué viajero cambia y los datos de la persona nueva."
          />
          <ChangeRequestButton
            accessToken={token}
            type="cancellation"
            label="Solicitar cancelación"
            placeholder="Cuéntanos el motivo de la cancelación."
          />
        </div>
      </section>

      <section>
        <h2 className="font-display mb-2 text-lg uppercase">¿Dudas?</h2>
        <p className="text-sm text-carbon/70">
          Escríbenos a{" "}
          <a href={`mailto:${brand.contactEmail}`} className="underline">
            {brand.contactEmail}
          </a>
          .
        </p>
      </section>
    </Container>
  );
}
