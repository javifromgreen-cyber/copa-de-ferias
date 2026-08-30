import type { TravelMode } from "@prisma/client";
import { formatCurrency } from "@/lib/utils";
import { getSiteUrl } from "@/lib/env";
import type { EmailVariables } from "./render";

/**
 * The one place every booking-lifecycle email (confirmación, acción
 * necesaria, cambio importante, recordatorio, gracias) builds its shared
 * variables from — so the same fields always mean the same thing and no
 * call site re-derives matchName/myTripUrl its own way. Only ever built
 * from real booking/trip data, never invented (§6 of the email block).
 */
export type BookingVariablesInput = {
  reference: string;
  accessToken: string;
  buyerFirstName: string;
  totalPrice: number;
  currency: string;
  travelersCount: number;
  partySize: number | null;
};

export type TripVariablesInput = {
  name: string;
  homeTeam: string;
  awayTeam: string;
  travelMode: TravelMode;
};

const TRAVEL_MODE_LABELS: Record<TravelMode, string> = {
  A_TU_AIRE: "A TU AIRE",
  GROUP_CDF: "GRUPO CDF",
};

export function buildBookingEmailVariables(booking: BookingVariablesInput, trip: TripVariablesInput): EmailVariables {
  const matchName = trip.homeTeam && trip.awayTeam ? `${trip.homeTeam} – ${trip.awayTeam}` : trip.name;

  return {
    customerName: booking.buyerFirstName,
    tripName: trip.name,
    matchName,
    bookingReference: booking.reference,
    total: formatCurrency(booking.totalPrice, booking.currency),
    partySize: String(booking.partySize ?? booking.travelersCount),
    travelMode: TRAVEL_MODE_LABELS[trip.travelMode],
    myTripUrl: `${getSiteUrl()}/mi-viaje/${booking.accessToken}`,
  };
}
