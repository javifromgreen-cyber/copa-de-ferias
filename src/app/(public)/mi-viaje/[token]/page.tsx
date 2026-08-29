import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { prisma } from "@/lib/db";
import { formatCurrency, formatDate, daysUntil } from "@/lib/utils";
import { getBrand } from "@/lib/brand";
import { TravelerDetailsForm } from "@/components/mi-viaje/TravelerDetailsForm";
import { ChangeRequestButton } from "@/components/mi-viaje/ChangeRequestButton";
import { WhatsAppLink } from "@/components/mi-viaje/WhatsAppLink";
import { TrackOnMount } from "@/components/analytics/TrackOnMount";
import { BedIcon, ClipboardIcon, ChatIcon, SlidersIcon, PassportIcon, CalendarIcon, DocumentIcon } from "@/components/icons";
import { groupBookedRooms } from "@/lib/checkout/rooms";
import { MiViajeAtuAire } from "@/components/mi-viaje/atu-aire/MiViajeAtuAire";
import { buildAtuAireMiViajeView } from "@/lib/mi-viaje/buildAtuAireView";

// Must always reflect the traveler's live booking state (data just saved,
// change requests, passport status) — never cache this per-token page.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Mi Viaje" };

export default async function MiViajeDashboard({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const booking = await prisma.booking.findUnique({
    where: { accessToken: token },
    include: {
      trip: {
        include: {
          planningDays: { orderBy: { order: "asc" } },
          requirements: { orderBy: { order: "asc" } },
          events: { orderBy: { order: "asc" }, include: { competition: true, ticketOffers: true } },
        },
      },
      travelers: { orderBy: { order: "asc" } },
      documents: true,
      updates: { orderBy: { createdAt: "desc" } },
      actions: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!booking) notFound();

  const brand = await getBrand();

  // A_TU_AIRE bookings get the full, dedicated Mi Viaje experience built
  // for this product (§1-52) — GROUP_CDF keeps the page as it already was,
  // completely untouched below, since this block is scoped to A_TU_AIRE
  // only and GROUP_CDF's own checkout/Mi Viaje flow must keep working
  // exactly as before.
  if (booking.trip.travelMode === "A_TU_AIRE") {
    const view = buildAtuAireMiViajeView(booking);
    return (
      <>
        <TrackOnMount event="my_trip_view" payload={{ bookingId: booking.id }} />
        <MiViajeAtuAire view={view} accessToken={token} contactEmail={brand.contactEmail} />
      </>
    );
  }

  const departureDate = new Date(booking.trip.matchDate);
  departureDate.setDate(departureDate.getDate() - 1);
  const returnDate = new Date(booking.trip.matchDate);
  returnDate.setDate(returnDate.getDate() + 1);

  const rooms = groupBookedRooms(booking.travelers);
  const whatsappReady = booking.trip.whatsappAvailableAt ? booking.trip.whatsappAvailableAt <= new Date() : false;
  const daysToWhatsapp = booking.trip.whatsappAvailableAt ? daysUntil(booking.trip.whatsappAvailableAt) : null;
  // Only show a countdown once it's genuinely close — otherwise the static
  // "se abre 15 días antes" line reads better than "disponible en 143 días".
  const whatsappSoon = daysToWhatsapp !== null && daysToWhatsapp > 0 && daysToWhatsapp <= 20;

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

      {booking.additionalDataRequestNote ? (
        <div className="mb-8 rounded-sm border border-stamp/40 bg-stamp/10 p-4 text-sm text-stamp">
          {booking.additionalDataRequestNote}
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

      <section className="mb-12">
        <h2 className="font-display mb-4 flex items-center gap-2 text-lg uppercase">
          <BedIcon className="h-5 w-5 shrink-0" />
          Habitaciones
        </h2>
        <p className="mb-3 text-sm text-carbon/60">Así queda organizado el grupo, tal y como se eligió al reservar.</p>
        <div className="space-y-3">
          {rooms.rooms.map((names, i) => (
            <div key={i} className="rounded-sm border border-carbon/10 px-4 py-3 text-sm">
              <p className="mb-1 text-xs tracking-wide text-carbon/50 uppercase">Habitación {i + 1}</p>
              <p className="text-carbon/85">{names.join(" + ")}</p>
            </div>
          ))}
          {rooms.individual.map((name) => (
            <div key={name} className="rounded-sm border border-carbon/10 px-4 py-3 text-sm">
              <p className="text-carbon/85">{name}</p>
              <p className="text-xs text-carbon/50 uppercase">Habitación individual</p>
            </div>
          ))}
          {rooms.needsRoommate.map((name) => (
            <div key={name} className="rounded-sm border border-carbon/10 px-4 py-3 text-sm">
              <p className="text-carbon/85">{name}</p>
              <p className="text-xs text-carbon/50 uppercase">Compartirá con otro participante del grupo · asignación pendiente</p>
            </div>
          ))}
        </div>
      </section>

      {booking.trip.planningDays.length > 0 ? (
        <section className="mb-12">
          <h2 className="font-display mb-4 flex items-center gap-2 text-lg uppercase">
            <CalendarIcon className="h-5 w-5 shrink-0" />
            Planning
          </h2>
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
        <h2 className="font-display mb-1 flex items-center gap-2 text-lg uppercase">
          <DocumentIcon className="h-5 w-5 shrink-0" />
          Documentación de los viajeros
        </h2>
        <p className="mb-4 text-sm text-carbon/60">
          Los datos que este viaje necesitaba ya se recogieron al reservar. Consulta aquí lo registrado de cada
          viajero; si algo queda pendiente, puedes completarlo, pero no afecta a tu reserva, ya confirmada.
        </p>
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
                emergencyContactName: t.emergencyContactName,
                emergencyContactPhone: t.emergencyContactPhone,
              }}
            />
          ))}
        </div>
      </section>

      {booking.trip.requirements.length > 0 ? (
        <section className="mb-12">
          <h2 className="font-display mb-4 flex items-center gap-2 text-lg uppercase">
            <ClipboardIcon className="h-5 w-5 shrink-0" />
            Checklist y requisitos
          </h2>
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
        <h2 className="font-display mb-4 flex items-center gap-2 text-lg uppercase">
          <ChatIcon className="h-5 w-5 shrink-0" />
          Grupo de WhatsApp
        </h2>
        {whatsappReady && booking.trip.whatsappUrl ? (
          <WhatsAppLink url={booking.trip.whatsappUrl} />
        ) : whatsappSoon ? (
          <p className="text-sm text-carbon/70">Grupo de WhatsApp disponible en {daysToWhatsapp} días.</p>
        ) : (
          <p className="text-sm text-carbon/70">El grupo de WhatsApp del viaje se abre 15 días antes de salir.</p>
        )}
      </section>

      <section className="mb-12 flex items-start gap-3">
        <PassportIcon className="mt-1 h-6 w-6 shrink-0 text-carbon" />
        <div>
          <h2 className="font-display mb-1 text-lg uppercase">Pasaporte CDF</h2>
          <p className="text-sm text-carbon/70">
            Este viaje incluye tu Pasaporte CDF #{String(booking.trip.number).padStart(3, "0")} y la pegatina de{" "}
            {booking.trip.name}.{" "}
            {booking.passportStatus === "sent"
              ? "Ya te lo hemos enviado."
              : booking.passportStatus === "prepared"
                ? "Está preparado, listo para enviarte."
                : "Lo estamos preparando."}
          </p>
        </div>
      </section>

      <section className="mb-12 space-y-4">
        <h2 className="font-display flex items-center gap-2 text-lg uppercase">
          <SlidersIcon className="h-5 w-5 shrink-0" />
          Gestionar mi reserva
        </h2>
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
