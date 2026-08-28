import { describe, it, expect } from "vitest";
import { isKnownTeamName } from "@/lib/trips/status";
import { scheduleStatusPublicLabel } from "@/lib/catalog/labels";
import { groupFaqsByCategory, faqCategoryLabel, FAQ_CATEGORY_ORDER } from "@/lib/faq/categories";
import { getAtuAireFaqItems } from "@/lib/faq/tripFaq";

describe("isKnownTeamName", () => {
  it("treats the 'Por confirmar' seed placeholder as an unknown team", () => {
    expect(isKnownTeamName("Por confirmar")).toBe(false);
    expect(isKnownTeamName("por confirmar")).toBe(false);
    expect(isKnownTeamName("")).toBe(false);
  });

  it("treats any other name as a real, known team", () => {
    expect(isKnownTeamName("Ajax")).toBe(true);
    expect(isKnownTeamName("Manchester United")).toBe(true);
  });
});

describe("scheduleStatusPublicLabel", () => {
  it("shows an explicit affirmative badge only when confirmed, and never relies on color alone (§8/§50)", () => {
    expect(scheduleStatusPublicLabel("confirmed")).toEqual({ text: "Horario confirmado", confirmed: true });
    expect(scheduleStatusPublicLabel("time_provisional").confirmed).toBe(false);
    expect(scheduleStatusPublicLabel("date_provisional").confirmed).toBe(false);
  });

  it("never reads as alarmist for a provisional schedule", () => {
    const provisional = [scheduleStatusPublicLabel("time_provisional").text, scheduleStatusPublicLabel("date_provisional").text];
    for (const text of provisional) {
      expect(text.toLowerCase()).not.toMatch(/cancelad|urgente|atención/);
    }
  });
});

describe("groupFaqsByCategory", () => {
  it("orders known categories per FAQ_CATEGORY_ORDER and skips categories with no rows", () => {
    const faqs = [
      { id: "1", category: "vuelos", question: "q1", answer: "a1" },
      { id: "2", category: "antes-de-reservar", question: "q2", answer: "a2" },
    ];
    const groups = groupFaqsByCategory(faqs);
    expect(groups.map((g) => g.category)).toEqual(["antes-de-reservar", "vuelos"]);
    expect(groups[0].label).toBe(faqCategoryLabel("antes-de-reservar"));
  });

  it("falls back an unknown/legacy category to the end under a generic label", () => {
    const faqs = [{ id: "1", category: "", question: "q", answer: "a" }];
    const groups = groupFaqsByCategory(faqs);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("Otras preguntas");
  });

  it("every entry in FAQ_CATEGORY_ORDER has a real label", () => {
    for (const category of FAQ_CATEGORY_ORDER) {
      expect(faqCategoryLabel(category)).not.toBe("Otras preguntas");
    }
  });
});

describe("getAtuAireFaqItems", () => {
  const matchDate = new Date("2026-12-05T21:00:00Z");

  it("always returns exactly 1 dynamic schedule item + 4 static universal items", () => {
    const items = getAtuAireFaqItems({ matchDate, scheduleStatus: "confirmed" });
    expect(items).toHaveLength(5);
    expect(items[0].id).toBe("schedule");
  });

  it("the dynamic schedule Q&A varies by the trip's real scheduleStatus", () => {
    const confirmed = getAtuAireFaqItems({ matchDate, scheduleStatus: "confirmed" });
    const timeProvisional = getAtuAireFaqItems({ matchDate, scheduleStatus: "time_provisional" });
    const dateProvisional = getAtuAireFaqItems({ matchDate, scheduleStatus: "date_provisional" });

    expect(confirmed[0].answer).not.toEqual(timeProvisional[0].answer);
    expect(timeProvisional[0].answer).not.toEqual(dateProvisional[0].answer);
    expect(confirmed[0].answer).toMatch(/confirmado/i);
  });

  it("never overpromises seat selection or exact ticket delivery — always prudent, provider-dependent language", () => {
    const items = getAtuAireFaqItems({ matchDate, scheduleStatus: "confirmed" });
    const seatItem = items.find((i) => i.id === "asiento")!;
    expect(seatItem.answer.toLowerCase()).toMatch(/depende/);
  });
});
