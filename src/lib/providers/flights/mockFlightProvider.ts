import type { FlightProvider, NormalizedFlightLeg, OriginOption } from "../types";

// Deterministic demo route map: which Spanish airports have DIRECT service
// in each direction, per destination. Outbound and return are tracked
// independently — an airport can be direct one way and not the other (§22).
// OVD (Asturias) deliberately has no entry anywhere — it exists only to
// prove an unconnected Spanish airport never shows up in the origin
// selector (§7/§29). SVQ (Sevilla) deliberately has a direct OUTBOUND to
// LHR/MAN but no direct RETURN — it exists to prove an airport direct in
// only one direction is excluded from the eligible-origin list, and that
// its only obtainable leg (a connecting one) never wins on price (§8/§10/§21-22).
const SPANISH_AIRPORTS: Record<string, OriginOption> = {
  MAD: { iata: "MAD", city: "Madrid", airportName: "Adolfo Suárez Madrid-Barajas" },
  BCN: { iata: "BCN", city: "Barcelona", airportName: "Josep Tarradellas Barcelona-El Prat" },
  AGP: { iata: "AGP", city: "Málaga", airportName: "Málaga-Costa del Sol" },
  SVQ: { iata: "SVQ", city: "Sevilla", airportName: "Sevilla" },
  OVD: { iata: "OVD", city: "Asturias", airportName: "Asturias" },
};

const ROUTES: Record<string, { outboundDirect: string[]; returnDirect: string[] }> = {
  LHR: { outboundDirect: ["MAD", "BCN", "AGP", "SVQ"], returnDirect: ["MAD", "BCN", "AGP"] },
  // Both Ámsterdam and Milán have real direct service from more than just
  // Madrid — Barcelona included, so the origin selector never shows a
  // single-airport list when a genuine alternative exists (§6/§7).
  AMS: { outboundDirect: ["MAD", "BCN"], returnDirect: ["MAD", "BCN"] },
  MXP: { outboundDirect: ["MAD", "BCN"], returnDirect: ["MAD", "BCN"] },
  // Manchester — the always-confirmed demo product: MAD/BCN/AGP are
  // genuinely round-trip-direct; SVQ has a direct Friday outbound but no
  // direct Manchester -> Sevilla return, so it's excluded entirely.
  MAN: { outboundDirect: ["MAD", "BCN", "AGP", "SVQ"], returnDirect: ["MAD", "BCN", "AGP"] },
};

type OriginProfile = { base: number; outbound: { hour: number; adj: number }[]; return: { hour: number; adj: number }[] };

// Per-origin candidate departure times, spread across dayparts with
// different prices — never a single fixed "morning price"; the checkout
// engine derives its own daypart prices by filtering + taking the
// cheapest match (see src/lib/checkout-atu-aire/flightOptions.ts). Each
// origin has a genuinely different price profile so the selector actually
// changes what's shown, not just the label (§12). `base` is split roughly
// in half between the outbound and return legs of that origin's fare
// family — the two legs are still priced and selected fully independently.
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

// Per-destination override of the shared profile above — used on the
// Manchester demo so MAD genuinely has NO afternoon return slot (both its
// return times are morning), giving the checkout a real "Tarde — No
// disponible" case on the return leg to verify against (§12/§13), without
// touching MAD's profile for every other destination.
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
    const route = ROUTES[params.destinationAirport];
    if (!route) return [];
    const eligible = route.outboundDirect.filter((iata) => route.returnDirect.includes(iata));
    return eligible.map((iata) => SPANISH_AIRPORTS[iata]);
  }

  async getLegs(params: { originAirport: string; destinationAirport: string; date: Date }): Promise<NormalizedFlightLeg[]> {
    const isOutbound = params.originAirport in SPANISH_AIRPORTS;
    const spanishCode = isOutbound ? params.originAirport : params.destinationAirport;
    const foreignCode = isOutbound ? params.destinationAirport : params.originAirport;

    const route = ROUTES[foreignCode];
    if (!route) return [];

    const directSet = isOutbound ? route.outboundDirect : route.returnDirect;

    if (directSet.includes(spanishCode)) {
      const profile = DESTINATION_PROFILE_OVERRIDES[foreignCode]?.[spanishCode] ?? ORIGIN_PROFILES[spanishCode] ?? ORIGIN_PROFILES.MAD;
      const slots = isOutbound ? profile.outbound : profile.return;
      const outboundBase = Math.ceil(profile.base / 2);
      const returnBase = profile.base - outboundBase;
      const legBase = isOutbound ? outboundBase : returnBase;
      return slots.map((slot) => {
        const departure = atHour(params.date, slot.hour);
        const arrival = new Date(departure.getTime() + LEG_DURATION_MS);
        return {
          id: `mock:${params.originAirport}-${params.destinationAirport}:${isOutbound ? "out" : "ret"}:${slot.hour}`,
          provider: this.kind,
          originAirport: params.originAirport,
          destinationAirport: params.destinationAirport,
          departure,
          arrival,
          pricePerPerson: legBase + slot.adj,
          stops: 0,
        };
      });
    }

    // Not direct in this direction. If this Spanish airport is direct in
    // the OTHER direction (e.g. SVQ, direct outbound but not return), it's
    // still technically reachable via a connection — represented as a
    // single, deliberately cheap connecting leg, cheap enough that it
    // would win on price if the stops filter didn't exist.
    const otherDirectSet = isOutbound ? route.returnDirect : route.outboundDirect;
    if (spanishCode in SPANISH_AIRPORTS && otherDirectSet.includes(spanishCode)) {
      const departure = atHour(params.date, isOutbound ? 11 : 15);
      const arrival = new Date(departure.getTime() + LEG_DURATION_MS * 2);
      return [
        {
          id: `mock:${params.originAirport}-${params.destinationAirport}:connecting`,
          provider: this.kind,
          originAirport: params.originAirport,
          destinationAirport: params.destinationAirport,
          departure,
          arrival,
          pricePerPerson: 25,
          stops: 1,
        },
      ];
    }

    return [];
  }
}
