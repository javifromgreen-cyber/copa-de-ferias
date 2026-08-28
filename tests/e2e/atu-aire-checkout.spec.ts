import { test, expect, type Page } from "@playwright/test";

/**
 * Real end-to-end coverage of the progressive A_TU_AIRE checkout against
 * the three seeded demo products (§32), including the fix-block corrections:
 * an explicit, never-inferred buyer country; a flight package that is only
 * ever offered to eligible (Spanish) buyers with a real direct route; an
 * origin-airport selector derived from the flight provider, never
 * hardcoded; and independent per-Event ticket selection. Read-mostly: only
 * the Londres flight scenarios touch Admin config, and they always revert
 * in a `finally` block, matching the established pattern in
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

async function selectCountry(page: Page, countryLabel: string) {
  await page.waitForSelector("text=¿Desde qué país reservas?");
  await page.getByLabel("País", { exact: true }).selectOption({ label: countryLabel });
}

test.describe("A_TU_AIRE checkout — Ámsterdam (ticket-only)", () => {
  test("modality -> travelers -> ticket -> summary, back-and-change updates price", async ({ page }) => {
    await page.goto("/viajes/amsterdam-de-klassieker/reservar");
    await selectCountry(page, "España");
    await page.waitForSelector("text=¿Qué quieres reservar?");

    // Only one modality is configured for this product — TICKET_ONLY.
    const packageSection = page.locator("section", { has: page.getByText("¿Qué quieres reservar?") });
    await expect(packageSection.getByText("Entrada + Hotel", { exact: true })).toHaveCount(0);
    await expect(packageSection.getByText("Solo la entrada para el partido.")).toBeVisible();

    await packageSection.locator("button").first().click();
    await page.waitForSelector("text=¿Cuántos viajeros sois?");
    await page.getByRole("button", { name: "Más viajeros" }).click();

    await page.waitForSelector("text=Tus entradas");
    await page.getByRole("button", { name: /General/ }).first().click();

    await page.waitForSelector("text=Revisar precio y disponibilidad");
    const firstPriceText = await page.locator("aside").innerText();
    expect(firstPriceText.toLowerCase()).toContain("total estimado");

    // No hotel/airport/flight sections should ever appear for a ticket-only product.
    await expect(page.getByText("¿Cuántas noches os quedáis?")).toHaveCount(0);
    await expect(page.getByText("¿Desde dónde quieres volar?")).toHaveCount(0);
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
    await selectCountry(page, "España");
    await page.waitForSelector("text=¿Qué quieres reservar?");

    const packageSection = page.locator("section", { has: page.getByText("¿Qué quieres reservar?") });
    await expect(packageSection.getByText("Entrada, alojamiento y vuelo.")).toHaveCount(0);
    await expect(packageSection.getByText("Entrada y alojamiento.")).toBeVisible();

    await page.getByRole("button", { name: "Entrada + Hotel" }).click();
    await page.waitForSelector("text=¿Cuántos viajeros sois?");
    // 3 travelers -> room mix needs one triple -> MockHotelProviderA (0 triples) becomes invalid.
    await page.getByRole("button", { name: "Más viajeros" }).click();
    await page.getByRole("button", { name: "Más viajeros" }).click();

    await page.waitForSelector("text=Tus entradas");
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

    // No flight/airport field should ever appear for a product that never enables the flight modality.
    await expect(page.getByText("¿Desde dónde quieres volar?")).toHaveCount(0);
  });
});

test.describe("A_TU_AIRE checkout — Londres (all three modalities, two Events)", () => {
  test("shows all three modalities, both matches, and blocks flights (before the airport step ever appears) while the second match is provisional", async ({ page }) => {
    await page.goto("/viajes/londres-doble-jornada/reservar");
    await selectCountry(page, "España");
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

    // Both matches now carry their own selectable TicketOffer — neither is auto-picked.
    await page.waitForSelector("text=Tus entradas");
    const ticketsSection = page.locator("section", { has: page.getByText("Tus entradas") });
    await expect(ticketsSection.getByText("Arsenal – Tottenham")).toBeVisible();
    await expect(ticketsSection.getByText("Chelsea – Arsenal")).toBeVisible();
    await ticketsSection.getByRole("button", { name: /General/ }).nth(0).click(); // Arsenal – Tottenham
    await ticketsSection.getByRole("button", { name: /General/ }).nth(1).click(); // Chelsea – Arsenal

    await page.waitForSelector("text=¿Cuántas noches os quedáis?");
    await page.getByRole("button", { name: "1 noche" }).click();
    await page.waitForSelector("text=Elige tu hotel");
    await page.locator("section", { has: page.getByText("Elige tu hotel") }).locator("button").first().click();

    await page.waitForSelector("text=Uno de los partidos todavía no tiene horario definitivo");
    // PROVISIONAL priority: the airport step and flight preferences never appear while blocked,
    // even though Spain -> London has real direct routes (§16).
    await expect(page.getByText("¿Desde dónde quieres volar?")).toHaveCount(0);
    await expect(page.getByText("Preferencias de vuelo")).toHaveCount(0);
    await expect(page.locator("aside").getByText("Pendiente de horario")).toBeVisible();
    // Not revalidatable/purchasable while blocked.
    await expect(page.getByText("Revisar precio y disponibilidad")).toHaveCount(0);
  });

  test("once both matches are confirmed: origin-gated airport selector (only direct Spanish airports), independent ida/vuelta daypart preferences, airport switching without restart, per-match ticket selection, additional-match fee, and final revalidation", async ({ page }) => {
    await loginAdmin(page);
    await setLondresSecondMatchSchedule(page, "Confirmado");

    try {
      await page.goto("/viajes/londres-doble-jornada/reservar");
      await selectCountry(page, "España");
      await page.waitForSelector("text=¿Qué quieres reservar?");
      await expect(page.getByText("Horario provisional")).toHaveCount(0);

      await page.getByRole("button", { name: "Entrada + Hotel + Vuelo" }).click();
      await page.waitForSelector("text=¿Cuántos viajeros sois?");
      await page.getByRole("button", { name: "Más viajeros" }).click();

      await page.waitForSelector("text=Tus entradas");
      const ticketsSection = page.locator("section", { has: page.getByText("Tus entradas") });
      await ticketsSection.getByRole("button", { name: /General/ }).nth(0).click();
      await ticketsSection.getByRole("button", { name: /General/ }).nth(1).click();

      await page.waitForSelector("text=¿Cuántas noches os quedáis?");
      await page.getByRole("button", { name: "2 noches" }).click();
      await page.waitForSelector("text=Elige tu hotel");
      await page.locator("section", { has: page.getByText("Elige tu hotel") }).locator("button").first().click();

      // --- Airport selector: only Spanish airports with a real direct route to London (§6/§7/§9) ---
      await page.waitForSelector("text=¿Desde dónde quieres volar?");
      const airportSection = page.locator("section", { has: page.getByText("¿Desde dónde quieres volar?") });
      await expect(airportSection.getByText("Madrid", { exact: true })).toBeVisible();
      await expect(airportSection.getByText("Barcelona", { exact: true })).toBeVisible();
      await expect(airportSection.getByText("Málaga", { exact: true })).toBeVisible();
      // Sevilla only has a connecting route to London — must never appear as an origin.
      await expect(airportSection.getByText("Sevilla", { exact: true })).toHaveCount(0);
      // Asturias has no route to London at all — must never appear.
      await expect(airportSection.getByText("Asturias", { exact: true })).toHaveCount(0);
      await expect(airportSection.locator("button")).toHaveCount(3);

      await airportSection.getByRole("button", { name: /Madrid/ }).click();
      await page.waitForSelector("text=Preferencias de vuelo");

      const ida = page.locator("fieldset", { has: page.getByText("Ida", { exact: true }) });
      const vuelta = page.locator("fieldset", { has: page.getByText("Vuelta", { exact: true }) });
      await expect(ida.getByRole("button", { name: "Cualquier horario" })).toHaveAttribute("aria-pressed", "true");
      await expect(vuelta.getByRole("button", { name: "Cualquier horario" })).toHaveAttribute("aria-pressed", "true");

      const flightSection = page.locator("section", { has: page.getByText("Vuelos disponibles") });
      const madAnyOfferCount = await flightSection.locator("button[aria-pressed]").filter({ hasText: "MAD →" }).count();
      expect(madAnyOfferCount).toBeGreaterThan(1);

      // Ida = Mañana, Vuelta stays "Cualquier horario" — independent axes.
      await ida.getByRole("button", { name: "Mañana" }).click();
      await page.waitForTimeout(400);
      await expect(vuelta.getByRole("button", { name: "Cualquier horario" })).toHaveAttribute("aria-pressed", "true");
      const madMorningOffers = flightSection.locator("button[aria-pressed]").filter({ hasText: "MAD →" });
      const madMorningCount = await madMorningOffers.count();
      expect(madMorningCount).toBeGreaterThan(0);
      for (let i = 0; i < madMorningCount; i++) {
        await expect(madMorningOffers.nth(i)).toContainText("07:00");
      }

      // Vuelta = Tarde as well — further narrows independently.
      await vuelta.getByRole("button", { name: "Tarde" }).click();
      await page.waitForTimeout(400);
      await expect(ida.getByRole("button", { name: "Mañana" })).toHaveAttribute("aria-pressed", "true");
      const madNarrowed = flightSection.locator("button[aria-pressed]").filter({ hasText: "MAD →" });
      const madNarrowedCount = await madNarrowed.count();
      expect(madNarrowedCount).toBeGreaterThan(0);
      expect(madNarrowedCount).toBeLessThanOrEqual(madMorningCount);

      await madNarrowed.first().click();
      await page.waitForSelector("text=Revisar precio y disponibilidad");
      const priceWithMad = (await page.locator("aside").innerText()).toLowerCase();
      expect(priceWithMad).toContain("madrid");

      // --- Switch airport MAD -> BCN without restarting the checkout (§15) ---
      await airportSection.getByRole("button", { name: /Barcelona/ }).click();
      await page.waitForTimeout(400);

      // Earlier decisions survive untouched.
      const summaryAfterSwitch = await page.locator("aside").innerText();
      expect(summaryAfterSwitch).toContain("2"); // party size
      expect(summaryAfterSwitch).toContain("2 noches");
      expect(summaryAfterSwitch.toLowerCase()).toContain("barcelona");

      // Preferences persist (Ida=Mañana, Vuelta=Tarde) but the concrete flight was invalidated
      // and offers now come from Barcelona instead of Madrid — never a stale MAD offer.
      await expect(ida.getByRole("button", { name: "Mañana" })).toHaveAttribute("aria-pressed", "true");
      await expect(vuelta.getByRole("button", { name: "Tarde" })).toHaveAttribute("aria-pressed", "true");
      await expect(flightSection.locator("button[aria-pressed='true']").filter({ hasText: "→" })).toHaveCount(0);
      await expect(flightSection.locator("button").filter({ hasText: "MAD →" })).toHaveCount(0);
      const bcnOffers = flightSection.locator("button").filter({ hasText: "BCN →" });
      const bcnCount = await bcnOffers.count();
      expect(bcnCount).toBeGreaterThan(0);
      for (let i = 0; i < bcnCount; i++) {
        await expect(bcnOffers.nth(i)).toContainText("07:00"); // BCN morning slot is also 07:00
      }
      await bcnOffers.first().click();
      await page.waitForTimeout(300);

      // --- Multi-match ticket selection: changing the second match's category changes the total (§17-21) ---
      const priceBeforeSecondTicketChange = await page.locator("aside").innerText();
      await ticketsSection.getByRole("button", { name: /Members/ }).nth(1).click(); // Chelsea – Arsenal -> Members
      await page.waitForTimeout(300);
      const priceAfterSecondTicketChange = await page.locator("aside").innerText();
      expect(priceAfterSecondTicketChange).not.toBe(priceBeforeSecondTicketChange);

      const summaryFinal = await page.locator("aside").innerText();
      expect(summaryFinal).toContain("partido adicional");
      expect(summaryFinal.toLowerCase()).toContain("total estimado");
      expect(summaryFinal.toLowerCase()).toContain("barcelona");

      await page.waitForSelector("text=Revisar precio y disponibilidad");
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

test.describe("A_TU_AIRE checkout — Latin American buyer (flight package must be entirely absent)", () => {
  test("only Entrada and Entrada+Hotel are offered; Entrada+Hotel+Vuelo never appears; no airport/flight field ever appears", async ({ page }) => {
    await page.goto("/viajes/londres-doble-jornada/reservar");
    await selectCountry(page, "México");
    await page.waitForSelector("text=¿Qué quieres reservar?");

    const packageSection = page.locator("section", { has: page.getByText("¿Qué quieres reservar?") });
    await expect(packageSection.getByText("Solo la entrada para el partido.")).toBeVisible();
    await expect(packageSection.getByText("Entrada y alojamiento.")).toBeVisible();
    // Not shown-then-blocked — genuinely absent.
    await expect(packageSection.getByText("Entrada, alojamiento y vuelo.")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Entrada + Hotel + Vuelo" })).toHaveCount(0);

    await page.getByRole("button", { name: "Entrada + Hotel" }).click();
    await page.waitForSelector("text=¿Cuántos viajeros sois?");
    await page.getByRole("button", { name: "Más viajeros" }).click();

    await page.waitForSelector("text=Tus entradas");
    const ticketsSection = page.locator("section", { has: page.getByText("Tus entradas") });
    await ticketsSection.getByRole("button", { name: /General/ }).nth(0).click();
    await ticketsSection.getByRole("button", { name: /General/ }).nth(1).click();

    await page.waitForSelector("text=¿Cuántas noches os quedáis?");
    await page.getByRole("button", { name: "1 noche" }).click();
    await page.waitForSelector("text=Elige tu hotel");
    await page.locator("section", { has: page.getByText("Elige tu hotel") }).locator("button").first().click();

    await page.waitForSelector("text=Revisar precio y disponibilidad");

    // Indistinguishable from a Spanish buyer who voluntarily picked Entrada+Hotel — no
    // airport selector, no daypart preference, no flight list, no "Salida" row anywhere.
    await expect(page.getByText("¿Desde dónde quieres volar?")).toHaveCount(0);
    await expect(page.getByText("Preferencias de vuelo")).toHaveCount(0);
    await expect(page.getByText("Vuelos disponibles")).toHaveCount(0);
    await expect(page.locator("aside").getByText("Salida")).toHaveCount(0);
  });
});
