import { test, expect, type Page } from "@playwright/test";

/**
 * Real end-to-end coverage of the progressive A_TU_AIRE checkout, covering
 * the "always three modalities" correction block: every A_TU_AIRE product
 * conceptually offers Entrada / Entrada+Hotel / Entrada+Hotel+Vuelo (§1-3);
 * LATAM buyers never see the flight modality on ANY product (§4/§41);
 * hotel/flight cards show a resultant per-person price, never a bare "+X"
 * delta (§11-14); an origin airport requires a genuinely round-trip-direct
 * route (§21-23); a daypart with no matching offer is disabled and marked
 * "No disponible" (§25/§26); a confirmed day with only the kickoff hour
 * still pending uses a conservative window instead of blocking outright,
 * while a genuinely uncertain match day still blocks (§15-19); the ficha
 * shows "Desde" the cheapest TICKET_ONLY price and no capacity/plazas
 * info (§7/§8); and "Continuar al pago" creates a real booking (§6).
 * Read-mostly: only the Admin schedule-toggle tests touch Admin config,
 * and they always revert in a `finally` block, matching the established
 * pattern in required-fields-admin.spec.ts.
 */

const ATU_AIRE_SLUGS = ["amsterdam-de-klassieker", "milan-derby-della-madonnina", "londres-doble-jornada", "manchester-a-tu-aire"];

async function loginAdmin(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Contraseña").fill("cambia-esta-clave");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/admin$/);
}

async function setChelseaArsenalSchedule(page: Page, label: "Confirmado" | "Fecha confirmada, hora provisional" | "Fecha provisional") {
  await page.goto("/admin/eventos");
  await page.getByRole("link", { name: /Chelsea vs Arsenal/ }).click();
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Horario").selectOption({ label });
  await page.getByRole("button", { name: "Guardar evento" }).click();
  await page.waitForURL(/\/admin\/eventos\/[a-z0-9]+$/);
}

async function selectCountry(page: Page, countryLabel: string) {
  await page.waitForSelector("text=¿Desde qué país reservas?");
  await page.getByLabel("País", { exact: true }).selectOption({ label: countryLabel });
}

test.describe("A_TU_AIRE — every product always offers the three modalities to an eligible (Spain) buyer (§1-3/§40)", () => {
  for (const slug of ATU_AIRE_SLUGS) {
    test(`${slug}: Entrada / Entrada+Hotel / Entrada+Hotel+Vuelo all appear before anything else is configured`, async ({ page }) => {
      await page.goto(`/viajes/${slug}/reservar`);
      await selectCountry(page, "España");
      await page.waitForSelector("text=¿Qué quieres reservar?");
      const packageSection = page.locator("section", { has: page.getByText("¿Qué quieres reservar?") });
      await expect(packageSection.getByText("Solo la entrada para el partido.")).toBeVisible();
      await expect(packageSection.getByText("Entrada y alojamiento.")).toBeVisible();
      await expect(packageSection.getByText("Entrada, alojamiento y vuelo.")).toBeVisible();
      // No hotel/flight/traveler decision has been made yet — the three
      // cards appear purely from country + product, never gated on those.
      await expect(page.getByText("¿Cuántos viajeros sois?")).toHaveCount(0);
    });
  }
});

