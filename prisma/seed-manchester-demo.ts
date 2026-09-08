import type { PrismaClient } from "@prisma/client";

/**
 * The Manchester A_TU_AIRE demo product's stadium — extracted out of
 * seed.ts's main() so this specific upsert (and, critically, its
 * coordinate-backfill behavior on an already-existing Event row) can be
 * exercised directly by a test without running the whole seed script
 * (which also wipes/reseeds Faq/EmailTemplate — safe for a real seed run,
 * but not something a single test file should risk doing while other
 * test files may be reading that same data in parallel).
 */
export const MANCHESTER_DEMO_TRIP_SLUG = "manchester-a-tu-aire";
/** Real Etihad Stadium coordinates — the only geographic reference point automatic hotel selection uses for this demo Event. Never hardcoded anywhere outside this seed module. */
export const ETIHAD_STADIUM_LATITUDE = 53.4831;
export const ETIHAD_STADIUM_LONGITUDE = -2.2004;
export const ETIHAD_STADIUM_HOTEL_RADIUS_KM = 5;

/**
 * Idempotent by natural key (Trip.slug / Event tripId+primaryEvent /
 * TicketOffer eventId+category) instead of deleteMany-then-create: this
 * runs against persistent PostgreSQL, where a genuine
 * CheckoutAttempt/TicketHold/Booking may already reference this Trip's
 * Event/TicketOffer rows (all FKs onDelete: Restrict) — a bare
 * deleteMany would either be rejected by Postgres or, worse, wipe and
 * recreate the row with a NEW id, orphaning that operational data.
 *
 * Every call — including one against a row created before
 * stadiumLatitude/stadiumLongitude existed, or one that was otherwise
 * left null (the real production gap this module fixes) — re-asserts
 * the full demoDEventData object on the existing row via `update`, so a
 * second/Nth call always restores the coordinates rather than only
 * filling them in on first `create`. See manchester-demo-seed.test.ts.
 */
export async function seedManchesterDemo(
  prisma: PrismaClient,
  params: { matchDate: Date; price: number; premierLeagueCompetitionId: string | null },
) {
  const demoDTripData = {
    number: 7,
    name: "Manchester",
    subtitle: "Derbi de Manchester",
    city: "Manchester",
    country: "Inglaterra",
    homeTeam: "Manchester City",
    awayTeam: "Manchester United",
    stadium: "Etihad Stadium",
    matchDate: params.matchDate,
    durationDays: 3,
    durationNights: 2,
    status: "open" as const,
    published: true,
    homeFeatured: true,
    order: 6,
    isDemo: true,
    price: params.price,
    scheduleStatus: "confirmed" as const,
    travelMode: "A_TU_AIRE" as const,
    maxPartySize: 10,
    availablePackageTypes: "TICKET_ONLY,TICKET_HOTEL,TICKET_HOTEL_FLIGHT",
    heroImageKey: "manchester",
    description: "Producto de prueba A_TU_AIRE — horario confirmado, pensado para recorrer todo el checkout de principio a fin.",
    seoTitle: "Manchester — Derbi de Manchester | Copa de Ferias",
    seoDescription: "Manchester City - Manchester United, a tu aire.",
  };
  const demoD = await prisma.trip.upsert({
    where: { slug: MANCHESTER_DEMO_TRIP_SLUG },
    update: demoDTripData,
    create: { slug: MANCHESTER_DEMO_TRIP_SLUG, ...demoDTripData },
  });
  const demoDEventData = {
    tripId: demoD.id,
    competitionId: params.premierLeagueCompetitionId,
    homeTeam: "Manchester City",
    awayTeam: "Manchester United",
    stadium: "Etihad Stadium",
    stadiumLatitude: ETIHAD_STADIUM_LATITUDE,
    stadiumLongitude: ETIHAD_STADIUM_LONGITUDE,
    stadiumHotelRadiusKm: ETIHAD_STADIUM_HOTEL_RADIUS_KM,
    city: "Manchester",
    country: "Inglaterra",
    timezone: "Europe/London",
    matchDate: params.matchDate,
    kickoff: new Date(new Date(params.matchDate).setHours(17, 30, 0, 0)),
    scheduleStatus: "confirmed" as const,
    status: "published" as const,
    primaryEvent: true,
    order: 0,
  };
  const existingDemoDEvent = await prisma.event.findFirst({ where: { tripId: demoD.id, primaryEvent: true } });
  const demoDEvent = existingDemoDEvent
    ? await prisma.event.update({ where: { id: existingDemoDEvent.id }, data: demoDEventData })
    : await prisma.event.create({ data: demoDEventData });

  const demoDOffers = [
    { category: "General", sector: "Away end", costNet: 55, currency: "EUR", stock: 100, deliveryType: "digital" as const, active: true, restrictions: "Documento de identidad obligatorio en el acceso." },
    { category: "Members", sector: "Tier 1", costNet: 105, currency: "EUR", stock: 25, deliveryType: "digital" as const, active: true },
  ];
  for (const offer of demoDOffers) {
    const existingOffer = await prisma.ticketOffer.findFirst({ where: { eventId: demoDEvent.id, category: offer.category } });
    const offerData = { eventId: demoDEvent.id, provider: "manual", ...offer };
    if (existingOffer) {
      await prisma.ticketOffer.update({ where: { id: existingOffer.id }, data: offerData });
    } else {
      await prisma.ticketOffer.create({ data: offerData });
    }
  }

  return { trip: demoD, event: demoDEvent };
}
