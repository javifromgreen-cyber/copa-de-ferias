import { describe, it, expect } from "vitest";
import { publicStatusLabel, effectiveStatus, spotsLeft, isSoldOut, hasPublicTripPage } from "@/lib/trips/status";
import type { TripStatus } from "@prisma/client";

describe("publicStatusLabel", () => {
  it("maps internal statuses to the approved Spanish public labels", () => {
    expect(publicStatusLabel("upcoming")).toBe("Próximamente");
    expect(publicStatusLabel("open")).toBe("Abierto");
    expect(publicStatusLabel("sold_out")).toBe("Agotado");
    expect(publicStatusLabel("completed")).toBe("Realizado");
  });

  it("never produces a 'salida garantizada' badge for any status", () => {
    const statuses: TripStatus[] = ["draft", "upcoming", "open", "sold_out", "completed", "archived"];
    for (const status of statuses) {
      expect(publicStatusLabel(status).toLowerCase()).not.toContain("garantizada");
    }
  });
});

describe("effectiveStatus / spotsLeft / isSoldOut", () => {
  it("flips an open trip to sold_out once spots run out", () => {
    const trip = { status: "open" as const, maxSpots: 20, soldSpots: 20 };
    expect(spotsLeft(trip)).toBe(0);
    expect(isSoldOut(trip)).toBe(true);
    expect(effectiveStatus(trip)).toBe("sold_out");
  });

  it("keeps an open trip open while spots remain", () => {
    const trip = { status: "open" as const, maxSpots: 20, soldSpots: 12 };
    expect(spotsLeft(trip)).toBe(8);
    expect(effectiveStatus(trip)).toBe("open");
  });

  it("never reports negative spots left even if oversold data slips through", () => {
    const trip = { status: "open" as const, maxSpots: 20, soldSpots: 25 };
    expect(spotsLeft(trip)).toBe(0);
  });
});

describe("hasPublicTripPage", () => {
  it("only trips explicitly marked published get a public ficha", () => {
    expect(hasPublicTripPage({ published: true })).toBe(true);
    expect(hasPublicTripPage({ published: false })).toBe(false);
  });
});
