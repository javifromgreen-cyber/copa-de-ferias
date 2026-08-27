// Normalized offer shapes every concrete provider (manual/mock/real) maps
// into, so the checkout/pricing engine never talks to a provider-specific
// response format directly (same pattern as src/lib/payments and
// src/lib/email — a thin interface trio, swappable without touching UI).

export type NormalizedTicketOffer = {
  id: string;
  eventId: string;
  provider: string;
  category: string;
  sector: string;
  costNet: number;
  stock: number;
  seatingTogetherGuaranteed: boolean;
  deliveryType: string;
  deliveryNotes: string;
  validUntil: Date | null;
};

export interface TicketProvider {
  readonly kind: string;
  getOffers(eventId: string): Promise<NormalizedTicketOffer[]>;
}

export type HotelRoomPrices = { single: number; double: number; triple: number };
export type HotelRoomInventory = { single: number; double: number; triple: number };

export type NormalizedHotelOffer = {
  id: string;
  provider: string;
  name: string;
  stars: number;
  zone: string;
  pricePerNight: HotelRoomPrices;
  roomsAvailable: HotelRoomInventory;
  validUntil: Date | null;
};

export interface HotelProvider {
  readonly kind: string;
  getOffers(params: { tripId: string; city: string; checkIn: Date; checkOut: Date }): Promise<NormalizedHotelOffer[]>;
}

export type Daypart = "morning" | "midday" | "afternoon" | "night";

export type NormalizedFlightOffer = {
  id: string;
  provider: string;
  originAirport: string;
  destinationAirport: string;
  outboundDeparture: Date;
  outboundArrival: Date;
  returnDeparture: Date;
  returnArrival: Date;
  pricePerPerson: number;
};

export interface FlightProvider {
  readonly kind: string;
  /** Returns [] (never throws) when unavailable — e.g. no credentials configured. */
  getOffers(params: {
    originAirport: string;
    destinationAirport: string;
    outboundDaypart?: Daypart;
    returnDaypart?: Daypart;
  }): Promise<NormalizedFlightOffer[]>;
}
