import type { BookingStatus, BookingDocumentType, BookingDocumentStatus, PackageType, ScheduleStatus, PaymentProviderKind } from "@prisma/client";
import { PACKAGE_TYPE_COPY, packageRequiresHotel, packageRequiresFlight } from "@/lib/checkout-atu-aire/packageRequirements";
import { parseHotelSnapshot, parseFlightSnapshot, parsePriceBreakdownSnapshot } from "./atuAireSnapshots";
import { deriveHotelWindow } from "./hotelWindow";
import { eventScheduleCopy } from "./scheduleCopy";
import { maskDocNumber } from "./masking";
import { bookingStatusLabel, ticketStatusLabel, hotelStatusLabel, flightStatusLabel, documentationStatusLabel } from "./statusLabels";
import { reconstructRoomAssignments } from "./rooming";
import { formatDate } from "@/lib/utils";

// Hand-typed input shape (same pattern as AtuAireQuoteData in
// checkout-atu-aire/types.ts) — decoupled from Prisma's generated payload
// types so this builder can be unit-tested with plain object literals,
// never a live database.
export type AtuAireBookingInput = {
  reference: string;
  bookingStatus: BookingStatus;
  totalPrice: number;
  currency: string;
  paymentProvider: PaymentProviderKind;
  createdAt: Date;
  packageType: PackageType | null;
  partySize: number | null;
  hotelSelectionSnapshot: string;
  flightSelectionSnapshot: string;
  priceBreakdownSnapshot: string;
  trip: {
    name: string;
    subtitle: string;
    city: string;
    events: Array<{
      id: string;
      homeTeam: string;
      awayTeam: string;
      stadium: string;
      matchDate: Date;
      kickoff: Date | null;
      scheduleStatus: ScheduleStatus;
      competition: { name: string } | null;
      ticketOffers: Array<{ category: string; sector: string; restrictions: string; deliveryType: string }>;
    }>;
  };
  travelers: Array<{
    id: string;
    firstName: string;
    lastName: string;
    nationality: string;
    docType: string;
    docNumber: string;
    birthDate: Date | null;
    phone: string;
    emergencyContactName: string;
    emergencyContactPhone: string;
  }>;
  documents: Array<{ type: BookingDocumentType; eventId: string; status: BookingDocumentStatus; fileUrl: string }>;
  updates: Array<{ id: string; title: string; message: string; createdAt: Date }>;
};

export type AtuAireMiViajeView = {
  reference: string;
  statusLabel: string;
  headerTitle: string;
  competitionName: string | null;
  city: string;
  modality: { label: string; description: string };
  partySize: number;
  events: Array<{
    id: string;
    homeTeam: string;
    awayTeam: string;
    stadium: string;
    dateLabel: string;
    timeLabel: string | null;
    scheduleStatusLabel: string;
    scheduleNote: string | null;
    ticket: { category: string; sector: string; restrictions: string; deliveryType: string; quantity: number; statusLabel: string } | null;
  }>;
  travelers: Array<{
    id: string;
    firstName: string;
    lastName: string;
    nationality: string;
    docType: string;
    maskedDocNumber: string;
    birthDate: Date | null;
    phone: string;
    emergencyContactName: string;
    emergencyContactPhone: string;
  }>;
  hotel: { name: string; nights: number; checkIn: Date; checkOut: Date; statusLabel: string } | null;
  rooms: Array<{ label: string; travelerNames: string[] }> | null;
  flights: {
    outbound: { originAirport: string; destinationAirport: string; departure: Date; statusLabel: string };
    inbound: { originAirport: string; destinationAirport: string; departure: Date; statusLabel: string };
  } | null;
  documents: Array<{ label: string; statusLabel: string; fileUrl: string }>;
  updates: Array<{ id: string; title: string; message: string; createdAt: Date }>;
  payment: { total: number; currency: string; statusLabel: string; paidAtLabel: string; methodLabel: string };
};

const PAYMENT_METHOD_LABELS: Record<PaymentProviderKind, string> = {
  demo: "Simulado (modo demo)",
  stripe: "Tarjeta",
  paypal: "PayPal",
};

function eventDocument(documents: AtuAireBookingInput["documents"], eventId: string) {
  return documents.find((d) => d.type === "ticket" && d.eventId === eventId) ?? null;
}

function typeDocument(documents: AtuAireBookingInput["documents"], type: BookingDocumentType) {
  return documents.find((d) => d.type === type) ?? null;
}

/**
 * Turns one A_TU_AIRE Booking (with its trip/events/travelers/documents)
 * into everything Mi Viaje renders — every conditional block (hotel,
 * rooms, flights) is null exactly when that modality wasn't purchased, so
 * the UI never has to re-derive "was this contracted?" itself (§8/§38-40).
 * Never recomputes a price: hotel/flight facts come from the frozen
 * snapshot captured at booking time, and the only price shown is the
 * total already paid.
 */
