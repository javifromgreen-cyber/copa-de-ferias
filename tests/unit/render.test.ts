import { describe, it, expect } from "vitest";
import { renderTemplate } from "@/lib/email/render";

describe("renderTemplate", () => {
  it("substitutes known {{variables}}", () => {
    const result = renderTemplate("Hola {{firstName}}, tu viaje es {{tripName}}", {
      firstName: "Ana",
      tripName: "Belgrado",
    });
    expect(result).toBe("Hola Ana, tu viaje es Belgrado");
  });

  it("leaves unknown variables untouched instead of crashing", () => {
    const result = renderTemplate("Hola {{firstName}}, {{unknownVar}}", { firstName: "Ana" });
    expect(result).toBe("Hola Ana, {{unknownVar}}");
  });
});
