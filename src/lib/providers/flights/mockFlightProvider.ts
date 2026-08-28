import type { FlightProvider, NormalizedFlightOffer, OriginOption } from "../types";

// Deterministic demo route map: which Spanish airports can build a full
// round trip (DIRECT outbound AND DIRECT return) to each destination, and
// which only ever produce a non-round-trip-direct itinerary (either a
// genuinely connecting fare, or direct one way but not the other — both
// cases are observably identical: some offers may exist, but they always
// carry stops > 0, are never round-trip-direct-eligible, and never win on
// price). OVD (Asturias) deliberately has no entry anywhere — it exists
// only to prove an unconnected Spanish airport never shows up in the
// origin selector (§7/§29). SVQ (Sevilla) deliberately falls in the
// "connecting" bucket for every destination below — for LHR it's a
// genuinely connecting fare; for MAN it represents a direct outbound with
// no direct return (§22) — either way it must never appear as an eligible
// origin and never win on price (§8/§10/§21).
const SPANISH_AIRPORTS: Record<string, OriginOption> = {
  MAD: { iata: "MAD", city: "Madrid", airportName: "Adolfo Suárez Madrid-Barajas" },
  BCN: { iata: "BCN", city: "Barcelona", airportName: "Josep Tarradellas Barcelona-El Prat" },
  AGP: { iata: "AGP", city: "Málaga", airportName: "Málaga-Costa del Sol" },
  SVQ: { iata: "SVQ", city: "Sevilla", airportName: "Sevilla" },
  OVD: { iata: "OVD", city: "Asturias", airportName: "Asturias" },
};

const ROUTES: Record<string, { direct: string[]; connecting: string[] }> = {
  LHR: { direct: ["MAD", "BCN", "AGP"], connecting: ["SVQ"] },
  AMS: { direct: ["MAD"], connecting: [] },
  MXP: { direct: ["MAD"], connecting: [] },
  // Manchester — the always-confirmed demo product (§27/§29): MAD/BCN/AGP
  // are genuinely round-trip-direct; SVQ has a direct Friday outbound but
  // no direct Manchester -> Sevilla return, so it's excluded entirely.
  MAN: { direct: ["MAD", "BCN", "AGP"], connecting: ["SVQ"] },
};

type OriginProfile = { base: number; outbound: { hour: number; adj: number }[]; return: { hour: number; adj: number }[] };

// Per-origin candidate departure times, spread across dayparts with
// different prices — never a single fixed "morning price"; the checkout
// engine derives its own daypart prices by filtering + taking the
// cheapest match (see src/lib/checkout-atu-aire/flightOptions.ts). Each
// origin has a genuinely different price profile so the selector
// actually changes what's shown, not just the label (§12).
const ORIGIN_PROFILES: Record<string, OriginProfile> = {
  MAD: {
    base: 71,
    outbound: [
      { hour: 7, adj: 0 },
      { hour: 13, adj: 12 },
      { hour: 19, adj: 6 },
    ],
    return: [
      { hour: 9, adj: 0 },
      { hour: 16, adj: 8 },
      { hour: 21, adj: 32 },
    ],
  },
  BCN: {
    base: 82,
    outbound: [
      { hour: 7, adj: 14 },
      { hour: 13, adj: 6 },
      { hour: 19, adj: 0 },
    ],
    return: [
      { hour: 9, adj: 10 },
      { hour: 16, adj: 0 },
      { hour: 21, adj: 4 },
    ],
  },
  AGP: {
    base: 95,
    outbound: [
      { hour: 8, adj: 10 },
      { hour: 14, adj: 0 },
      { hour: 18, adj: 18 },
    ],
    return: [
      { hour: 10, adj: 0 },
      { hour: 17, adj: 6 },
      { hour: 22, adj: 14 },
    ],
  },
};