export function buildAtuAireMiViajeView(booking: AtuAireBookingInput): AtuAireMiViajeView {
  const packageType = booking.packageType ?? "TICKET_ONLY";
  const partySize = booking.partySize ?? booking.travelers.length;
  const modalityCopy = PACKAGE_TYPE_COPY[packageType];
  const hotelRequired = packageRequiresHotel(packageType);
  const flightRequired = packageRequiresFlight(packageType);

  const priceBreakdown = parsePriceBreakdownSnapshot(booking.priceBreakdownSnapshot);
  const ticketSelections = priceBreakdown?.ticketSelections ?? {};

  const primaryEvent = booking.trip.events[0] ?? null;

  const events = booking.trip.events.map((event) => {
    const schedule = eventScheduleCopy(event);

    const category = ticketSelections[event.id] ?? null;
    const offer = category ? event.ticketOffers.find((o) => o.category === category) ?? null : null;
    const doc = eventDocument(booking.documents, event.id);

    return {
      id: event.id,
      homeTeam: event.homeTeam,
      awayTeam: event.awayTeam,
      stadium: event.stadium,
      dateLabel: schedule.dateLabel,
      timeLabel: schedule.timeLabel,
      scheduleStatusLabel: schedule.statusLabel,
      scheduleNote: schedule.note,
      ticket: category
        ? {
            category,
            sector: offer?.sector ?? "",
            restrictions: offer?.restrictions ?? "",
            deliveryType: offer?.deliveryType ?? "",
            quantity: partySize,
            statusLabel: doc ? ticketStatusLabel(doc.status) : "Confirmadas",
          }
        : null,
    };
  });

  const travelersSorted = booking.travelers; // already ordered by Traveler.order at the query level
  const travelers = travelersSorted.map((t) => ({
    id: t.id,
    firstName: t.firstName,
    lastName: t.lastName,
    nationality: t.nationality,
    docType: t.docType,
    maskedDocNumber: maskDocNumber(t.docNumber),
    birthDate: t.birthDate,
    phone: t.phone,
    emergencyContactName: t.emergencyContactName,
    emergencyContactPhone: t.emergencyContactPhone,
  }));

  let hotel: AtuAireMiViajeView["hotel"] = null;
  let rooms: AtuAireMiViajeView["rooms"] = null;
  if (hotelRequired) {
    const snapshot = parseHotelSnapshot(booking.hotelSelectionSnapshot);
    if (snapshot) {
      const { checkIn, checkOut } = deriveHotelWindow(booking.trip.events.map((e) => e.matchDate));
      const hotelDoc = typeDocument(booking.documents, "hotel");
      hotel = { name: snapshot.name, nights: snapshot.nights, checkIn, checkOut, statusLabel: hotelDoc ? hotelStatusLabel(hotelDoc.status) : "Reserva confirmada" };

      const assignments = reconstructRoomAssignments(partySize);
      const names = travelersSorted.map((t) => `${t.firstName} ${t.lastName}`.trim());
      const ROOM_TYPE_LABELS: Record<string, string> = { single: "Individual", double: "Doble", triple: "Triple" };
      rooms = assignments.map((room, i) => ({
        label: `Habitación ${i + 1} · ${ROOM_TYPE_LABELS[room.type]}`,
        travelerNames: room.travelerIndices.map((idx) => names[idx] ?? `Viajero ${idx + 1}`),
      }));
    }
  }

  let flights: AtuAireMiViajeView["flights"] = null;
  if (flightRequired) {
    const snapshot = parseFlightSnapshot(booking.flightSelectionSnapshot);
    if (snapshot) {
      const flightDoc = typeDocument(booking.documents, "flight");
      const statusLabel = flightDoc ? flightStatusLabel(flightDoc.status) : "Confirmado";
      flights = {
        outbound: { originAirport: snapshot.originAirport, destinationAirport: snapshot.destinationAirport, departure: new Date(snapshot.outboundDeparture), statusLabel },
        inbound: { originAirport: snapshot.destinationAirport, destinationAirport: snapshot.originAirport, departure: new Date(snapshot.returnDeparture), statusLabel },
      };
    }
  }

  const documents = booking.documents.map((d) => {
    let label = d.type === "hotel" ? "Bono de hotel" : d.type === "flight" ? "Documentación de vuelo" : d.type === "other" ? "Información adicional" : "Entrada";
    if (d.type === "ticket") {
      const event = booking.trip.events.find((e) => e.id === d.eventId);
      if (event) label = `Entrada — ${event.homeTeam} – ${event.awayTeam}`;
    }
    return { label, statusLabel: documentationStatusLabel(d.type, d.status), fileUrl: d.fileUrl };
  });

  return {
    reference: booking.reference,
    statusLabel: bookingStatusLabel(booking.bookingStatus),
    headerTitle: primaryEvent ? `${primaryEvent.homeTeam} – ${primaryEvent.awayTeam}` : booking.trip.name,
    competitionName: primaryEvent?.competition?.name ?? null,
    city: booking.trip.city,
    modality: modalityCopy,
    partySize,
    events,
    travelers,
    hotel,
    rooms,
    flights,
    documents,
    updates: booking.updates,
    payment: {
      total: booking.totalPrice,
      currency: booking.currency,
      statusLabel: booking.bookingStatus === "confirmed" || booking.bookingStatus === "cancellation_requested" ? "Pagado" : bookingStatusLabel(booking.bookingStatus),
      paidAtLabel: formatDate(booking.createdAt),
      methodLabel: PAYMENT_METHOD_LABELS[booking.paymentProvider],
    },
  };
}
