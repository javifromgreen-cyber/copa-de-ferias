import { describe, it, expect } from "vitest";
import { maskDocNumber } from "@/lib/mi-viaje/masking";
import { bookingStatusLabel, ticketStatusLabel, hotelStatusLabel, flightStatusLabel, documentationStatusLabel } from "@/lib/mi-viaje/statusLabels";
import { deriveHotelWindow } from "@/lib/mi-viaje/hotelWindow";
import { parseHotelSnapshot, parseFlightSnapshot, parsePriceBreakdownSnapshot } from "@/lib/mi-viaje/atuAireSnapshots";
import { eventScheduleCopy } from "@/lib/mi-viaje/scheduleCopy";
import { reconstructRoomAssignments } from "@/lib/mi-viaje/rooming";
import { buildAtuAireMiViajeView, type AtuAireBookingInput } from "@/lib/mi-viaje/buildAtuAireView";

describe("maskDocNumber — never shows a full document number (§12)", () => {
  it("keeps only the last 4 characters of a long document", () => {
    expect(maskDocNumber("12345678A")).toBe("****678A");
  });

  it("masks entirely when the document is 4 characters or shorter", () => {
    expect(maskDocNumber("AB12")).toBe("****");
    expect(maskDocNumber("A")).toBe("*");
  });

  it("returns empty for an empty/blank document, never a bare mask", () => {
    expect(maskDocNumber("")).toBe("");
    expect(maskDocNumber("   ")).toBe("");
  });
});

describe("status label mapping — real enum values only (§32)", () => {
  it("maps every real BookingStatus to a human label", () => {
    expect(bookingStatusLabel("pending_payment")).toBe("Pendiente de pago");
    expect(bookingStatusLabel("confirmed")).toBe("Confirmada");
    expect(bookingStatusLabel("cancelled")).toBe("Cancelada");
    expect(bookingStatusLabel("refunded")).toBe("Reembolsada");
  });

  it("ticket/hotel/flight/documentación each phrase the same enum differently, section-appropriate", () => {
    expect(ticketStatusLabel("pending")).toBe("Pendiente de emisión");
    expect(ticketStatusLabel("delivered")).toBe("Confirmadas");
    expect(hotelStatusLabel("available")).toBe("Reserva confirmada");
    expect(flightStatusLabel("action_required")).toBe("Cancelado / requiere acción");
    expect(documentationStatusLabel("flight", "pending")).toBe("Pendiente de documentación");
    expect(documentationStatusLabel("ticket", "pending")).toBe("Pendiente de emisión");
  });
});

describe("deriveHotelWindow — reproduces the exact checkout query window (§16)", () => {
  it("check-in is one day before the earliest match, check-out one day after the latest", () => {
    const { checkIn, checkOut } = deriveHotelWindow([new Date(2026, 11, 5)]);
    expect(checkIn).toEqual(new Date(2026, 11, 4));
    expect(checkOut).toEqual(new Date(2026, 11, 6));
  });

  it("multi-match: spans from the earliest to the latest Event, regardless of input order", () => {
    const { checkIn, checkOut } = deriveHotelWindow([new Date(2026, 11, 10), new Date(2026, 11, 5)]);
    expect(checkIn).toEqual(new Date(2026, 11, 4));
    expect(checkOut).toEqual(new Date(2026, 11, 11));
  });
});

describe("snapshot parsers — defensive, never throw on bad data", () => {
  it("parses a well-formed hotel snapshot", () => {
    const snap = parseHotelSnapshot(JSON.stringify({ hotelOfferId: "h1", name: "Hotel X", nights: 2, perPersonPrice: 90 }));
    expect(snap).toEqual({ hotelOfferId: "h1", name: "Hotel X", nights: 2, perPersonPrice: 90 });
  });

  it("returns null for an empty string (never contracted)", () => {
    expect(parseHotelSnapshot("")).toBeNull();
    expect(parseFlightSnapshot("")).toBeNull();
    expect(parsePriceBreakdownSnapshot("")).toBeNull();
  });

  it("returns null instead of throwing on malformed JSON", () => {
    expect(parseHotelSnapshot("{not json")).toBeNull();
    expect(parseFlightSnapshot("{not json")).toBeNull();
  });
});

describe("eventScheduleCopy — real ScheduleStatus only, never inventing certainty (§6)", () => {
  it("confirmed: shows the real kickoff time, no extra note", () => {
    const copy = eventScheduleCopy({ matchDate: new Date(2026, 11, 5), kickoff: new Date(2026, 11, 5, 16, 0), scheduleStatus: "confirmed" });
    expect(copy.statusLabel).toBe("Horario confirmado");
    expect(copy.timeLabel).not.toBeNull();
    expect(copy.note).toBeNull();
  });

  it("time_provisional: no time shown, reassurance note present", () => {
    const copy = eventScheduleCopy({ matchDate: new Date(2026, 11, 5), kickoff: null, scheduleStatus: "time_provisional" });
    expect(copy.statusLabel).toBe("Hora pendiente de confirmación");
    expect(copy.timeLabel).toBeNull();
    expect(copy.note).toContain("avisaremos");
  });

  it("date_provisional: explicitly warns the date itself may still change", () => {
    const copy = eventScheduleCopy({ matchDate: new Date(2026, 11, 5), kickoff: null, scheduleStatus: "date_provisional" });
    expect(copy.statusLabel).toBe("Fecha provisional");
    expect(copy.note).toContain("todavía puede cambiar");
  });
});