// Per-destination overrides of the shared profile above — used on the
// Manchester demo so MAD genuinely has NO afternoon return slot (both its
// return times are morning), giving the checkout a real "Tarde — No
// disponible" case for the return leg to verify against (§25/§30),
// without touching MAD's profile for every other destination.
const DESTINATION_PROFILE_OVERRIDES: Partial<Record<string, Partial<Record<string, OriginProfile>>>> = {
  MAN: {
    MAD: {
      base: 68,
      outbound: [
        { hour: 7, adj: 0 },
        { hour: 13, adj: 9 },
        { hour: 19, adj: 5 },
      ],
      return: [
        { hour: 8, adj: 0 },
        { hour: 11, adj: 6 },
      ],
    },
  },
};

const LEG_DURATION_MS = 2.5 * 60 * 60_000;

function atHour(day: Date, hour: number): Date {
  const d = new Date(day);
  d.setHours(hour, 0, 0, 0);
  return d;
}

export class MockFlightProvider implements FlightProvider {
  readonly kind = "mock";

  // The mock's route table doesn't vary by date, so outboundDate/returnDate
  // aren't used here — a real provider would use them to check actual
  // schedule/inventory for these specific dates (§22).
  async listEligibleDirectOriginsForTrip(params: { destinationAirport: string; outboundDate: Date; returnDate: Date }): Promise<OriginOption[]> {
    void params.outboundDate;
    void params.returnDate;
    const direct = ROUTES[params.destinationAirport]?.direct ?? [];
    return direct.map((iata) => SPANISH_AIRPORTS[iata]);
  }

  async getOffers(params: { originAirport: string; destinationAirport: string; outboundDate: Date; returnDate: Date }): Promise<NormalizedFlightOffer[]> {
    const route = ROUTES[params.destinationAirport];
    if (!route) return [];

    const isDirect = route.direct.includes(params.originAirport);
    const isConnecting = route.connecting.includes(params.originAirport);
    if (!isDirect && !isConnecting) return [];

    if (isConnecting) {
      // A single, deliberately cheap non-round-trip-direct option — cheap
      // enough that it would win on price if the stops filter didn't exist.
      const outboundDeparture = atHour(params.outboundDate, 11);
      const outboundArrival = new Date(outboundDeparture.getTime() + LEG_DURATION_MS * 2);
      const returnDeparture = atHour(params.returnDate, 15);
      const returnArrival = new Date(returnDeparture.getTime() + LEG_DURATION_MS * 2);
      return [
        {
          id: `mock:${params.originAirport}-${params.destinationAirport}:connecting`,
          provider: this.kind,
          originAirport: params.originAirport,
          destinationAirport: params.destinationAirport,
          outboundDeparture,
          outboundArrival,
          returnDeparture,
          returnArrival,
          pricePerPerson: 55,
          stops: 1,
        },
      ];
    }

    const profile = DESTINATION_PROFILE_OVERRIDES[params.destinationAirport]?.[params.originAirport] ?? ORIGIN_PROFILES[params.originAirport] ?? ORIGIN_PROFILES.MAD;
    const offers: NormalizedFlightOffer[] = [];
    for (const out of profile.outbound) {
      for (const ret of profile.return) {
        const outboundDeparture = atHour(params.outboundDate, out.hour);
        const outboundArrival = new Date(outboundDeparture.getTime() + LEG_DURATION_MS);
        const returnDeparture = atHour(params.returnDate, ret.hour);
        const returnArrival = new Date(returnDeparture.getTime() + LEG_DURATION_MS);
        offers.push({
          id: `mock:${params.originAirport}-${params.destinationAirport}:${out.hour}-${ret.hour}`,
          provider: this.kind,
          originAirport: params.originAirport,
          destinationAirport: params.destinationAirport,
          outboundDeparture,
          outboundArrival,
          returnDeparture,
          returnArrival,
          pricePerPerson: profile.base + out.adj + ret.adj,
          stops: 0,
        });
      }
    }
    return offers;
  }
}