test.describe("A_TU_AIRE — a LATAM buyer never sees the flight modality, on any product (§4/§41)", () => {
  for (const slug of ATU_AIRE_SLUGS) {
    test(`${slug}: only Entrada / Entrada+Hotel appear for México — not shown-then-blocked, genuinely absent`, async ({ page }) => {
      await page.goto(`/viajes/${slug}/reservar`);
      await selectCountry(page, "México");
      await page.waitForSelector("text=¿Qué quieres reservar?");
      const packageSection = page.locator("section", { has: page.getByText("¿Qué quieres reservar?") });
      await expect(packageSection.getByText("Solo la entrada para el partido.")).toBeVisible();
      await expect(packageSection.getByText("Entrada y alojamiento.")).toBeVisible();
      await expect(packageSection.getByText("Entrada, alojamiento y vuelo.")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Entrada + Hotel + Vuelo" })).toHaveCount(0);
    });
  }

  test("full LATAM flow: completes Entrada+Hotel with no airport/flight field ever appearing", async ({ page }) => {
    await page.goto("/viajes/londres-doble-jornada/reservar");
    await selectCountry(page, "México");
    await page.waitForSelector("text=¿Qué quieres reservar?");

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

test.describe("A_TU_AIRE checkout — Ámsterdam", () => {
  test("ticket flow works and the price updates on change; now also offers Entrada+Hotel and Entrada+Hotel+Vuelo (§1)", async ({ page }) => {
    await page.goto("/viajes/amsterdam-de-klassieker/reservar");
    await selectCountry(page, "España");
    await page.waitForSelector("text=¿Qué quieres reservar?");

    const packageSection = page.locator("section", { has: page.getByText("¿Qué quieres reservar?") });
    await expect(packageSection.getByText("Entrada + Hotel", { exact: true })).toBeVisible();
    await expect(packageSection.getByText("Entrada + Hotel + Vuelo", { exact: true })).toBeVisible();
    await expect(packageSection.getByText("Solo la entrada para el partido.")).toBeVisible();

    await packageSection.locator("button").filter({ hasText: "Entrada" }).filter({ hasNotText: "Hotel" }).click();
    await page.waitForSelector("text=¿Cuántos viajeros sois?");
    await page.getByRole("button", { name: "Más viajeros" }).click();

    await page.waitForSelector("text=Tus entradas");
    await page.getByRole("button", { name: /General/ }).first().click();

    await page.waitForSelector("text=Revisar precio y disponibilidad");
    const firstPriceText = await page.locator("aside").innerText();
    expect(firstPriceText.toLowerCase()).toContain("total estimado");

    // Choosing TICKET_ONLY never pulls in hotel/flight sections.
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

test.describe("A_TU_AIRE checkout — Milán", () => {
  test("invalid hotel is disabled; hotel cards show a resultant price, never a bare '+X'; nights change updates price; earlier choices survive going back", async ({ page }) => {
    await page.goto("/viajes/milan-derby-della-madonnina/reservar");
    await selectCountry(page, "España");
    await page.waitForSelector("text=¿Qué quieres reservar?");

    const packageSection = page.locator("section", { has: page.getByText("¿Qué quieres reservar?") });
    await expect(packageSection.getByText("Entrada, alojamiento y vuelo.")).toBeVisible(); // now always offered (§1)
    await expect(packageSection.getByText("Entrada y alojamiento.")).toBeVisible();

    await page.locator("button").filter({ hasText: "Entrada + Hotel" }).filter({ hasNotText: "Vuelo" }).click();
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
    const validHotelText = await validHotelButtons.first().innerText();
    // Resultant whole-trip price per person, never an ambiguous "+X" delta (§11).
    expect(validHotelText).toMatch(/\d+\s*€\s*\/\s*persona/);
    expect(validHotelText).not.toMatch(/\+\s*\d/);
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

test.describe("A_TU_AIRE checkout — Londres (two Events, mixed confirmed/time_provisional schedule)", () => {
  test("both matches shown, each with its own ticket selection; a time_provisional match no longer blocks flights by default (§15/§16)", async ({ page }) => {
    await page.goto("/viajes/londres-doble-jornada/reservar");
    await selectCountry(page, "España");
    await page.waitForSelector("text=¿Qué quieres reservar?");

    await expect(page.getByText("Arsenal – Tottenham").first()).toBeVisible();
    await expect(page.getByText("Chelsea – Arsenal").first()).toBeVisible();
    await expect(page.getByText("Horario provisional").first()).toBeVisible();

    await page.getByRole("button", { name: "Entrada + Hotel + Vuelo" }).click();
    await page.waitForSelector("text=¿Cuántos viajeros sois?");
    await page.getByRole("button", { name: "Más viajeros" }).click();

    // Both matches carry their own selectable TicketOffer — neither is auto-picked.
    await page.waitForSelector("text=Tus entradas");
    const ticketsSection = page.locator("section", { has: page.getByText("Tus entradas") });
    await expect(ticketsSection.getByText("Arsenal – Tottenham")).toBeVisible();
    await expect(ticketsSection.getByText("Chelsea – Arsenal")).toBeVisible();
    await ticketsSection.getByRole("button", { name: /General/ }).nth(0).click();
    await ticketsSection.getByRole("button", { name: /General/ }).nth(1).click();

    await page.waitForSelector("text=¿Cuántas noches os quedáis?");
    await page.getByRole("button", { name: "1 noche" }).click();
    await page.waitForSelector("text=Elige tu hotel");
    await page.locator("section", { has: page.getByText("Elige tu hotel") }).locator("button").first().click();

    // Chelsea-Arsenal is only time_provisional (day known, kickoff pending) — this must
    // NOT block: the airport selector appears normally, using a conservative window.
    await page.waitForSelector("text=¿Desde dónde quieres volar?");
    await expect(page.getByText("Uno de los partidos todavía no tiene horario definitivo")).toHaveCount(0);
    const airportSection = page.locator("section", { has: page.getByText("¿Desde dónde quieres volar?") });
    await expect(airportSection.getByText("Madrid", { exact: true })).toBeVisible();
    await expect(airportSection.getByText("Barcelona", { exact: true })).toBeVisible();
    await expect(airportSection.getByText("Málaga", { exact: true })).toBeVisible();
    await expect(airportSection.getByText("Sevilla", { exact: true })).toHaveCount(0);
    await expect(airportSection.getByText("Asturias", { exact: true })).toHaveCount(0);

    await airportSection.getByRole("button", { name: /Madrid/ }).click();
    await page.waitForSelector("text=Preferencias de vuelo");
    await page.waitForTimeout(300);
    const flightSection = page.locator("section", { has: page.getByText("Vuelos disponibles") });
    await expect(flightSection.locator("button").filter({ hasText: "→" }).first()).toBeVisible();

    // --- Multi-match ticket selection: changing the second match's category changes the total (§17-21) ---
    const priceBefore = await page.locator("aside").innerText();
    await ticketsSection.getByRole("button", { name: /Members/ }).nth(1).click(); // Chelsea – Arsenal -> Members
    await page.waitForTimeout(300);
    const priceAfter = await page.locator("aside").innerText();
    expect(priceAfter).not.toBe(priceBefore);
    expect(priceAfter).toContain("partido adicional");
  });

  test("a genuinely uncertain match DATE (date_provisional) still blocks flight selection, even with real direct routes available (§16/§19)", async ({ page }) => {
    await loginAdmin(page);
    await setChelseaArsenalSchedule(page, "Fecha provisional");

    try {
      await page.goto("/viajes/londres-doble-jornada/reservar");
      await selectCountry(page, "España");
      await page.waitForSelector("text=¿Qué quieres reservar?");

      await page.getByRole("button", { name: "Entrada + Hotel + Vuelo" }).click();
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

      // Blocked with a fecha-specific reason — the airport step never appears.
      await page.waitForSelector("text=fecha");
      await expect(page.getByText("¿Desde dónde quieres volar?")).toHaveCount(0);
      await expect(page.getByText("Preferencias de vuelo")).toHaveCount(0);
      await expect(page.getByText("Revisar precio y disponibilidad")).toHaveCount(0);
    } finally {
      await setChelseaArsenalSchedule(page, "Fecha confirmada, hora provisional");
    }
  });
});

test.describe("A_TU_AIRE checkout — Manchester (QA demo product, confirmed schedule, full flow)", () => {
  test("ficha shows Desde price and no plazas info; full flow works ficha -> pago (§7/§8/§21-26/§27-33/§38)", async ({ page }) => {
    await page.goto("/viajes/manchester-a-tu-aire");
    await page.waitForSelector("text=Manchester");
    await expect(page.getByText(/plaza.*disponible/i)).toHaveCount(0);
    await expect(page.getByText(/^Desde/).first()).toBeVisible();

    await page.goto("/viajes/manchester-a-tu-aire/reservar");
    await selectCountry(page, "España");
    await page.waitForSelector("text=¿Qué quieres reservar?");
    const packageSection = page.locator("section", { has: page.getByText("¿Qué quieres reservar?") });
    await expect(packageSection.getByText("Solo la entrada para el partido.")).toBeVisible();
    await expect(packageSection.getByText("Entrada y alojamiento.")).toBeVisible();
    await expect(packageSection.getByText("Entrada, alojamiento y vuelo.")).toBeVisible();

    await page.getByRole("button", { name: "Entrada + Hotel + Vuelo" }).click();
    await page.waitForSelector("text=¿Cuántos viajeros sois?");
    await page.getByRole("button", { name: "Más viajeros" }).click();

    await page.waitForSelector("text=Tus entradas");
    await page.getByRole("button", { name: /General/ }).first().click();

    await page.waitForSelector("text=¿Cuántas noches os quedáis?");
    await page.getByRole("button", { name: "2 noches" }).click();

    await page.waitForSelector("text=Elige tu hotel");
    const hotelSection = page.locator("section", { has: page.getByText("Elige tu hotel") });
    const hotelText = await hotelSection.locator("button:not([disabled])").first().innerText();
    expect(hotelText).toMatch(/\d+\s*€\s*\/\s*persona/);
    expect(hotelText).not.toMatch(/\+\s*\d/); // resultant price, never a "+X" delta (§11)
    await hotelSection.locator("button:not([disabled])").first().click();

    // Only round-trip-direct Spanish airports appear (§21-23).
    await page.waitForSelector("text=¿Desde dónde quieres volar?");
    const airportSection = page.locator("section", { has: page.getByText("¿Desde dónde quieres volar?") });
    await expect(airportSection.getByText("Madrid", { exact: true })).toBeVisible();
    await expect(airportSection.getByText("Barcelona", { exact: true })).toBeVisible();
    await expect(airportSection.getByText("Málaga", { exact: true })).toBeVisible();
    await expect(airportSection.getByText("Sevilla", { exact: true })).toHaveCount(0); // outbound-only, excluded (§22)
    await expect(airportSection.getByText("Asturias", { exact: true })).toHaveCount(0); // no route at all (§29)
    await expect(airportSection.locator("button")).toHaveCount(3);

    await airportSection.getByRole("button", { name: /Madrid/ }).click();
    await page.waitForSelector("text=Preferencias de vuelo");
    await page.waitForTimeout(300);

    // MAD -> MAN has no afternoon return slot at all — a real "No disponible" case (§25/§26).
    const vuelta = page.locator("fieldset", { has: page.getByText("Vuelta", { exact: true }) });
    const tardeVuelta = vuelta.getByRole("button", { name: "Tarde" });
    await expect(tardeVuelta).toBeDisabled();
    await expect(tardeVuelta).toContainText("No disponible");
    const ida = page.locator("fieldset", { has: page.getByText("Ida", { exact: true }) });
    await expect(ida.getByRole("button", { name: "Tarde" })).toBeEnabled(); // ida does have an afternoon slot

    // Flight offers show a resultant price plus the flight's own component, never an
    // ambiguous bare figure (§14).
    const flightSection = page.locator("section", { has: page.getByText("Vuelos disponibles") });
    const firstOfferText = await flightSection.locator("button").filter({ hasText: "→" }).first().innerText();
    expect(firstOfferText.toLowerCase()).toContain("vuelo:");

    const priceWithMad = await page.locator("aside").innerText();
    await flightSection.locator("button").filter({ hasText: "→" }).first().click();
    await page.waitForTimeout(300);

    // Switch airport without restarting — travelers/tickets/hotel/nights survive (§15).
    await airportSection.getByRole("button", { name: /Barcelona/ }).click();
    await page.waitForTimeout(400);
    const summaryAfterSwitch = await page.locator("aside").innerText();
    expect(summaryAfterSwitch).toContain("2 noches");
    expect(summaryAfterSwitch.toLowerCase()).toContain("barcelona");
    expect(summaryAfterSwitch).not.toBe(priceWithMad);

    await page.waitForTimeout(300);
    await flightSection.locator("button").filter({ hasText: "→" }).first().click();
    await page.waitForTimeout(300);

    // --- Revalidation + real payment (§6/§35/§36) ---
    await page.waitForSelector("text=Revisar precio y disponibilidad");
    await page.getByRole("button", { name: "Revisar precio y disponibilidad" }).click();
    await page.waitForSelector("text=Todo listo");

    await page.getByLabel("Nombre", { exact: true }).fill("QA");
    await page.getByLabel("Apellidos", { exact: true }).fill("Manchester");
    await page.getByLabel("Email", { exact: true }).fill(`qa-manchester-${Date.now()}@example.com`);
    await page.getByLabel("Teléfono", { exact: true }).fill("600111222");

    const payButton = page.getByRole("button", { name: "Continuar al pago" });
    await expect(payButton).toBeEnabled();
    await payButton.click();
    await page.waitForURL(/\/confirmacion\//, { timeout: 15000 });
    await expect(page.getByRole("heading", { name: "Ya estás dentro" })).toBeVisible();
    await expect(page.getByText("Total pagado")).toBeVisible();

    // Mi Viaje must render without crashing for an A_TU_AIRE booking.
    await page.getByRole("link", { name: "Ir a Mi Viaje" }).click();
    await page.waitForURL(/\/mi-viaje\//, { timeout: 15000 });
    await expect(page.locator("body")).not.toContainText("Application error");
  });
});
