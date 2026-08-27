import { test, expect, type Page } from "@playwright/test";

/**
 * Real end-to-end coverage of the new progressive A_TU_AIRE checkout
 * against the three seeded demo products (§32). Read-mostly: only the
 * Londres flight scenario touches Admin config, and it always reverts in
 * a `finally` block, matching the established pattern in
 * required-fields-admin.spec.ts.
 */

async function loginAdmin(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Contraseña").fill("cambia-esta-clave");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/admin$/);
}

async function setLondresSecondMatchSchedule(page: Page, status: "Confirmado" | "Provisional") {
  await page.goto("/admin/eventos");
  await page.getByRole("link", { name: /Chelsea vs Arsenal/ }).click();
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Horario").selectOption({ label: status });
  await page.getByRole("button", { name: "Guardar evento" }).click();
  await page.waitForURL(/\/admin\/eventos\/[a-z0-9]+$/);
}

test.describe("A_TU_AIRE checkout — Ámsterdam (ticket-only)", () => {
  test("modality -> travelers -> ticket -> summary, back-and-change updates price", async ({ page }) => {
    await page.goto("/viajes/amsterdam-de-klassieker/reservar");
    await page.waitForSelector("text=¿Qué quieres reservar?");

    // Only one modality is configured for this product — TICKET_ONLY.
    const packageSection = page.locator("section", { has: page.getByText("¿Qué quieres reservar?") });
    await expect(packageSection.getByText("Entrada + Hotel", { exact: true })).toHaveCount(0);
    await expect(packageSection.getByText("Solo la entrada para el partido.")).toBeVisible();

    await packageSection.locator("button").first().click();
    await page.waitForSelector("text=¿Cuántos viajeros sois?");
    await page.getByRole("button", { name: "Más viajeros" }).click();

    await page.waitForSelector("text=Elige tu entrada");
    await page.getByRole("button", { name: /General/ }).first().click();

    await page.waitForSelector("text=Revisar precio y disponibilidad");
    const firstPriceText = await page.locator("aside").innerText();
    expect(firstPriceText.toLowerCase()).toContain("total estimado");

    // No hotel/flight sections should ever appear for a ticket-only product.
    await expect(page.getByText("¿Cuántas noches os quedáis?")).toHaveCount(0);
    await expect(page.getByText("Preferencias de vuelo")).toHaveCount(0);

    // Change the ticket category (still visible/editable — no reset needed) and confirm the price changes.
    await page.getByRole("button", { name: /Tribuna preferente/ }).click();
    await page.waitForTimeout(300);
    const secondPriceText = await page.locator("aside").innerText();
    expect(secondPriceText).not.toBe(firstPriceText);
  });
});

test.describe("A_TU_AIRE checkout — Milán (ticket + hotel)", () => {
  test("only Entrada and Entrada+Hotel are offered; invalid hotel is disabled; nights change updates price; earlier choices survive going back", async ({ page }) => {
    await page.goto("/viajes/milan-derby-della-madonnina/reservar");
    await page.waitForSelector("text=¿Qué quieres reservar?");

    const packageSection = page.locator("section", { has: page.getByText("¿Qué quieres reservar?") });
    await expect(packageSection.getByText("Entrada, alojamiento y vuelo.")).toHaveCount(0);
    await expect(packageSection.getByText("Entrada y alojamiento.")).toBeVisible();

    await page.getByRole("button", { name: "Entrada + Hotel" }).click();
    await page.waitForSelector("text=¿Cuántos viajeros sois?");
    // 3 travelers -> room mix needs one triple -> MockHotelProviderA (0 triples) becomes invalid.
    await page.getByRole("button", { name: "Más viajeros" }).click();
    await page.getByRole("button", { name: "Más viajeros" }).click();

    await page.waitForSelector("text=Elige tu entrada");
    await page.getByRole("button", { name: /Curva/ }).click();

    await page.waitForSelector("text=¿Cuántas noches os quedáis?");
    await page.getByRole("button", { name: "1 noche" }).click();

    await page.waitForSelector("text=Elige tu hotel");
    const hotelSection = page.locator("section", { has: page.getByText("Elige tu hotel") });
    const invalidHotel = hotelSection.getByRole("button", { name: /No tiene habitaciones suficientes/ });
    await expect(invalidHotel).toBeDisabled();

    const validHotelButtons = hotelSection.locator("button:not([disabled])");
    await expect(validHotelButtons).toHaveCount(1);
    await validHotelButtons.first().click();

    await page.waitForSelector("text=Revisar precio y disponibilidad");
    const oneNightPrice = await page.locator("aside").innerText();

    // Switching to 2 nights doesn't wipe the hotel choice — it stays selected and the price updates.
    await page.getByRole("button", { name: "2 noches" }).click();
    await page.waitForTimeout(400);
    const twoNightsPrice = await page.locator("aside").innerText();
    expect(twoNightsPrice).not.toBe(oneNightPrice);
    expect(twoNightsPrice).toContain("2 noches");

    // "Back" (editing an earlier, still-visible decision): change party size down to 2 — the
    // triple-room requirement disappears, so the previously-invalid hotel should now be valid.
    await page.getByRole("button", { name: "Menos viajeros" }).click();
    await page.waitForTimeout(400);
    const hotelSectionAfter = page.locator("section", { has: page.getByText("Elige tu hotel") });
    await expect(hotelSectionAfter.locator("button:not([disabled])")).toHaveCount(2);
  });
});

