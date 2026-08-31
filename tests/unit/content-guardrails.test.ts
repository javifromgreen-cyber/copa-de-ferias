import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const SRC_DIR = path.resolve(__dirname, "../../src");
const FORBIDDEN = [
  "salida garantizada",
  "nomad",
  "awayday",
  // Match-first phase (§0): never communicate cupos, headcounts, or the
  // retired GROUP_CDF "grupo cerrado" framing on any public surface.
  "cupos",
  "personas apuntadas",
  "plazas disponibles",
  "grupos cdf",
];

function walk(dir: string): string[] {
  const entries = readdirSync(dir);
  let files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) files = files.concat(walk(full));
    else if (/\.(ts|tsx)$/.test(entry)) files.push(full);
  }
  return files;
}

describe("brand-language guardrails", () => {
  it("never ships 'salida garantizada', Nomad/AwayDay language, or a Duffel integration", () => {
    const offenders: string[] = [];
    for (const file of walk(SRC_DIR)) {
      const content = readFileSync(file, "utf-8").toLowerCase();
      for (const term of FORBIDDEN) {
        if (content.includes(term)) offenders.push(`${term} → ${path.relative(SRC_DIR, file)}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
