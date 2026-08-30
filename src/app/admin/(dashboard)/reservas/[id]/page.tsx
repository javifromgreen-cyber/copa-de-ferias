import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  BookingNotesEditor,
  CancelBookingButton,
  PassportStatusSelect,
  ChangeRequestAdminRow,
  AdditionalDataNoteEditor,
} from "@/components/admin/BookingAdminControls";
import { groupBookedRooms } from "@/lib/checkout/rooms";
import { AdminTravelerEditor } from "@/components/admin/AdminTravelerEditor";
import { BookingDocumentsManager } from "@/components/admin/BookingDocumentsManager";
import { BookingUpdatesManager } from "@/components/admin/BookingUpdatesManager";
import { BookingActionsManager } from "@/components/admin/BookingActionsManager";
import { parseHotelSnapshot, parseFlightSnapshot, parsePriceBreakdownSnapshot, parseRoomingSnapshot } from "@/lib/mi-viaje/atuAireSnapshots";
import { reconstructRoomAssignments } from "@/lib/mi-viaje/rooming";
import { eventScheduleCopy } from "@/lib/mi-viaje/scheduleCopy";
import { bookingStatusLabel, ticketStatusLabel, hotelStatusLabel, flightStatusLabel } from "@/lib/mi-viaje/statusLabels";
import { PACKAGE_TYPE_COPY } from "@/lib/checkout-atu-aire/packageRequirements";

export const metadata: Metadata = { title: "Admin — Reserva" };

const ROOM_TYPE_LABELS: Record<string, string> = { single: "Individual", double: "Doble", triple: "Triple" };
const PAYMENT_STATUS_LABELS: Record<string, string> = { pending: "Pendiente", paid: "Pagado", failed: "Fallido", refunded: "Reembolsado" };
const PAYMENT_METHOD_LABELS: Record<string, string> = { demo: "Simulado (modo demo)", stripe: "Tarjeta", paypal: "PayPal" };

