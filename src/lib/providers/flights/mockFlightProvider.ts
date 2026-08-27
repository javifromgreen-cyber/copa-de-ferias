import type { FlightProvider, NormalizedFlightOffer, Daypart } from "../types";

const DAYPART_HOUR: Record<Daypart, number> = { morning: 9, midday: 13, afternoon: 17, night: 21 };

/**
 * Deterministic demo fixture. Always returns one round-trip offer per
 * requested daypart combination (defaulting to morning-out/night-back),
 * anchored two days before "now" for the outbound leg — callers are
 * expected to re-anchor via filterFlightOffersByWindow against the
 * trip's real stay window, this provider only fabricates raw offers.
 */
export class MockFlightProvider implements FlightProvider {
  readonly kind = "mock";

  async getOffers(params: {
    originAirport: string;
    destinationAirport: string;
    outboundDaypart?: Daypart;
    returnDaypart?: Daypart;
  }): Promise<NormalizedFlightOffer[]> {
    const outboundHour = DAYPART_HOUR[params.outboundDaypart ?? "morning"];
    const returnHour = DAYPART_HOUR[params.returnDaypart ?? "night"];

    const outboundDeparture = new Date();
    outboundDeparture.setHours(outboundHour, 0, 0, 0);
    const outboundArrival = new Date(outboundDeparture.getTime() + 3 * 60 * 60_000);

    const returnDeparture = new Date(outboundDeparture);
    returnDeparture.setDate(returnDeparture.getDate() + 2);
    returnDeparture.setHours(returnHour, 0, 0, 0);
    const returnArrival = new Date(returnDeparture.getTime() + 3 * 60 * 60_000);

    return [
      {
        id: `mock:${params.originAirport}-${params.destinationAirport}`,
        provider: this.kind,
        originAirport: params.originAirport,
        destinationAirport: params.destinationAirport,
        outboundDeparture,
        outboundArrival,
        returnDeparture,
        returnArrival,
        pricePerPerson: 120,
      },
    ];
  }
}
