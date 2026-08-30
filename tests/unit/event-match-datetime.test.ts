import { describe, it, expect } from "vitest";
import { combineMatchDateTime, extractMatchTimeUTC } from "@/lib/events/matchDateTime";

describe("combineMatchDateTime / extractMatchTimeUTC — Event matchDate edit regression", () => {
  it("round-trips an existing date+time losslessly (edit-and-save must never drop the hour)", () => {
    const original = new Date("2026-12-05T21:00:00.000Z");
    const time = extractMatchTimeUTC(original);
    const dateStr = original.toISOString().slice(0, 10);
    const rebuilt = combineMatchDateTime(dateStr, time);
    expect(rebuilt.getTime()).toBe(original.getTime());
  });

  it("updates the date while preserving the time when only the date field changes", () => {
    const original = new Date("2026-12-05T21:00:00.000Z");
    const time = extractMatchTimeUTC(original);
    const rebuilt = combineMatchDateTime("2026-12-12", time);
    expect(rebuilt.toISOString()).toBe("2026-12-12T21:00:00.000Z");
  });

  it("updates the time while preserving the date when only the time field changes", () => {
    const dateStr = "2026-12-05";
    const rebuilt = combineMatchDateTime(dateStr, "18:30");
    expect(rebuilt.toISOString()).toBe("2026-12-05T18:30:00.000Z");
  });

  it("falls back to midnight only when the time is genuinely missing/malformed, never silently on a normal save", () => {
    expect(combineMatchDateTime("2026-12-05", "").toISOString()).toBe("2026-12-05T00:00:00.000Z");
    expect(combineMatchDateTime("2026-12-05", "not-a-time").toISOString()).toBe("2026-12-05T00:00:00.000Z");
  });

  it("never introduces a UTC offset relative to the date field's own existing convention", () => {
    // The date input already round-trips via toISOString().slice(0, 10) (UTC) —
    // combining with the time field must stay on that same UTC convention.
    const d = new Date("2026-01-01T05:45:00.000Z");
    expect(extractMatchTimeUTC(d)).toBe("05:45");
  });
});
