import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { prepareCheckoutAttempt, type PrepareCheckoutAttemptInput } from "@/lib/checkout-saga/prepareCheckoutAttempt";
import { getReadyToPayView } from "@/lib/checkout-saga/resumeCheckoutAttempt";

// Fase 2.5 §22/§25 X — a browser refresh at READY_TO_PAY must reconstruct
// the screen from persisted CheckoutAttempt state only, looked up by the
// opaque accessToken — never from React state the refresh just discarded.

const RUN_ID = `resume-${Date.now()}`;
let tripId: string;
let eventId: string;

beforeAll(async () => {
  const trip = await prisma.trip.create({
    data: { number: 900008, slug: RUN_ID, name: "Test Trip", subtitle: "Test", city: "Test", country: "Test", homeTeam: "A", awayTeam: "B", stadium: "Test", matchDate: new Date(), price: 100, currency: "EUR", travelMode: "A_TU_AIRE", isDemo: true },
  });
  tripId = trip.id;
  const event = await prisma.event.create({ data: { tripId, homeTeam: "A", awayTeam: "B", stadium: "Test", matchDate: new Date() } });
  eventId = event.id;
});

afterAll(async () => {
  await prisma.checkoutAttempt.deleteMany({ where: { tripId } });
  await prisma.ticketOffer.deleteMany({ where: { eventId } });
  await prisma.trip.delete({ where: { id: tripId } });
  await prisma.$disconnect();
});

async function baseInput(): Promise<PrepareCheckoutAttemptInput> {
  const offer = await prisma.ticketOffer.create({ data: { eventId, costNet: 50, currency: "EUR", stock: 10, active: true } });
  return {
    tripId,
    packageType: "TICKET_ONLY",
    partySize: 2,
    travelOriginCountry: "ES",
    buyer: { firstName: "Grace", lastName: "Hopper", email: "grace@example.com", phone: "+34600000002" },
    travelers: [
      { firstName: "Grace", lastName: "Hopper" },
      { firstName: "Alan", lastName: "Turing" },
    ],
    ticket: { ticketOfferId: offer.id, quantity: 2 },
  };
}

describe("X — refreshing at READY_TO_PAY reconstructs the screen from persisted state via accessToken", () => {
  it("getReadyToPayView returns the same snapshot, buyer, and travelers a fresh page load would need", async () => {
    const input = await baseInput();
    const result = await prepareCheckoutAttempt(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const view = await getReadyToPayView(result.accessToken);
    expect(view).not.toBeNull();
    if (!view) return;
    expect(view.checkoutAttemptId).toBe(result.checkoutAttemptId);
    expect(view.buyer.email).toBe("grace@example.com");
    expect(view.travelers.map((t) => `${t.firstName} ${t.lastName}`)).toEqual(["Grace Hopper", "Alan Turing"]);
    expect(view.finalQuoteSnapshot.commercial.pvpTotal).toBe(result.finalQuoteSnapshot.commercial.pvpTotal);
    // N (Fase 2.6 §9) — travelOriginCountry also survives a refresh.
    expect(view.travelOriginCountry).toBe("ES");
  });

  it("an unknown accessToken never reconstructs anything", async () => {
    const view = await getReadyToPayView("this-token-does-not-exist");
    expect(view).toBeNull();
  });

  it("a non-READY_TO_PAY attempt's accessToken never reconstructs a screen (e.g. a still-DRAFT or already-FAILED attempt)", async () => {
    const attempt = await prisma.checkoutAttempt.create({ data: { tripId, packageType: "TICKET_ONLY", partySize: 1, accessToken: `draft-${RUN_ID}` } });
    const view = await getReadyToPayView(attempt.accessToken);
    expect(view).toBeNull();
  });
});