test.describe("A_TU_AIRE checkout — Londres (all three modalities, two Events)", () => {
  test("shows all three modalities, both matches, and blocks flights while the second match is provisional", async ({ page }) => {
    await page.goto("/viajes/londres-doble-jornada/reservar");
    await page.waitForSelector("text=¿Qué quieres reservar?");

    await expect(page.getByText("Arsenal – Tottenham").first()).toBeVisible();
    await expect(page.getByText("Chelsea – Arsenal").first()).toBeVisible();
    await expect(page.getByText("Horario provisional").first()).toBeVisible();

    const packageSection = page.locator("section", { has: page.getByText("¿Qué quieres reservar?") });
    await expect(packageSection.getByText("Solo la entrada para el partido.")).toBeVisible();
    await expect(packageSection.getByText("Entrada y alojamiento.")).toBeVisible();
    await expect(packageSection.getByText("Entrada, alojamiento y vuelo.")).toBeVisible();

    await page.getByRole("button", { name: "Entrada + Hotel + Vuelo" }).click();
    await page.waitForSelector("text=¿Cuántos viajeros sois?");
    await page.getByRole("button", { name: "Más viajeros" }).click();
    await page.waitForSelector("text=Elige tu entrada");
    await page.getByRole("button", { name: /General/ }).first().click();
    await page.waitForSelector("text=¿Cuántas noches os quedáis?");
    await page.getByRole("button", { name: "1 noche" }).click();
    await page.waitForSelector("text=Elige tu hotel");
    await page.locator("section", { has: page.getByText("Elige tu hotel") }).locator("button").first().click();

    await page.waitForSelector("text=Uno de los partidos todavía no tiene horario definitivo");
    await expect(page.getByText("Preferencias de vuelo")).toHaveCount(0);
    await expect(page.locator("aside").getByText("Pendiente de horario")).toBeVisible();
    // Not revalidatable/purchasable while blocked.
    await expect(page.getByText("Revisar precio y disponibilidad")).toHaveCount(0);
  });

  test("once both matches are confirmed: independent ida/vuelta daypart preferences, buffer-safe concrete offers, additional-match fee, and final revalidation", async ({ page }) => {
    await loginAdmin(page);
    await setLondresSecondMatchSchedule(page, "Confirmado");

    try {
      await page.goto("/viajes/londres-doble-jornada/reservar");
      await page.waitForSelector("text=¿Qué quieres reservar?");
      await expect(page.getByText("Horario provisional")).toHaveCount(0);

      await page.getByRole("button", { name: "Entrada + Hotel + Vuelo" }).click();
      await page.waitForSelector("text=¿Cuántos viajeros sois?");
      await page.getByRole("button", { name: "Más viajeros" }).click();
      await page.waitForSelector("text=Elige tu entrada");
      await page.getByRole("button", { name: /General/ }).first().click();
      await page.waitForSelector("text=¿Cuántas noches os quedáis?");
      await page.getByRole("button", { name: "2 noches" }).click();
      await page.waitForSelector("text=Elige tu hotel");
      await page.locator("section", { has: page.getByText("Elige tu hotel") }).locator("button").first().click();
      await page.waitForSelector("text=Preferencias de vuelo");

      const ida = page.locator("fieldset", { has: page.getByText("Ida", { exact: true }) });
      const vuelta = page.locator("fieldset", { has: page.getByText("Vuelta", { exact: true }) });
      await expect(ida.getByRole("button", { name: "Cualquier horario" })).toHaveAttribute("aria-pressed", "true");
      await expect(vuelta.getByRole("button", { name: "Cualquier horario" })).toHaveAttribute("aria-pressed", "true");

      const flightSection = page.locator("section", { has: page.getByText("Vuelos disponibles") });
      const anyOfferCount = await flightSection.locator("button[aria-pressed]").filter({ hasText: "MAD →" }).count();
      expect(anyOfferCount).toBeGreaterThan(1);

      // Ida = Mañana, Vuelta stays "Cualquier horario" — independent axes.
      await ida.getByRole("button", { name: "Mañana" }).click();
      await page.waitForTimeout(400);
      await expect(vuelta.getByRole("button", { name: "Cualquier horario" })).toHaveAttribute("aria-pressed", "true");
      const morningOffers = flightSection.locator("button[aria-pressed]").filter({ hasText: "MAD →" });
      const morningCount = await morningOffers.count();
      expect(morningCount).toBeGreaterThan(0);
      for (let i = 0; i < morningCount; i++) {
        await expect(morningOffers.nth(i)).toContainText("07:00");
      }

      // Vuelta = Tarde as well — further narrows independently.
      await vuelta.getByRole("button", { name: "Tarde" }).click();
      await page.waitForTimeout(400);
      await expect(ida.getByRole("button", { name: "Mañana" })).toHaveAttribute("aria-pressed", "true");

      const narrowed = flightSection.locator("button[aria-pressed]").filter({ hasText: "MAD →" });
      const narrowedCount = await narrowed.count();
      expect(narrowedCount).toBeGreaterThan(0);
      expect(narrowedCount).toBeLessThanOrEqual(morningCount);

      await narrowed.first().click();
      await page.waitForSelector("text=Revisar precio y disponibilidad");

      const summaryBeforeRevalidate = await page.locator("aside").innerText();
      expect(summaryBeforeRevalidate).toContain("partido adicional");
      expect(summaryBeforeRevalidate.toLowerCase()).toContain("total estimado");

      await page.getByRole("button", { name: "Revisar precio y disponibilidad" }).click();
      await page.waitForSelector("text=Todo listo");
      const summaryAfterRevalidate = await page.locator("aside").innerText();
      expect(summaryAfterRevalidate.toLowerCase()).toContain("total");
      expect(summaryAfterRevalidate.toLowerCase()).not.toContain("total estimado");
      await expect(page.getByRole("button", { name: "Continuar al pago" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Continuar al pago" })).toBeDisabled();
    } finally {
      await setLondresSecondMatchSchedule(page, "Provisional");
    }
  });
});
