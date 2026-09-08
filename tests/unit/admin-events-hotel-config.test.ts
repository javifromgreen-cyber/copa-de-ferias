import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";
import { saveEvent, type EventFormInput } from "@/server/actions/admin-events";

// saveEvent calls revalidatePath, which requires a real Next.js request
// context this plain vitest run doesn't have — mocked as a no-op, same
// as any other test exercising a server action outside of Next itself.
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

// Fase 3B.2 correction — Event.stadiumLatitude/stadiumLongitude are now
// real operational data, editable in Admin, and gated at publish time
// for any A_TU_AIRE Event (which always conceptually offers TICKET_HOTEL
// — §1/§5). This must be caught here, never discovered for the first
// time by a customer at checkout (see real-checkout-search.test.ts's
// "Config gap" block for the public-facing side of this correction).

const RUN_ID = `admin-events-hotel-${Date.now()}`;
let atuAireTripId: string;
let groupCdfTripId: string;
let competitionId: string;

beforeAll(async () => {
  const competition = await prisma.competition.create({ data: { name: `Test League ${RUN_ID}`, region: "EUROPE", competitionType: "DOMESTIC_LEAGUE" } });
  competitionId = competition.id;

  const atuAireTrip = await prisma.trip.create({
    data: {
      number: 900009,
      slug: `${RUN_ID}-atu-aire`,
      name: "Test A_TU_AIRE",
      subtitle: "Test",
      city: "Manchester",
      country: "Reino Unido",
      homeTeam: "A",
      awayTeam: "B",
      stadium: "Test",
      matchDate: new Date(),
      price: 100,
      currency: "EUR",
      travelMode: "A_TU_AIRE",
      published: false,
      isDemo: true,
    },
  });
  atuAireTripId = atuAireTrip.id;

  const groupCdfTrip = await prisma.trip.create({
    data: {
      number: 900010,
      slug: `${RUN_ID}-group-cdf`,
      name: "Test GROUP_CDF",
      subtitle: "Test",
      city: "Manchester",
      country: "Reino Unido",
      homeTeam: "A",
      awayTeam: "B",
      stadium: "Test",
      matchDate: new Date(),
      price: 100,
      currency: "EUR",
      travelMode: "GROUP_CDF",
      published: false,
      isDemo: true,
    },
  });
  groupCdfTripId = groupCdfTrip.id;
});

afterAll(async () => {
  await prisma.event.deleteMany({ where: { tripId: { in: [atuAireTripId, groupCdfTripId] } } });
  await prisma.trip.deleteMany({ where: { id: { in: [atuAireTripId, groupCdfTripId] } } });
  await prisma.competition.delete({ where: { id: competitionId } });
  await prisma.$disconnect();
});

function baseInput(overrides: Partial<EventFormInput> = {}): EventFormInput {
  return {
    tripId: atuAireTripId,
    competitionId,
    name: "",
    homeTeam: "Manchester City",
    awayTeam: "Manchester United",
    stadium: "Etihad Stadium",
    stadiumLatitude: null,
    stadiumLongitude: null,
    city: "Manchester",
    country: "Reino Unido",
    timezone: "Europe/London",
    matchDate: "2027-05-01",
    matchTime: "20:00",
    kickoff: "",
    scheduleStatus: "confirmed",
    status: "draft",
    imageKey: "default",
    primaryEvent: true,
    order: 0,
    ...overrides,
  };
}

describe("saveEvent — stadium coordinates are saved as real Event data", () => {
  it("persists stadiumLatitude/stadiumLongitude on create", async () => {
    const result = await saveEvent(baseInput({ stadiumLatitude: 53.4831, stadiumLongitude: -2.2004 }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const event = await prisma.event.findUniqueOrThrow({ where: { id: result.id } });
    expect(event.stadiumLatitude).toBeCloseTo(53.4831, 4);
    expect(event.stadiumLongitude).toBeCloseTo(-2.2004, 4);
  });

  it("persists an update to existing coordinates", async () => {
    const created = await saveEvent(baseInput({ stadiumLatitude: 1, stadiumLongitude: 1 }));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const updated = await saveEvent(baseInput({ id: created.id, stadiumLatitude: 53.4831, stadiumLongitude: -2.2004 }));
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    const event = await prisma.event.findUniqueOrThrow({ where: { id: updated.id } });
    expect(event.stadiumLatitude).toBeCloseTo(53.4831, 4);
    expect(event.stadiumLongitude).toBeCloseTo(-2.2004, 4);
  });
});

describe("saveEvent — publishing an A_TU_AIRE Event without stadium coordinates is blocked", () => {
  it("rejects publishing when coordinates are missing", async () => {
    const result = await saveEvent(baseInput({ status: "published", stadiumLatitude: null, stadiumLongitude: null }));
    expect(result.ok).toBe(false);
  });

  it("allows publishing once both coordinates are set", async () => {
    const result = await saveEvent(baseInput({ status: "published", stadiumLatitude: 53.4831, stadiumLongitude: -2.2004 }));
    expect(result.ok).toBe(true);
  });

  it("never blocks a GROUP_CDF Event on missing coordinates — it has no automatic hotel search", async () => {
    const result = await saveEvent(
      baseInput({ tripId: groupCdfTripId, status: "published", stadiumLatitude: null, stadiumLongitude: null }),
    );
    expect(result.ok).toBe(true);
  });

  it("still allows saving a draft A_TU_AIRE Event without coordinates — the gate is only at publish time", async () => {
    const result = await saveEvent(baseInput({ status: "draft", stadiumLatitude: null, stadiumLongitude: null }));
    expect(result.ok).toBe(true);
  });
});