export default async function AdminBookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: {
      trip: { include: { events: { orderBy: { order: "asc" }, include: { competition: true, ticketOffers: true } } } },
      travelers: { orderBy: { order: "asc" } },
      changeRequests: { orderBy: { createdAt: "desc" } },
      emailLogs: { orderBy: { sentAt: "desc" } },
      documents: true,
      updates: { orderBy: { createdAt: "desc" } },
      actions: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!booking) notFound();

  const cancelled = booking.bookingStatus === "cancelled";
  const isAtuAire = booking.trip.travelMode === "A_TU_AIRE";
  const rooms = groupBookedRooms(booking.travelers);

  const eventOptions = booking.trip.events.map((e) => ({ id: e.id, label: `${e.homeTeam} vs ${e.awayTeam}` }));

  // A_TU_AIRE-only: this is admin's counterpart to buildAtuAireMiViajeView —
  // read the same frozen snapshots, never recompute from live pricing/
  // provider data, so Admin always sees exactly what the customer bought.
  const priceBreakdown = isAtuAire ? parsePriceBreakdownSnapshot(booking.priceBreakdownSnapshot) : null;
  const ticketSelections = priceBreakdown?.ticketSelections ?? {};
  const hotelSnapshot = isAtuAire ? parseHotelSnapshot(booking.hotelSelectionSnapshot) : null;
  const flightSnapshot = isAtuAire ? parseFlightSnapshot(booking.flightSelectionSnapshot) : null;
  const partySize = booking.partySize ?? booking.travelersCount;
  const persistedRooms = isAtuAire ? parseRoomingSnapshot(booking.roomingSnapshot) : null;
  const atuAireRoomAssignments = hotelSnapshot ? (persistedRooms ?? reconstructRoomAssignments(partySize)) : null;
  const travelerNames = booking.travelers.map((t) => `${t.firstName} ${t.lastName}`.trim());

  const ticketDoc = (eventId: string) => booking.documents.find((d) => d.type === "ticket" && d.eventId === eventId) ?? null;
  const hotelDoc = booking.documents.find((d) => d.type === "hotel") ?? null;
  const flightDoc = booking.documents.find((d) => d.type === "flight") ?? null;

  return (
    <div className="max-w-3xl">
      <h1 className="font-display mb-2 text-2xl uppercase">Reserva {booking.reference}</h1>
      <p className="mb-8 text-sm text-carbon/60">
        {booking.trip.name} — {booking.trip.subtitle} · {formatDate(booking.createdAt)}
      </p>

      <section className="mb-8 grid gap-4 rounded-sm border border-carbon/15 bg-white p-6 sm:grid-cols-2">
        <div>
          <p className="text-xs text-carbon/50 uppercase">Comprador</p>
          <p>
            {booking.buyerFirstName} {booking.buyerLastName}
          </p>
          <p className="text-sm text-carbon/60">{booking.buyerEmail}</p>
          <p className="text-sm text-carbon/60">{booking.buyerPhone}</p>
        </div>
        <div>
          <p className="text-xs text-carbon/50 uppercase">Reserva</p>
          {isAtuAire && booking.packageType ? <p>Modalidad: {PACKAGE_TYPE_COPY[booking.packageType].label}</p> : null}
          <p>Origen: {booking.originCity}</p>
          <p>Viajeros: {booking.travelersCount}</p>
          <p>Total: {formatCurrency(booking.totalPrice, booking.currency)}</p>
          <p>
            Pago: {PAYMENT_METHOD_LABELS[booking.paymentProvider] ?? booking.paymentProvider} ·{" "}
            {PAYMENT_STATUS_LABELS[booking.paymentStatus] ?? booking.paymentStatus}
          </p>
          <p>Estado: {bookingStatusLabel(booking.bookingStatus)}</p>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="font-display mb-3 text-lg uppercase">Partido(s)</h2>
        <div className="space-y-3">
          {booking.trip.events.map((event) => {
            const schedule = eventScheduleCopy(event);
            const category = ticketSelections[event.id] ?? null;
            const offer = category ? event.ticketOffers.find((o) => o.category === category) ?? null : null;
            const doc = ticketDoc(event.id);
            return (
              <div key={event.id} className="rounded-sm border border-carbon/10 bg-white p-3 text-sm">
                <p className="font-medium">
                  {event.homeTeam} vs {event.awayTeam} {event.competition ? `· ${event.competition.name}` : ""}
                </p>
                <p className="text-carbon/60">
                  {schedule.dateLabel}
                  {schedule.timeLabel ? ` · ${schedule.timeLabel}` : ""} · {schedule.statusLabel}
                </p>
                {category ? (
                  <p className="mt-1 text-carbon/70">
                    Entrada: {category}
                    {offer?.sector ? ` — ${offer.sector}` : ""} · Estado: {doc ? ticketStatusLabel(doc.status) : "Confirmadas"}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="font-display mb-3 text-lg uppercase">Viajeros</h2>
        <div className="space-y-2">
          {booking.travelers.map((t) => (
            <AdminTravelerEditor
              key={t.id}
              traveler={{
                id: t.id,
                firstName: t.firstName,
                lastName: t.lastName,
                birthDate: t.birthDate ? t.birthDate.toISOString().slice(0, 10) : "",
                originCity: t.originCity,
                nationality: t.nationality,
                sex: t.sex,
                docType: t.docType === "dni" || t.docType === "passport" ? t.docType : "",
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

      {hotelSnapshot ? (
        <section className="mb-8">
          <h2 className="font-display mb-3 text-lg uppercase">Hotel</h2>
          <div className="rounded-sm border border-carbon/10 bg-white p-3 text-sm">
            <p className="font-medium">{hotelSnapshot.name}</p>
            <p className="text-carbon/60">
              {hotelSnapshot.checkIn ? formatDate(new Date(hotelSnapshot.checkIn)) : "—"} →{" "}
              {hotelSnapshot.checkOut ? formatDate(new Date(hotelSnapshot.checkOut)) : "—"} · {hotelSnapshot.nights} noche(s)
            </p>
            <p className="text-carbon/70">Estado: {hotelDoc ? hotelStatusLabel(hotelDoc.status) : "Reserva confirmada"}</p>
          </div>
        </section>
      ) : null}

      {atuAireRoomAssignments ? (
        <section className="mb-8">
          <h2 className="font-display mb-3 text-lg uppercase">Habitaciones</h2>
          <div className="space-y-3">
            {atuAireRoomAssignments.map((room, i) => (
              <div key={i} className="rounded-sm border border-carbon/10 bg-white p-3 text-sm">
                <p className="text-xs text-carbon/50 uppercase">
                  Habitación {i + 1} · {ROOM_TYPE_LABELS[room.type] ?? room.type}
                </p>
                <p>{room.travelerIndices.map((idx) => travelerNames[idx] ?? `Viajero ${idx + 1}`).join(" + ")}</p>
              </div>
            ))}
          </div>
        </section>
      ) : !isAtuAire ? (
        <section className="mb-8">
          <h2 className="font-display mb-3 text-lg uppercase">Habitaciones</h2>
          <div className="space-y-3">
            {rooms.rooms.map((names, i) => (
              <div key={i} className="rounded-sm border border-carbon/10 bg-white p-3 text-sm">
                <p className="text-xs text-carbon/50 uppercase">Habitación {i + 1}</p>
                <p>{names.join(" + ")}</p>
              </div>
            ))}
            {rooms.needsRoommate.length > 0 ? (
              <div className="rounded-sm border border-carbon/10 bg-white p-3 text-sm">
                <p className="text-xs text-carbon/50 uppercase">Necesita compañero</p>
                <p>{rooms.needsRoommate.join(", ")}</p>
              </div>
            ) : null}
            {rooms.individual.length > 0 ? (
              <div className="rounded-sm border border-carbon/10 bg-white p-3 text-sm">
                <p className="text-xs text-carbon/50 uppercase">Individual</p>
                <p>{rooms.individual.join(", ")}</p>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {flightSnapshot ? (
        <section className="mb-8">
          <h2 className="font-display mb-3 text-lg uppercase">Vuelos</h2>
          <div className="space-y-2">
            <div className="rounded-sm border border-carbon/10 bg-white p-3 text-sm">
              <p className="text-xs text-carbon/50 uppercase">Ida</p>
              <p>
                {flightSnapshot.originAirport} → {flightSnapshot.destinationAirport} ·{" "}
                {formatDate(new Date(flightSnapshot.outboundDeparture), { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
            <div className="rounded-sm border border-carbon/10 bg-white p-3 text-sm">
              <p className="text-xs text-carbon/50 uppercase">Vuelta</p>
              <p>
                {flightSnapshot.destinationAirport} → {flightSnapshot.originAirport} ·{" "}
                {formatDate(new Date(flightSnapshot.returnDeparture), { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
            <p className="text-sm text-carbon/70">Estado: {flightDoc ? flightStatusLabel(flightDoc.status) : "Confirmado"}</p>
          </div>
        </section>
      ) : null}

      <section className="mb-8">
        <h2 className="font-display mb-3 text-lg uppercase">Documentos</h2>
        <BookingDocumentsManager
          bookingId={booking.id}
          eventOptions={eventOptions}
          documents={booking.documents.map((d) => ({ id: d.id, type: d.type, eventId: d.eventId, label: d.label, status: d.status, fileUrl: d.fileUrl }))}
        />
      </section>

      <section className="mb-8">
        <h2 className="font-display mb-3 text-lg uppercase">Acciones necesarias</h2>
        <BookingActionsManager
          bookingId={booking.id}
          actions={booking.actions.map((a) => ({
            id: a.id,
            type: a.type,
            title: a.title,
            description: a.description,
            status: a.status,
            actionUrl: a.actionUrl,
            dueAt: a.dueAt ? a.dueAt.toISOString().slice(0, 10) : null,
          }))}
        />
      </section>

      <section className="mb-8">
        <h2 className="font-display mb-3 text-lg uppercase">Actualizaciones</h2>
        <BookingUpdatesManager
          bookingId={booking.id}
          updates={booking.updates.map((u) => ({ id: u.id, title: u.title, message: u.message, createdAt: u.createdAt.toISOString() }))}
        />
      </section>

      <section className="mb-8">
        <h2 className="font-display mb-3 text-lg uppercase">Solicitar dato adicional</h2>
        <p className="mb-3 text-sm text-carbon/60">
          Solo rellena esto si necesitas pedir explícitamente un dato que no se conocía en el checkout — se mostrará
          como aviso al cliente en &ldquo;Mi Viaje&rdquo;. Déjalo vacío para no mostrar ningún aviso.
        </p>
        <AdditionalDataNoteEditor bookingId={booking.id} initialNote={booking.additionalDataRequestNote} />
      </section>

      {!isAtuAire ? (
        <section className="mb-8">
          <h2 className="font-display mb-3 text-lg uppercase">Pasaporte CDF</h2>
          <PassportStatusSelect bookingId={booking.id} initial={booking.passportStatus} />
        </section>
      ) : null}

      <section className="mb-8">
        <h2 className="font-display mb-3 text-lg uppercase">Notas internas</h2>
        <BookingNotesEditor bookingId={booking.id} initialNotes={booking.internalNotes} />
      </section>

      {booking.changeRequests.length > 0 ? (
        <section className="mb-8">
          <h2 className="font-display mb-3 text-lg uppercase">Solicitudes</h2>
          <div className="space-y-3">
            {booking.changeRequests.map((cr) => (
              <ChangeRequestAdminRow key={cr.id} id={cr.id} type={cr.type} description={cr.description} status={cr.status} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="mb-8">
        <h2 className="font-display mb-3 text-lg uppercase">Historial de emails</h2>
        {booking.emailLogs.length === 0 ? (
          <p className="text-sm text-carbon/50">Sin emails enviados todavía.</p>
        ) : (
          <ul className="space-y-1 text-sm text-carbon/70">
            {booking.emailLogs.map((log) => (
              <li key={log.id}>
                {formatDate(log.sentAt)} — {log.templateKey} ({log.mode})
              </li>
            ))}
          </ul>
        )}
      </section>

      <CancelBookingButton bookingId={booking.id} disabled={cancelled} />
    </div>
  );
}
