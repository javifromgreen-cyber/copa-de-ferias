import type { BookingStatus, BookingDocumentType, BookingDocumentStatus, BookingActionType, BookingActionStatus, PackageType, ScheduleStatus, PaymentProviderKind } from "@prisma/client";
import { PACKAGE_TYPE_COPY, packageRequiresHotel, packageRequiresFlight } from "@/lib/checkout-atu-aire/packageRequirements";
import { parseHotelSnapshot, parseFlightSnapshot, parsePriceBreakdownSnapshot, parseRoomingSnapshot } from "./atuAireSnapshots";
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
  roomingSnapshot: string;
  additionalDataRequestNote: string;
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
  actions: Array<{ id: string; type: BookingActionType; title: string; description: string; status: BookingActionStatus; actionUrl: string; dueAt: Date | null }>;
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
  necessaryActions: Array<{ id: string; title: string; description: string; dueAtLabel: string | null; actionHref: string }>;
};

const DOCUMENT_TYPE_ACTION_HREF: Record<BookingDocumentType, string> = {
  ticket: "#entradas",
  hotel: "#hotel",
  flight: "#vuelos",
  other: "#documentacion",
};

const ACTION_TYPE_FALLBACK_HREF: Record<BookingActionType, string> = {
  hotel_checkin: "#hotel",
  flight_checkin: "#vuelos",
  data_correction: "#viajeros",
  change_review: "#actualizaciones",
  document: "#documentacion",
  other: "#ayuda",
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

function documentLabel(doc: { type: BookingDocumentType; eventId: string }, events: AtuAireBookingInput["trip"]["events"]): string {
  if (doc.type === "ticket") {
    const event = events.find((e) => e.id === doc.eventId);
    if (event) return `Entrada — ${event.homeTeam} – ${event.awayTeam}`;
    return "Entrada";
  }
  if (doc.type === "hotel") return "Bono de hotel";
  if (doc.type === "flight") return "Documentación de vuelo";
  return "Información adicional";
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
      // checkIn/checkOut come from the frozen snapshot — exactly what was
      // booked, never re-derived from the Event's current schedule
      // (correction microblock §12/§13). Older bookings created before
      // this field existed fall back to the old live-derivation just once,
      // for backward compatibility, not as the intended path going forward.
      const { checkIn, checkOut } = snapshot.checkIn && snapshot.checkOut
        ? { checkIn: new Date(snapshot.checkIn), checkOut: new Date(snapshot.checkOut) }
        : deriveHotelWindow(booking.trip.events.map((e) => e.matchDate));
      const hotelDoc = typeDocument(booking.documents, "hotel");
      hotel = { name: snapshot.name, nights: snapshot.nights, checkIn, checkOut, statusLabel: hotelDoc ? hotelStatusLabel(hotelDoc.status) : "Reserva confirmada" };

      // Same rule: the exact room assignment bought, from roomingSnapshot
      // — never recomputed from today's computeRequiredRoomMix table
      // (§14/§15). Falls back to reconstructing it only for bookings
      // created before roomingSnapshot existed.
      const persistedRooms = parseRoomingSnapshot(booking.roomingSnapshot);
      const assignments = persistedRooms ?? reconstructRoomAssignments(partySize);
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

  const documents = booking.documents.map((d) => ({
    label: documentLabel(d, booking.trip.events),
    statusLabel: documentationStatusLabel(d.type, d.status),
    fileUrl: d.fileUrl,
  }));

  // "Acciones necesarias" (correction microblock §6-11) — every entry
  // comes from real persisted data: an explicit pending BookingAction, a
  // BookingDocument already marked action_required by staff/provider, or
  // Booking's own admin-set additionalDataRequestNote. Never derived from
  // Event data or any heuristic, and never shown when there is nothing
  // real to act on.
  const necessaryActions: AtuAireMiViajeView["necessaryActions"] = [];
  for (const action of booking.actions) {
    if (action.status !== "pending") continue;
    necessaryActions.push({
      id: `action-${action.id}`,
      title: action.title,
      description: action.description,
      dueAtLabel: action.dueAt ? formatDate(action.dueAt) : null,
      actionHref: action.actionUrl || ACTION_TYPE_FALLBACK_HREF[action.type],
    });
  }
  for (const doc of booking.documents) {
    if (doc.status !== "action_required") continue;
    necessaryActions.push({
      id: `doc-${doc.type}-${doc.eventId}`,
      title: documentLabel(doc, booking.trip.events),
      description: "Este documento necesita revisión. Consulta el detalle para más información.",
      dueAtLabel: null,
      actionHref: DOCUMENT_TYPE_ACTION_HREF[doc.type],
    });
  }
  if (booking.additionalDataRequestNote) {
    necessaryActions.push({
      id: "note",
      title: "Falta información",
      description: booking.additionalDataRequestNote,
      dueAtLabel: null,
      actionHref: "#viajeros",
    });
  }

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
    necessaryActions,
  };
}
