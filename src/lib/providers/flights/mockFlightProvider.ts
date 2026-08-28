import type { FlightProvider, NormalizedFlightOffer, OriginOption } from "../types";

// Deterministic demo route map: which Spanish airports have DIRECT
// service to each destination, and which only have a connecting
// (stops > 0) option. OVD (Asturias) deliberately has no entry anywhere
// — it exists only to prove an unconnected Spanish airport never shows
// up in the origin selector (§7). SVQ (Sevilla) deliberately has only a
// connecting route to LHR — it exists to prove a stop-only route is
// never offered as a direct origin and never wins on price (§8/§10).
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
};

// Per-origin candidate departure times, spread across dayparts with
// different prices — never a single fixed "morning price"; the checkout
// engine derives its own daypart prices by filtering + taking the
// cheapest match (see src/lib/checkout-atu-aire/flightOptions.ts). Each
// origin has a genuinely different price profile so the selector
// actually changes what's shown, not just the label (§12).
const ORIGIN_PROFILES: Record<string, { base: number; outbound: { hour: number; adj: number }[]; return: { hour: number; adj: number }[] }> = {
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

const LEG_DURATION_MS = 2.5 * 60 * 60_000;

function atHour(day: Date, hour: number): Date {
  const d = new Date(day);
  d.setHours(hour, 0, 0, 0);
  return d;
}

export class MockFlightProvider implements FlightProvider {
  readonly kind = "mock";

  async listDirectOrigins(params: { destinationAirport: string }): Promise<OriginOption[]> {
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
      // A single, deliberately cheap connecting option — cheap enough
      // that it would win on price if the stops filter didn't exist.
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

    const profile = ORIGIN_PROFILES[params.originAirport] ?? ORIGIN_PROFILES.MAD;
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