describe("reconstructRoomAssignments — same pure computation the checkout used (§17)", () => {
  it("party of 2 -> exactly one double room", () => {
    const assignments = reconstructRoomAssignments(2);
    expect(assignments).toEqual([{ type: "double", travelerIndices: [0, 1] }]);
  });

  it("party of 5 -> one triple + one double, filled in list order", () => {
    const assignments = reconstructRoomAssignments(5);
    expect(assignments).toEqual([
      { type: "triple", travelerIndices: [0, 1, 2] },
      { type: "double", travelerIndices: [3, 4] },
    ]);
  });
});

// ---------------------------------------------------------------------
// buildAtuAireMiViajeView — full-view integration over a hand-typed
// AtuAireBookingInput, never a live database (same style as
// buildAtuAireQuote's own tests).
// ---------------------------------------------------------------------
function baseBooking(overrides: Partial<AtuAireBookingInput> = {}): AtuAireBookingInput {
  return {
    reference: "CDF-TEST0001",
    bookingStatus: "confirmed",
    totalPrice: 208,
    currency: "EUR",
    paymentProvider: "demo",
    createdAt: new Date(2026, 7, 1),
    packageType: "TICKET_ONLY",
    partySize: 2,
    hotelSelectionSnapshot: "",
    flightSelectionSnapshot: "",
    priceBreakdownSnapshot: JSON.stringify({ perPerson: 104, total: 208, ticketSelections: { ev1: "General" } }),
    trip: {
      name: "Demo",
      subtitle: "Demo",
      city: "Manchester",
      events: [
        {
          id: "ev1",
          homeTeam: "Manchester City",
          awayTeam: "Manchester United",
          stadium: "Etihad Stadium",
          matchDate: new Date(2026, 11, 5),
          kickoff: new Date(2026, 11, 5, 17, 30),
          scheduleStatus: "confirmed",
          competition: { name: "Premier League" },
          ticketOffers: [{ category: "General", sector: "Away end", restrictions: "DNI obligatorio", deliveryType: "digital" }],
        },
      ],
    },
    travelers: [
      { id: "t1", firstName: "Javier", lastName: "Pérez", nationality: "España", docType: "dni", docNumber: "12345678A", birthDate: new Date(1990, 0, 1), phone: "", emergencyContactName: "", emergencyContactPhone: "" },
      { id: "t2", firstName: "Ana", lastName: "Pérez", nationality: "España", docType: "dni", docNumber: "87654321B", birthDate: null, phone: "", emergencyContactName: "", emergencyContactPhone: "" },
    ],
    documents: [],
    updates: [],
    ...overrides,
  };
}

describe("buildAtuAireMiViajeView — TICKET_ONLY never shows an empty hotel/rooms/flights block (§38)", () => {
  it("hotel, rooms and flights are all null", () => {
    const view = buildAtuAireMiViajeView(baseBooking());
    expect(view.hotel).toBeNull();
    expect(view.rooms).toBeNull();
    expect(view.flights).toBeNull();
  });

  it("still shows the ticket, correctly matched to its TicketOffer", () => {
    const view = buildAtuAireMiViajeView(baseBooking());
    expect(view.events[0].ticket).toEqual({ category: "General", sector: "Away end", restrictions: "DNI obligatorio", deliveryType: "digital", quantity: 2, statusLabel: "Confirmadas" });
  });

  it("masks every traveler's document number", () => {
    const view = buildAtuAireMiViajeView(baseBooking());
    expect(view.travelers[0].maskedDocNumber).toBe("****678A");
    expect(view.travelers[1].maskedDocNumber).toBe("****321B");
  });
});

describe("buildAtuAireMiViajeView — TICKET_HOTEL shows hotel/rooms but never a flight block (§39)", () => {
  it("hotel and rooms are present, flights stays null", () => {
    const view = buildAtuAireMiViajeView(
      baseBooking({
        packageType: "TICKET_HOTEL",
        hotelSelectionSnapshot: JSON.stringify({ hotelOfferId: "h1", name: "Hotel Central Manchester", nights: 2, perPersonPrice: 90 }),
      }),
    );
    expect(view.hotel).not.toBeNull();
    expect(view.hotel?.name).toBe("Hotel Central Manchester");
    expect(view.rooms).toEqual([{ label: "Habitación 1 · Doble", travelerNames: ["Javier Pérez", "Ana Pérez"] }]);
    expect(view.flights).toBeNull();
  });
});

