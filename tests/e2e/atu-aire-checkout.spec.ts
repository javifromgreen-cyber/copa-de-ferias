import { test, expect, type Page, type Locator } from "@playwright/test";

/**
 * Real end-to-end coverage of the progressive A_TU_AIRE checkout, covering
 * both the "always three modalities" correction block AND the later
 * public/UX correction block: every A_TU_AIRE product conceptually offers
 * Entrada / Entrada+Hotel / Entrada+Hotel+Vuelo (§1-3); LATAM buyers never
 * see the flight modality on ANY product (§4/§41); hotel cards show NO
 * price at all, only descriptive info — the total lives only in the
 * summary (§5/§6); flight cards show ONLY that leg's own price, never a
 * resultant total (§9); ida and vuelta are two separate, sequential
 * selection steps with independent daypart preferences (§10/§11); an
 * origin airport requires a genuinely round-trip-direct route (§7/§8); a
 * daypart with no matching leg is disabled and marked "No disponible"
 * (§12); a confirmed day with only the kickoff hour still pending uses a
 * conservative window instead of blocking outright, while a genuinely
 * uncertain match day still blocks (§15-19 from the earlier block); the
 * traveler-data form appears correctly even with a party of one (§14);
 * full per-traveler data plus a visible room assignment are required
 * before payment (§15/§16); the ficha shows "Desde" the cheapest
 * TICKET_ONLY price and no capacity/plazas/"Viaje #" info (§1/§2/§4); and
 * "Continuar al pago" creates a real booking (§18).
 * Read-mostly: only the Admin schedule-toggle test touches Admin config,
 * and it always reverts in a `finally` block, matching the established
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

async function fillContact(page: Page, opts: { firstName: string; lastName: string; email: string; phone: string }) {
  const section = page.locator("section", { has: page.getByText("Tus datos de contacto") });
  await section.getByLabel("Nombre", { exact: true }).fill(opts.firstName);
  await section.getByLabel("Apellidos", { exact: true }).fill(opts.lastName);
  await section.getByLabel("Email", { exact: true }).fill(opts.email);
  await section.getByLabel("Teléfono", { exact: true }).fill(opts.phone);
}

function travelerFieldset(page: Page, index: number): Locator {
  return page.locator("fieldset", { has: page.getByText(`Viajero ${index}`, { exact: true }) });
}

// Fills the minimum a traveler fieldset needs given this app's default
// Trip.requiredTravelerFields ("nationality,docType,docNumber,docExpiry,docCountry") —
// every A_TU_AIRE demo trip uses that default (§15).
async function fillTraveler(page: Page, index: number, opts: { firstName: string; lastName: string; nationality: string; docNumber: string; docCountry: string }) {
  const fieldset = travelerFieldset(page, index);
  await fieldset.getByLabel("Nombre").fill(opts.firstName);
  await fieldset.getByLabel("Apellidos").fill(opts.lastName);
  await fieldset.getByLabel("Nacionalidad").fill(opts.nationality);
  await fieldset.getByLabel("Tipo de documento").selectOption({ label: "DNI" });
  await fieldset.getByLabel("Número de documento").fill(opts.docNumber);
  await fieldset.getByLabel("Caducidad del documento").fill("2031-01-01");
  await fieldset.getByLabel("País emisor del documento").fill(opts.docCountry);
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
    // airport selector, no flight step, no "Vuelo" row anywhere.
    await expect(page.getByText("¿Desde dónde quieres volar?")).toHaveCount(0);
    await expect(page.locator("section", { has: page.getByText("Vuelo de ida") })).toHaveCount(0);
    await expect(page.locator("section", { has: page.getByText("Vuelo de vuelta") })).toHaveCount(0);
    await expect(page.locator("aside").getByText("Salida")).toHaveCount(0);
  });
});

test.describe("A_TU_AIRE — traveler data at party size 1 (§14/§15)", () => {
  test("the traveler-data form renders correctly with exactly one traveler — never hidden until the count is raised", async ({ page }) => {
    await page.goto("/viajes/amsterdam-de-klassieker/reservar");
    await selectCountry(page, "España");
    await page.waitForSelector("text=¿Qué quieres reservar?");
    await page.locator("section", { has: page.getByText("¿Qué quieres reservar?") }).locator("button").filter({ hasText: "Entrada" }).filter({ hasNotText: "Hotel" }).click();

    // Never click "Más viajeros" — party size must already be committed as
    // 1 (the bug: it silently stayed null until the first click), so the
    // ticket step below must appear without any extra interaction.
    await page.waitForSelector("text=¿Cuántos viajeros sois?");
    await page.waitForSelector("text=Tus entradas");
    await page.getByRole("button", { name: /General/ }).first().click();

    await page.waitForSelector("text=Revisar precio y disponibilidad");
    await page.getByRole("button", { name: "Revisar precio y disponibilidad" }).click();
    await page.waitForSelector("text=Todo listo");

    // Exactly one traveler fieldset, not zero (the party-size-1 bug) and not two.
    await expect(page.getByText("Datos de cada viajero")).toBeVisible();
    await expect(travelerFieldset(page, 1)).toBeVisible();
    await expect(travelerFieldset(page, 2)).toHaveCount(0);
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
    await expect(page.locator("section", { has: page.getByText("Vuelo de ida") })).toHaveCount(0);

    // Change the ticket category (still visible/editable — no reset needed) and confirm the price changes.
    await page.getByRole("button", { name: /Tribuna preferente/ }).click();
    await page.waitForTimeout(300);
    const secondPriceText = await page.locator("aside").innerText();
    expect(secondPriceText).not.toBe(firstPriceText);
  });

  test("every eligible direct Spanish airport appears, not just Madrid (§7 fix)", async ({ page }) => {
    await page.goto("/viajes/amsterdam-de-klassieker/reservar");
    await selectCountry(page, "España");
    await page.waitForSelector("text=¿Qué quieres reservar?");
    await page.getByRole("button", { name: "Entrada + Hotel + Vuelo" }).click();
    await page.waitForSelector("text=¿Cuántos viajeros sois?");

    await page.waitForSelector("text=Tus entradas");
    await page.getByRole("button", { name: /General/ }).first().click();
    await page.waitForSelector("text=¿Cuántas noches os quedáis?");
    await page.getByRole("button", { name: "1 noche" }).click();
    await page.waitForSelector("text=Elige tu hotel");
    await page.locator("section", { has: page.getByText("Elige tu hotel") }).locator("button").first().click();

    await page.waitForSelector("text=¿Desde dónde quieres volar?");
    const airportSection = page.locator("section", { has: page.getByText("¿Desde dónde quieres volar?") });
    await expect(airportSection.getByText("Madrid", { exact: true })).toBeVisible();
    await expect(airportSection.getByText("Barcelona", { exact: true })).toBeVisible();
  });
});

test.describe("A_TU_AIRE checkout — hotel cards never show a price (§5/§6)", () => {
  test("Milán: invalid hotel is disabled; no card shows any price; the summary total still recalculates on selection and on nights change", async ({ page }) => {
    await page.goto("/viajes/milan-derby-della-madonnina/reservar");
    await selectCountry(page, "España");
    await page.waitForSelector("text=¿Qué quieres reservar?");

    const packageSection = page.locator("section", { has: page.getByText("¿Qué quieres reservar?") });
    await expect(packageSection.getByText("Entrada, alojamiento y vuelo.")).toBeVisible(); // always offered (§1)
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
    // No price anywhere on the card — not a resultant figure, not a bare delta (§5/§6).
    expect(validHotelText).not.toMatch(/\d+\s*€/);
    await validHotelButtons.first().click();

    await page.waitForSelector("text=Revisar precio y disponibilidad");
    const oneNightPrice = await page.locator("aside").innerText();

    // Switching to 2 nights doesn't wipe the hotel choice — it stays selected and the summary total updates.
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
  test("both matches shown, each with its own ticket selection; ida/vuelta are two sequential steps with independent daypart preferences; a time_provisional match no longer blocks flights by default", async ({ page }) => {
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

    // --- Ida step: shown first, alone — vuelta doesn't exist yet. ---
    await page.waitForSelector("text=Vuelo de ida");
    await expect(page.locator("section", { has: page.getByText("Vuelo de vuelta") })).toHaveCount(0);
    await page.waitForTimeout(300);
    const outboundSection = page.locator("section", { has: page.getByText("Vuelo de ida") });
    const firstOutboundOfferText = await outboundSection.locator("button").filter({ hasText: "→" }).first().innerText();
    // Only that leg's own price, never a "resultant" total and never a "Vuelo:" sub-line (§9).
    expect(firstOutboundOfferText.toLowerCase()).not.toContain("vuelo:");
    await outboundSection.locator("button").filter({ hasText: "→" }).first().click();

    // --- Vuelta step: only appears once ida is picked (§10). ---
    await page.waitForSelector("text=Vuelo de vuelta");
    const returnSection = page.locator("section", { has: page.getByText("Vuelo de vuelta") });
    await page.waitForTimeout(300);
    await expect(returnSection.locator("button").filter({ hasText: "→" }).first()).toBeVisible();
    await returnSection.locator("button").filter({ hasText: "→" }).first().click();

    // --- Multi-match ticket selection: changing the second match's category changes the total (§17-21) ---
    const priceBefore = await page.locator("aside").innerText();
    await ticketsSection.getByRole("button", { name: /Members/ }).nth(1).click(); // Chelsea – Arsenal -> Members
    await page.waitForTimeout(300);
    const priceAfter = await page.locator("aside").innerText();
    expect(priceAfter).not.toBe(priceBefore);
    expect(priceAfter).toContain("partido adicional");
  });

  test("changing the ida daypart preference never breaks or empties the already-picked vuelta (§11)", async ({ page }) => {
    await page.goto("/viajes/londres-doble-jornada/reservar");
    await selectCountry(page, "España");
    await page.waitForSelector("text=¿Qué quieres reservar?");
    await page.getByRole("button", { name: "Entrada + Hotel + Vuelo" }).click();
    await page.waitForSelector("text=¿Cuántos viajeros sois?");
    await page.waitForSelector("text=Tus entradas");
    const ticketsSection = page.locator("section", { has: page.getByText("Tus entradas") });
    await ticketsSection.getByRole("button", { name: /General/ }).nth(0).click();
    await ticketsSection.getByRole("button", { name: /General/ }).nth(1).click();
    await page.waitForSelector("text=¿Cuántas noches os quedáis?");
    await page.getByRole("button", { name: "1 noche" }).click();
    await page.waitForSelector("text=Elige tu hotel");
    await page.locator("section", { has: page.getByText("Elige tu hotel") }).locator("button").first().click();
    await page.waitForSelector("text=¿Desde dónde quieres volar?");
    await page.locator("section", { has: page.getByText("¿Desde dónde quieres volar?") }).getByRole("button", { name: /Madrid/ }).click();

    await page.waitForSelector("text=Vuelo de ida");
    await page.waitForTimeout(300);
    const outboundSection = page.locator("section", { has: page.getByText("Vuelo de ida") });
    await outboundSection.locator("button").filter({ hasText: "→" }).first().click();

    await page.waitForSelector("text=Vuelo de vuelta");
    await page.waitForTimeout(300);
    const returnSection = page.locator("section", { has: page.getByText("Vuelo de vuelta") });
    await returnSection.locator("button").filter({ hasText: "→" }).first().click();
    await page.waitForTimeout(300);
    const summaryBefore = await page.locator("aside").innerText();
    expect(summaryBefore.toLowerCase()).toContain("vuelo de vuelta");

    // Now change only the ida daypart preference — vuelta's own selection/options must survive untouched.
    await outboundSection.getByRole("button", { name: "Mañana" }).click();
    await page.waitForTimeout(300);
    await expect(returnSection).toBeVisible();
    await expect(returnSection.locator("button").filter({ hasText: "→" })).not.toHaveCount(0);
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

      // Blocked with a fecha-specific reason — the airport step never appears,
      // and the "Vuelo de ida" section that does render shows only the
      // blocked message, never a leg-picking UI.
      await page.waitForSelector("text=fecha");
      await expect(page.getByText("¿Desde dónde quieres volar?")).toHaveCount(0);
      await expect(page.getByText("Vuelos de ida disponibles")).toHaveCount(0);
      await expect(page.getByText("Revisar precio y disponibilidad")).toHaveCount(0);
    } finally {
      await setChelseaArsenalSchedule(page, "Fecha confirmada, hora provisional");
    }
  });
});

test.describe("A_TU_AIRE checkout — Manchester (QA demo product, confirmed schedule, full flow)", () => {
  test("ficha shows Desde price and no plazas/Viaje# info; full flow works ficha -> pago, including traveler data + rooming (§7/§8/§9-12/§14-18)", async ({ page }) => {
    await page.goto("/viajes/manchester-a-tu-aire");
    await page.waitForSelector("text=Manchester");
    await expect(page.getByText(/plaza.*disponible/i)).toHaveCount(0);
    await expect(page.getByText(/^Viaje #/)).toHaveCount(0);
    await expect(page.getByText(/^Desde/).first()).toBeVisible();

    await page.goto("/viajes/manchester-a-tu-aire/reservar");
    await selectCountry(page, "España");
    await page.waitForSelector("text=¿Qué quieres reservar?");
    await expect(page.getByText(/^Viaje #/)).toHaveCount(0);
    const packageSection = page.locator("section", { has: page.getByText("¿Qué quieres reservar?") });
    await expect(packageSection.getByText("Solo la entrada para el partido.")).toBeVisible();
    await expect(packageSection.getByText("Entrada y alojamiento.")).toBeVisible();
    await expect(packageSection.getByText("Entrada, alojamiento y vuelo.")).toBeVisible();

    await page.getByRole("button", { name: "Entrada + Hotel + Vuelo" }).click();
    await page.waitForSelector("text=¿Cuántos viajeros sois?");
    await page.getByRole("button", { name: "Más viajeros" }).click(); // party of 2

    await page.waitForSelector("text=Tus entradas");
    await page.getByRole("button", { name: /General/ }).first().click();

    await page.waitForSelector("text=¿Cuántas noches os quedáis?");
    await page.getByRole("button", { name: "2 noches" }).click();

    await page.waitForSelector("text=Elige tu hotel");
    const hotelSection = page.locator("section", { has: page.getByText("Elige tu hotel") });
    const hotelText = await hotelSection.locator("button:not([disabled])").first().innerText();
    expect(hotelText).not.toMatch(/\d+\s*€/); // no price on the hotel card at all (§5/§6)
    await hotelSection.locator("button:not([disabled])").first().click();

    // Only round-trip-direct Spanish airports appear (§7/§8).
    await page.waitForSelector("text=¿Desde dónde quieres volar?");
    const airportSection = page.locator("section", { has: page.getByText("¿Desde dónde quieres volar?") });
    await expect(airportSection.getByText("Madrid", { exact: true })).toBeVisible();
    await expect(airportSection.getByText("Barcelona", { exact: true })).toBeVisible();
    await expect(airportSection.getByText("Málaga", { exact: true })).toBeVisible();
    await expect(airportSection.getByText("Sevilla", { exact: true })).toHaveCount(0); // outbound-only, excluded
    await expect(airportSection.getByText("Asturias", { exact: true })).toHaveCount(0); // no route at all
    await expect(airportSection.locator("button")).toHaveCount(3);

    await airportSection.getByRole("button", { name: /Madrid/ }).click();

    // Vuelo de ida — MAD -> MAN has an afternoon outbound slot.
    await page.waitForSelector("text=Vuelo de ida");
    await page.waitForTimeout(300);
    const outboundSection = page.locator("section", { has: page.getByText("Vuelo de ida") });
    await expect(outboundSection.getByRole("button", { name: "Tarde" })).toBeEnabled();
    const firstOutboundText = await outboundSection.locator("button").filter({ hasText: "→" }).first().innerText();
    expect(firstOutboundText).toMatch(/\d+\s*€\s*\/\s*persona/); // the leg's own price is shown
    const priceBeforeOutbound = await page.locator("aside").innerText();
    await outboundSection.locator("button").filter({ hasText: "→" }).first().click();
    await page.waitForTimeout(300);
    const priceAfterOutbound = await page.locator("aside").innerText();
    expect(priceAfterOutbound).not.toBe(priceBeforeOutbound); // summary recalculates on this one selection

    // Vuelo de vuelta — MAD -> MAN has NO afternoon return slot at all, a real "No disponible" case (§12).
    await page.waitForSelector("text=Vuelo de vuelta");
    await page.waitForTimeout(300);
    const returnSection = page.locator("section", { has: page.getByText("Vuelo de vuelta") });
    const tardeVuelta = returnSection.getByRole("button", { name: "Tarde" });
    await expect(tardeVuelta).toBeDisabled();
    await expect(tardeVuelta).toContainText("No disponible");
    await returnSection.locator("button").filter({ hasText: "→" }).first().click();

    // --- Revalidation ---
    await page.waitForSelector("text=Revisar precio y disponibilidad");
    await page.getByRole("button", { name: "Revisar precio y disponibilidad" }).click();
    await page.waitForSelector("text=Todo listo");

    // --- Buyer contact data ---
    await fillContact(page, { firstName: "QA", lastName: "Manchester", email: `qa-manchester-${Date.now()}@example.com`, phone: "600111222" });

    // --- Full per-traveler data: exactly 2 fieldsets for a party of 2 (§15) ---
    await expect(page.getByText("Datos de cada viajero")).toBeVisible();
    await expect(travelerFieldset(page, 1)).toBeVisible();
    await expect(travelerFieldset(page, 2)).toBeVisible();
    await expect(travelerFieldset(page, 3)).toHaveCount(0);

    const payButton = page.getByRole("button", { name: "Continuar al pago" });
    // Contact-only is never enough (§15) — payment stays disabled until traveler data exists too.
    await expect(payButton).toBeDisabled();

    await fillTraveler(page, 1, { firstName: "QA", lastName: "Manchester", nationality: "Española", docNumber: "12345678A", docCountry: "España" });
    await fillTraveler(page, 2, { firstName: "Compi", lastName: "DeViaje", nationality: "Española", docNumber: "87654321B", docCountry: "España" });

    // --- Rooming: visible, based on the real room mix for 2 travelers (a double, both named) (§16) ---
    await expect(page.getByText("Habitaciones", { exact: true })).toBeVisible();
    const roomingSection = page.locator("section", { has: page.getByText("Habitaciones", { exact: true }) });
    await expect(roomingSection.getByText("Doble")).toBeVisible();
    await expect(roomingSection.getByText(/QA Manchester/)).toBeVisible();
    await expect(roomingSection.getByText(/Compi DeViaje/)).toBeVisible();

    await expect(payButton).toBeEnabled();
    await payButton.click();
    await page.waitForURL(/\/confirmacion\//, { timeout: 15000 });
    await expect(page.getByRole("heading", { name: "Ya estás dentro" })).toBeVisible();
    await expect(page.getByText("Total pagado")).toBeVisible();

    // Mi Viaje must render without crashing for an A_TU_AIRE booking, and must show both real traveler names, not "Acompañante N".
    await page.getByRole("link", { name: "Ir a Mi Viaje" }).click();
    await page.waitForURL(/\/mi-viaje\//, { timeout: 15000 });
    await expect(page.locator("body")).not.toContainText("Application error");
    await expect(page.getByText("Compi DeViaje").first()).toBeVisible();
    await expect(page.getByText(/Acompañante/)).toHaveCount(0);
  });
});
