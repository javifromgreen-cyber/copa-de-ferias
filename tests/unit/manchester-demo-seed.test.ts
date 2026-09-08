import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { seedManchesterDemo, MANCHESTER_DEMO_TRIP_SLUG, ETIHAD_STADIUM_LATITUDE, ETIHAD_STADIUM_LONGITUDE } from "../../prisma/seed-manchester-demo";

// Reproduces, in isolation, the exact production gap reported after the
// first real Vercel deploy: an already-existing Manchester demo Event
// (created before stadiumLatitude/stadiumLongitude existed, or left
// null by an incomplete earlier run) must have its coordinates restored
// by a normal reseed — never only filled in on first `create`. Calls
// seedManchesterDemo directly (the exact function prisma/seed.ts's
// main() now delegates to) rather than running the whole seed script,
// so this never touches Faq/EmailTemplate (which the full script wipes
// and recreates) while other test files may be reading that data in
// parallel.

function params() {
  return { matchDate: new Date("2027-03-06T21:00:00Z"), price: 90, premierLeagueCompetitionId: null };
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe("seedManchesterDemo — stadium coordinates are real operational data, not a one-time seed fill", () => {
  it("restores stadiumLatitude/stadiumLongitude on an already-existing demo Event that has them null (the exact Production gap), on the same row id, not a new one", async () => {
    const first = await seedManchesterDemo(prisma, params());
    expect(first.trip.slug).toBe(MANCHESTER_DEMO_TRIP_SLUG);
    const eventId = first.event.id;
    const tripId = first.trip.id;

    // Simulate the reported Production gap: a real row that predates the
    // stadiumLatitude/stadiumLongitude columns (or was otherwise left
    // null), never coordinates fabricated by this test.
    await prisma.event.update({ where: { id: eventId }, data: { stadiumLatitude: null, stadiumLongitude: null } });
    const nulled = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
    expect(nulled.stadiumLatitude).toBeNull();
    expect(nulled.stadiumLongitude).toBeNull();

    const second = await seedManchesterDemo(prisma, params());

    expect(second.trip.id).toBe(tripId); // same Trip row, never duplicated.
    expect(second.event.id).toBe(eventId); // same Event row, never recreated.
    expect(second.event.stadiumLatitude).toBeCloseTo(ETIHAD_STADIUM_LATITUDE, 4);
    expect(second.event.stadiumLongitude).toBeCloseTo(ETIHAD_STADIUM_LONGITUDE, 4);
  });

  it("stays idempotent: repeated calls never duplicate the Trip/Event/TicketOffer rows", async () => {
    await seedManchesterDemo(prisma, params());
    await seedManchesterDemo(prisma, params());
    await seedManchesterDemo(prisma, params());

    const trips = await prisma.trip.findMany({ where: { slug: MANCHESTER_DEMO_TRIP_SLUG } });
    expect(trips).toHaveLength(1);

    const events = await prisma.event.findMany({ where: { tripId: trips[0].id } });
    expect(events).toHaveLength(1);
    expect(events[0].stadiumLatitude).toBeCloseTo(ETIHAD_STADIUM_LATITUDE, 4);
    expect(events[0].stadiumLongitude).toBeCloseTo(ETIHAD_STADIUM_LONGITUDE, 4);

    const offers = await prisma.ticketOffer.findMany({ where: { eventId: events[0].id } });
    expect(offers).toHaveLength(2); // General + Members, never duplicated across 3 calls.
  });

  it("never deletes or replaces a real Booking that already references this Trip", async () => {
    const { trip } = await seedManchesterDemo(prisma, params());
    const reference = `CDF-COORDTEST-${Date.now()}`;
    const booking = await prisma.booking.create({
      data: {
        tripId: trip.id,
        reference,
        buyerFirstName: "Coord",
        buyerLastName: "Test",
        buyerEmail: "coord-test@example.com",
        buyerPhone: "+34600000000",
        originCity: "Madrid",
        travelersCount: 1,
        totalPrice: 100,
        currency: "EUR",
        paymentProvider: "demo",
        paymentStatus: "paid",
        bookingStatus: "confirmed",
        accessToken: `coord-test-${Date.now()}`,
      },
    });

    await seedManchesterDemo(prisma, params());

    const stillThere = await prisma.booking.findUnique({ where: { id: booking.id } });
    expect(stillThere).not.toBeNull();
    expect(stillThere?.reference).toBe(reference);

    await prisma.booking.delete({ where: { id: booking.id } });
  });
});
