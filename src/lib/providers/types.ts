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
  /** 0 = direct. A_TU_AIRE only ever sells direct flights (§8) — callers must filter on this, never assume it's already 0. */
  stops: number;
};

export type OriginOption = { iata: string; city: string; airportName: string };

export interface FlightProvider {
  readonly kind: string;
  /**
   * Spanish origin airports with at least one DIRECT route to this
   * destination — the only thing the UI's airport selector is allowed to
   * offer (§6/§7/§9). Never hardcoded in the UI; always derived from
   * what the provider actually has. Returns [] (never throws) when
   * unavailable.
   */
  listDirectOrigins(params: { destinationAirport: string }): Promise<OriginOption[]>;
  /**
   * Returns every real candidate round-trip for the given route and
   * calendar days, direct and connecting alike — daypart/preference
   * filtering AND the direct-only filter happen downstream (see
   * src/lib/checkout-atu-aire/flightOptions.ts), never inside the
   * provider. Returns [] (never throws) when unavailable — e.g. no
   * credentials configured, or no route exists between this origin/destination.
   */
  getOffers(params: { originAirport: string; destinationAirport: string; outboundDate: Date; returnDate: Date }): Promise<NormalizedFlightOffer[]>;
}
