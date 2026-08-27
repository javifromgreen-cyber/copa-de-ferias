import { describe, it, expect } from "vitest";
import { KNOWN_COMPETITIONS } from "@/lib/catalog/knownCompetitions";

function find(name: string) {
  const found = KNOWN_COMPETITIONS.find((c) => c.name === name);
  if (!found) throw new Error(`Competition fixture not found: ${name}`);
  return found;
}

describe("known-competitions classification", () => {
  it("Premier League → Europe / England / domestic league", () => {
    const c = find("Premier League");
    expect(c.region).toBe("EUROPE");
    expect(c.country).toBe("England");
    expect(c.competitionType).toBe("DOMESTIC_LEAGUE");
  });

  it("Champions League → Europe / continental competition, no single country", () => {
    const c = find("Champions League");
    expect(c.region).toBe("EUROPE");
    expect(c.competitionType).toBe("CONTINENTAL_COMPETITION");
    expect(c.country).toBe("");
  });

  it("Copa Libertadores → South America / continental competition, no single country", () => {
    const c = find("Copa Libertadores");
    expect(c.region).toBe("SOUTH_AMERICA");
    expect(c.competitionType).toBe("CONTINENTAL_COMPETITION");
    expect(c.country).toBe("");
  });

  it("every known competition has a non-empty name and a valid region/type", () => {
    const validRegions = ["EUROPE", "SOUTH_AMERICA", "NORTH_AMERICA", "ASIA", "AFRICA", "OCEANIA"];
    const validTypes = ["DOMESTIC_LEAGUE", "DOMESTIC_CUP", "CONTINENTAL_COMPETITION", "OTHER"];
    for (const c of KNOWN_COMPETITIONS) {
      expect(c.name.trim().length).toBeGreaterThan(0);
      expect(validRegions).toContain(c.region);
      expect(validTypes).toContain(c.competitionType);
    }
  });

  it("has no duplicate (name, region) pairs — matches the DB's unique constraint", () => {
    const keys = KNOWN_COMPETITIONS.map((c) => `${c.name}::${c.region}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