describe("buildAtuAireMiViajeView — TICKET_HOTEL_FLIGHT shows every block (§40)", () => {
  const fullBooking = baseBooking({
    packageType: "TICKET_HOTEL_FLIGHT",
    hotelSelectionSnapshot: JSON.stringify({ hotelOfferId: "h1", name: "Hotel Central Manchester", nights: 2, perPersonPrice: 90 }),
    flightSelectionSnapshot: JSON.stringify({
      outboundLegId: "o1",
      returnLegId: "r1",
      originAirport: "MAD",
      destinationAirport: "MAN",
      outboundDeparture: new Date(2026, 11, 4, 8, 20).toISOString(),
      returnDeparture: new Date(2026, 11, 6, 17, 40).toISOString(),
      outboundPricePerPerson: 34,
      returnPricePerPerson: 34,
    }),
    documents: [
      { type: "ticket", eventId: "ev1", status: "delivered", fileUrl: "" },
      { type: "hotel", eventId: "", status: "available", fileUrl: "" },
      { type: "flight", eventId: "", status: "pending", fileUrl: "" },
    ],
    updates: [{ id: "u1", title: "Tu entrada está disponible.", message: "", createdAt: new Date(2026, 7, 1) }],
  });

  it("hotel, rooms and flights are all present with correct route/status", () => {
    const view = buildAtuAireMiViajeView(fullBooking);
    expect(view.hotel).not.toBeNull();
    expect(view.rooms).not.toBeNull();
    expect(view.flights).not.toBeNull();
    expect(view.flights?.outbound.originAirport).toBe("MAD");
    expect(view.flights?.outbound.destinationAirport).toBe("MAN");
    expect(view.flights?.inbound.originAirport).toBe("MAN");
    expect(view.flights?.outbound.statusLabel).toBe("Pendiente de emisión");
  });

  it("documentación lists one entry per document, with section-correct labels", () => {
    const view = buildAtuAireMiViajeView(fullBooking);
    expect(view.documents).toHaveLength(3);
    expect(view.documents.find((d) => d.label.startsWith("Entrada"))?.statusLabel).toBe("Confirmado");
    expect(view.documents.find((d) => d.label === "Bono de hotel")?.statusLabel).toBe("Disponible");
    expect(view.documents.find((d) => d.label === "Documentación de vuelo")?.statusLabel).toBe("Pendiente de documentación");
  });

  it("updates pass through unchanged, in the order given (caller sorts)", () => {
    const view = buildAtuAireMiViajeView(fullBooking);
    expect(view.updates).toHaveLength(1);
    expect(view.updates[0].title).toBe("Tu entrada está disponible.");
  });

  it("no updates at all -> empty array, never an invented entry (§22)", () => {
    const view = buildAtuAireMiViajeView(baseBooking());
    expect(view.updates).toEqual([]);
  });
});

describe("buildAtuAireMiViajeView — payment never exposes internal cost/fee breakdown (§27)", () => {
  it("only total, status, paid-at and method are present on the payment view", () => {
    const view = buildAtuAireMiViajeView(baseBooking());
    expect(Object.keys(view.payment).sort()).toEqual(["currency", "methodLabel", "paidAtLabel", "statusLabel", "total"]);
    expect(view.payment.total).toBe(208);
  });
});

describe("buildAtuAireMiViajeView — multi-match never fuses two Events into one ticket (§9/§10)", () => {
  it("each Event gets its own independent ticket entry", () => {
    const view = buildAtuAireMiViajeView(
      baseBooking({
        priceBreakdownSnapshot: JSON.stringify({ perPerson: 104, total: 208, ticketSelections: { ev1: "General", ev2: "Members" } }),
        trip: {
          name: "Demo",
          subtitle: "Demo",
          city: "Londres",
          events: [
            { id: "ev1", homeTeam: "Arsenal", awayTeam: "Tottenham", stadium: "Emirates", matchDate: new Date(2026, 11, 5), kickoff: new Date(2026, 11, 5, 16, 0), scheduleStatus: "confirmed", competition: null, ticketOffers: [{ category: "General", sector: "", restrictions: "", deliveryType: "" }] },
            { id: "ev2", homeTeam: "Chelsea", awayTeam: "Arsenal", stadium: "Stamford Bridge", matchDate: new Date(2026, 11, 7), kickoff: null, scheduleStatus: "time_provisional", competition: null, ticketOffers: [{ category: "Members", sector: "", restrictions: "", deliveryType: "" }] },
          ],
        },
      }),
    );
    expect(view.events).toHaveLength(2);
    expect(view.events[0].ticket?.category).toBe("General");
    expect(view.events[1].ticket?.category).toBe("Members");
  });
});
