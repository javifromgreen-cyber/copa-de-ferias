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

// A single one-way leg — outbound (Spanish airport -> destination) and
// return (destination -> Spanish airport) are independent NormalizedFlightLeg
// instances, each with its own price, never a bundled round-trip fare. This
// is what lets the checkout offer ida and vuelta as two genuinely separate
// decisions, each showing only that leg's own price (§9/§10).
export type NormalizedFlightLeg = {
  id: string;
  provider: string;
  originAirport: string;
  destinationAirport: string;
  departure: Date;
  arrival: Date;
  pricePerPerson: number;
  /** 0 = direct. A_TU_AIRE only ever sells direct flights (§8) — callers must filter on this, never assume it's already 0. */
  stops: number;
};

export type OriginOption = { iata: string; city: string; airportName: string };

export interface FlightProvider {
  readonly kind: string;
  /**
   * Spanish origin airports that can build a full round trip for THIS
   * trip's dates: a DIRECT outbound leg to the destination AND a DIRECT
   * return leg back, both required (§22) — an airport with only one
   * direct direction (e.g. direct outbound but connecting-only return)
   * never appears. The only thing the UI's airport selector is allowed to
   * offer (§6/§7/§9/§23) — never hardcoded in the UI, always derived from
   * what the provider actually has. Returns [] (never throws) when
   * unavailable.
   */
  listEligibleDirectOriginsForTrip(params: { destinationAirport: string; outboundDate: Date; returnDate: Date }): Promise<OriginOption[]>;
  /**
   * Every real candidate leg for this one direction and calendar day,
   * direct and connecting alike — daypart/preference filtering AND the
   * direct-only filter happen downstream (see
   * src/lib/checkout-atu-aire/flightOptions.ts), never inside the
   * provider. Call once with a Spanish originAirport for the outbound leg,
   * and once with a Spanish destinationAirport for the return leg — the
   * two directions are independent queries, never a combined round trip.
   * Returns [] (never throws) when unavailable — e.g. no credentials
   * configured, or no route exists between this origin/destination.
   */
  getLegs(params: { originAirport: string; destinationAirport: string; date: Date }): Promise<NormalizedFlightLeg[]>;
}
