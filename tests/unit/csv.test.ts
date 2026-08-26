import { describe, it, expect } from "vitest";
import { toCsv } from "@/lib/csv";

describe("toCsv", () => {
  it("keeps each field in its own column, not merged into one JSON cell", () => {
    const csv = toCsv(
      ["nombre", "apellidos", "documento"],
      [["Ana", "García", "12345678A"]]
    );
    const [header, row] = csv.split("\n");
    expect(header.split(",")).toEqual(["nombre", "apellidos", "documento"]);
    expect(row.split(",")).toEqual(["Ana", "García", "12345678A"]);
    expect(row).not.toContain("{");
  });

  it("escapes commas and quotes inside a field", () => {
    const csv = toCsv(["texto"], [['Contiene, coma y "comillas"']]);
    expect(csv.split("\n")[1]).toBe('"Contiene, coma y ""comillas"""');
  });
});
