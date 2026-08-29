import type { BookingStatus, BookingDocumentStatus } from "@prisma/client";

/**
 * One humanized label per real Booking.bookingStatus value — never a
 * second, invented status vocabulary (§32). Kept here instead of inline so
 * every Mi Viaje section reads the booking's status the same way.
 */
const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  pending_payment: "Pendiente de pago",
  confirmed: "Confirmada",
  cancellation_requested: "Cancelación solicitada",
  cancelled: "Cancelada",
  refund_pending: "Reembolso en curso",
  refunded: "Reembolsada",
};

export function bookingStatusLabel(status: BookingStatus): string {
  return BOOKING_STATUS_LABELS[status] ?? status;
}

/**
 * The same BookingDocumentStatus enum reads differently depending on which
 * block is showing it (§9 entradas, §16 hotel, §19 vuelos, §23
 * documentación all use their own real-world phrasing for the same
 * pending/available/delivered/action_required state) — never a second
 * status enum, just section-appropriate copy over the one real value.
 */
export function ticketStatusLabel(status: BookingDocumentStatus): string {
  switch (status) {
    case "pending":
      return "Pendiente de emisión";
    case "available":
      return "Disponible";
    case "delivered":
      return "Confirmadas";
    case "action_required":
      return "Requiere acción";
  }
}

export function hotelStatusLabel(status: BookingDocumentStatus): string {
  switch (status) {
    case "pending":
      return "Pendiente de confirmación";
    case "available":
    case "delivered":
      return "Reserva confirmada";
    case "action_required":
      return "Requiere acción";
  }
}

export function flightStatusLabel(status: BookingDocumentStatus): string {
  switch (status) {
    case "pending":
      return "Pendiente de emisión";
    case "available":
    case "delivered":
      return "Confirmado";
    case "action_required":
      return "Cancelado / requiere acción";
  }
}

export function documentationStatusLabel(type: "ticket" | "hotel" | "flight" | "other", status: BookingDocumentStatus): string {
  switch (status) {
    case "pending":
      return type === "flight" ? "Pendiente de documentación" : "Pendiente de emisión";
    case "available":
      return "Disponible";
    case "delivered":
      return "Confirmado";
    case "action_required":
      return "Requiere acción";
  }
}
