import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/utils";
import { BookingNotesEditor, CancelBookingButton, PassportStatusSelect, ChangeRequestAdminRow } from "@/components/admin/BookingAdminControls";
import { summarizeBookedRooms } from "@/lib/checkout/rooms";

export const metadata: Metadata = { title: "Admin — Reserva" };

export default async function AdminBookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { trip: true, travelers: true, changeRequests: { orderBy: { createdAt: "desc" } }, emailLogs: { orderBy: { sentAt: "desc" } } },
  });
  if (!booking) notFound();

  const cancelled = booking.bookingStatus === "cancelled";

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
          <p>Origen: {booking.originCity}</p>
          <p>Viajeros: {booking.travelersCount}</p>
          <p>Total: {formatCurrency(booking.totalPrice, booking.currency)}</p>
          <p>
            Pago: {booking.paymentProvider} · {booking.paymentStatus}
          </p>
          <p>Estado: {booking.bookingStatus}</p>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="font-display mb-3 text-lg uppercase">Viajeros</h2>
        <div className="space-y-2">
          {booking.travelers.map((t) => (
            <div key={t.id} className="rounded-sm border border-carbon/10 bg-white p-3 text-sm">
              <p className="font-medium">
                {t.firstName} {t.lastName}
              </p>
              <p className="text-carbon/60">
                Documento: {t.docType || "—"} {t.docNumber}
                {t.roomPreference === "share_with_group" && t.roomPartnerName
                  ? ` · Comparte con: ${t.roomPartnerName}`
                  : t.roomPreference === "single"
                    ? " · Habitación individual"
                    : " · Comparte con otro participante (por asignar)"}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="font-display mb-3 text-lg uppercase">Habitaciones</h2>
        <ul className="space-y-1 text-sm text-carbon/70">
          {summarizeBookedRooms(booking.travelers).map((row, i) => (
            <li key={i}>{row}</li>
          ))}
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="font-display mb-3 text-lg uppercase">Pasaporte CDF</h2>
        <PassportStatusSelect bookingId={booking.id} initial={booking.passportStatus} />
      </section>

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
