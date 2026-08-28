import type { PackageType, ScheduleStatus } from "@prisma/client";
import type { NormalizedHotelOffer, NormalizedFlightOffer, OriginOption } from "@/lib/providers/types";
import type { RoomMixEntry } from "@/lib/pricing/roomMix";

export type { OriginOption } from "@/lib/providers/types";

export type FlightDaypartPreference = "ANY" | "MORNING" | "AFTERNOON";

export type EventSummary = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  stadium: string;
  city: string;
  matchDate: Date;
  scheduleStatus: ScheduleStatus;
  primaryEvent: boolean;
};

// The user's raw choices — the only thing the client actually holds as
// state. Everything else (prices, which options are valid/available) is
// always freshly derived from this by buildAtuAireQuote, never stored
// separately (§22 — derived state, not duplicated state).
export type AtuAireSelection = {
  buyerCountry: string | null;
  packageType: PackageType | null;
  partySize: number | null;
  ticketSelections: Record<string, string>; // eventId -> category, one entry per Event
  nights: 1 | 2 | null;
  hotelOfferId: string | null;
  originAirport: string | null; // Spanish IATA code, explicit customer choice — never assumed
  outboundPreference: FlightDaypartPreference;
  returnPreference: FlightDaypartPreference;
  flightOfferId: string | null;
};

export const DEFAULT_SELECTION: AtuAireSelection = {
  buyerCountry: null,
  packageType: null,
  partySize: null,
  ticketSelections: {},
  nights: null,
  hotelOfferId: null,
  originAirport: null,
  outboundPreference: "ANY",
  returnPreference: "ANY",
  flightOfferId: null,
};

export type TicketCategoryOption = {
  category: string;
  sector: string;
  restrictions: string;
  totalCostNetPerPerson: number;
  deltaFromCheapest: number;
};

export type HotelOptionView = {
  offer: NormalizedHotelOffer;
  totalPrice: number;
  perPersonPrice: number;
  valid: boolean;
  invalidReason?: string;
};

export type FlightPreferenceOption = {
  value: FlightDaypartPreference;
  label: string;
  priceFromPerPerson: number | null;
};

export type FlightOfferView = {
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

export type PriceLabel = "from" | "estimated" | "total";

export type PackageTypeOption = {
  packageType: PackageType;
  label: string;
  description: string;
  fromPricePerPerson: number;
};

export type FlightAvailability = { blocked: true; reason: string } | { blocked: false };

export type AtuAireQuote = {
  trip: { id: string; slug: string; name: string; subtitle: string; city: string; maxPartySize: number };
  events: EventSummary[];
  flightPackageEligible: boolean;
  packageTypeOptions: PackageTypeOption[];
  partySizeLimits: { min: number; max: number };
  ticketOptionsByEvent: Record<string, TicketCategoryOption[]>;
  roomMix: RoomMixEntry[] | null;
  hotelOptions: HotelOptionView[];
  eligibleOrigins: OriginOption[];
  flightAvailability: FlightAvailability;
  outboundPreferenceOptions: FlightPreferenceOption[];
  returnPreferenceOptions: FlightPreferenceOption[];
  flightOffers: FlightOfferView[];
  price: {
    label: PriceLabel;
    totalCommercial: number | null;
    perPerson: number | null;
    missing: string[];
  };
  additionalMatchFeeApplies: boolean;
};

// Raw inputs the pure builder needs — assembled server-side from Prisma +
// the mock providers, then handed to buildAtuAireQuote (which never
// touches the database or a provider itself).
export type AtuAireQuoteData = {
  trip: {
    id: string;
    slug: string;
    name: string;
    subtitle: string;
    city: string;
    maxPartySize: number;
    availablePackageTypes: PackageType[];
    minimumArrivalBufferBeforeKickoffMinutes: number;
    minimumReturnBufferAfterEventMinutes: number;
    orgFeeTicketOnlyOverride: number | null;
    orgFeeHotelTiersOverride: string;
    orgFeeHotelFlightTiersOverride: string;
    additionalMatchFeeOverride: number | null;
  };
  events: EventSummary[];
  ticketOffersByEventId: Record<string, { id: string; category: string; sector: string; costNet: number; restrictions: string }[]>;
  hotelOffers: NormalizedHotelOffer[];
  // Merged across every eligible Spanish origin (each offer carries its
  // own originAirport) — [] whenever the buyer isn't flight-eligible, no
  // package on this trip requires a flight, or no eligible origin exists.
  eligibleOrigins: OriginOption[];
  flightOffers: NormalizedFlightOffer[];
  feeConfig: { feeTicketOnly: number; feeHotelTiers: string; feeHotelFlightTiers: string; additionalMatchFee: number };
  revalidated: boolean;
};
