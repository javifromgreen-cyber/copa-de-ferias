import type { FlightProvider, NormalizedFlightOffer } from "../types";

// A handful of deterministic candidate departure times per leg, spread
// across dayparts with different prices (never a single fixed "morning
// price" — the checkout engine derives its own daypart prices by
// filtering + taking the cheapest match, see
// src/lib/checkout-atu-aire/flightOptions.ts). Real morning departures
// tend to be pricier than a late one in most demo carriers' pricing, so
// that's reflected here, but it's just fixture data.
const OUTBOUND_SLOTS = [
  { hour: 7, priceAdjustment: 18 },
  { hour: 13, priceAdjustment: 6 },
  { hour: 19, priceAdjustment: 0 },
];
const RETURN_SLOTS = [
  { hour: 9, priceAdjustment: 12 },
  { hour: 16, priceAdjustment: 0 },
  { hour: 21, priceAdjustment: -6 },
];
const BASE_PRICE = 82;
const LEG_DURATION_MS = 2.5 * 60 * 60_000;

function atHour(day: Date, hour: number): Date {
  const d = new Date(day);
  d.setHours(hour, 0, 0, 0);
  return d;
}

/**
 * Deterministic demo fixture — returns every outbound×return time
 * combination for the requested route/dates as a real candidate offer
 * (varying price and daypart), so the checkout's daypart-preference
 * filtering and "several concrete flight options" requirement (§17) have
 * real data to work with. Callers apply window-buffer and daypart
 * filtering themselves (see flightOptions.ts) — this provider only
 * fabricates the raw candidate set for the given calendar days.
 */
export class MockFlightProvider implements FlightProvider {
  readonly kind = "mock";

  async getOffers(params: { originAirport: string; destinationAirport: string; outboundDate: Date; returnDate: Date }): Promise<NormalizedFlightOffer[]> {
    const offers: NormalizedFlightOffer[] = [];
    for (const out of OUTBOUND_SLOTS) {
      for (const ret of RETURN_SLOTS) {
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
          pricePerPerson: BASE_PRICE + out.priceAdjustment + ret.priceAdjustment,
        });
      }
    }
    return offers;
  }
}
