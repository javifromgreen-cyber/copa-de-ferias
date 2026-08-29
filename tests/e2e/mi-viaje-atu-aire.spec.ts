import { test, expect, type Page } from "@playwright/test";

const DEMO_TOKEN = "demo-manchester-atu-aire";
const DEMO_REFERENCE = "CDF-DEMOMAN1";

test.describe("Mi Viaje — A_TU_AIRE full reserva (demo seed, §37/§40/§48/§50)", () => {
  test("shows every section: cabecera, entradas, viajeros, hotel, habitaciones, vuelos, documentación, actualizaciones, pago", async ({ page }) => {
    await page.goto(`/mi-viaje/${DEMO_TOKEN}`);

    await expect(page.getByText(`Reserva ${DEMO_REFERENCE}`)).toBeVisible();
    await expect(page.getByText("Confirmada", { exact: true })).toBeVisible();
    await expect(page.getByText("Entrada + Hotel + Vuelo")).toBeVisible();

    const tickets = page.locator("#entradas");
    await expect(tickets).toContainText("Manchester City");
    await expect(tickets).toContainText("General");
    await expect(tickets).toContainText("2 entradas");

    const travelers = page.locator("#viajeros");
    await expect(travelers).toContainText("Demo Viajero Mi Viaje");
    await expect(travelers).toContainText("Demo Acompañante Mi Viaje");
    await expect(travelers).toContainText("****");
    await expect(travelers).not.toContainText("12345678A"); // full doc number never shown

    const hotel = page.locator("#hotel");
    await expect(hotel).toContainText("Hotel Central Manchester");
    await expect(hotel).toContainText("2 noches");
    await expect(hotel).toContainText("Doble");
    await expect(hotel).toContainText("Demo Viajero Mi Viaje, Demo Acompañante Mi Viaje");

    const flights = page.locator("#vuelos");
    await expect(flights).toContainText("Ida");
    await expect(flights).toContainText("Vuelta");
    await expect(flights).toContainText("MAD");
    await expect(flights).toContainText("MAN");

    const docs = page.locator("#documentacion");
    await expect(docs).toContainText("Entrada");
    await expect(docs).toContainText("Bono de hotel");
    await expect(docs).toContainText("Documentación de vuelo");

    const updates = page.locator("#actualizaciones");
    await expect(updates).toContainText("Tu hotel está confirmado");
    await expect(updates).not.toContainText("No hay novedades");

    const payment = page.locator("#pago");
    await expect(payment).toContainText("830");
    await expect(payment).toContainText("Pagado");
    await expect(payment).not.toContainText("Gastos de gestión");
    await expect(payment).not.toContainText("margen");

    await expect(page.locator("#ayuda")).toContainText("CONTACTAR", { ignoreCase: true });
  });

  test("never shows a raw internal database id anywhere on the page", async ({ page }) => {
    await page.goto(`/mi-viaje/${DEMO_TOKEN}`);
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/\bcm[a-z0-9]{20,}\b/);
  });
});

test.describe("Mi Viaje — mobile viewport (§46)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("demo reserva sections are reachable as collapsible blocks without horizontal overflow", async ({ page }) => {
    await page.goto(`/mi-viaje/${DEMO_TOKEN}`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await expect(page.locator("#entradas")).toBeVisible();
    await expect(page.locator("#pago")).toBeVisible();
  });
});

async function purchaseTicketOnly(page: Page, buyerEmail: string) {
  await page.goto("/viajes/manchester-a-tu-aire/reservar");
  await page.getByRole("button", { name: "Aceptar" }).click().catch(() => {});
  await page.getByLabel("País", { exact: true }).selectOption({ label: "España" });
  await page.waitForSelector("text=¿Qué quieres reservar?");
  await page.getByRole("button", { name: "Solo la entrada para el partido." }).click();
  await page.waitForSelector("text=Tus entradas");
  await page.getByRole("button", { name: /General/ }).first().click();
  await page.getByRole("button", { name: "Revisar precio y disponibilidad" }).click();
  await page.waitForSelector("text=Nacionalidad", { timeout: 15000 });

  await page.getByLabel("Nombre", { exact: true }).fill("QA");
  await page.getByLabel("Apellidos", { exact: true }).fill("TicketOnly");
  await page.getByLabel("Email", { exact: true }).fill(buyerEmail);
  await page.getByLabel("Teléfono", { exact: true }).fill("600111222");

  const fieldset = page.locator("fieldset", { has: page.getByText("Viajero 1", { exact: true }) });
  await fieldset.getByLabel("Nombre").fill("QA");
  await fieldset.getByLabel("Apellidos").fill("Solo");
  await fieldset.getByLabel("Nacionalidad").selectOption("España");
  await fieldset.getByLabel("Tipo de documento").selectOption({ label: "DNI" });
  await fieldset.getByLabel("Número de documento").fill("11112222X");
  await fieldset.getByLabel("Caducidad del documento").fill("2031-01-01");
  await fieldset.getByLabel("País emisor del documento").fill("España");

  const payButton = page.getByRole("button", { name: "Continuar al pago" });
  await expect(payButton).toBeEnabled();
  await payButton.click();
  await page.waitForURL(/\/confirmacion\//, { timeout: 15000 });
}

test.describe("Mi Viaje — Entrada sola nunca muestra hotel/habitaciones/vuelos vacíos (§38)", () => {
  test("a fresh TICKET_ONLY purchase's Mi Viaje has no hotel/rooming/flight blocks", async ({ page }) => {
    await purchaseTicketOnly(page, `qa-ticket-only-${Date.now()}@example.com`);
    await page.getByRole("link", { name: "Ir a Mi Viaje" }).click();
    await page.waitForURL(/\/mi-viaje\//, { timeout: 15000 });

    await expect(page.locator("#entradas")).toBeVisible();
    await expect(page.locator("#viajeros")).toBeVisible();
    await expect(page.locator("#pago")).toBeVisible();
    await expect(page.locator("#hotel")).toHaveCount(0);
    await expect(page.locator("#vuelos")).toHaveCount(0);
    await expect(page.getByText("Habitaciones", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Entrada", { exact: true }).first()).toBeVisible();
  });
});

test.describe("Mi Viaje — Entrada + Hotel nunca muestra vuelos (§39)", () => {
  test("a fresh TICKET_HOTEL purchase's Mi Viaje shows hotel/habitaciones but no vuelos block", async ({ page }) => {
    await page.goto("/viajes/manchester-a-tu-aire/reservar");
    await page.getByRole("button", { name: "Aceptar" }).click().catch(() => {});
    await page.getByLabel("País", { exact: true }).selectOption({ label: "España" });
    await page.waitForSelector("text=¿Qué quieres reservar?");
    await page.getByRole("button", { name: "Entrada y alojamiento." }).click();
    await page.waitForSelector("text=Tus entradas");
    await page.getByRole("button", { name: /General/ }).first().click();
    await page.waitForSelector("text=¿Cuántas noches os quedáis?");
    await page.getByRole("button", { name: "1 noche" }).click();
    await page.waitForSelector("text=Elige tu hotel");
    const hotelSection = page.locator("section", { has: page.getByText("Elige tu hotel") });
    await hotelSection.locator("button:not([disabled])").first().click();
    await page.getByRole("button", { name: "Revisar precio y disponibilidad" }).click();
    await page.waitForSelector("text=Nacionalidad", { timeout: 15000 });

    await page.getByLabel("Nombre", { exact: true }).fill("QA");
    await page.getByLabel("Apellidos", { exact: true }).fill("TicketHotel");
    await page.getByLabel("Email", { exact: true }).fill(`qa-ticket-hotel-${Date.now()}@example.com`);
    await page.getByLabel("Teléfono", { exact: true }).fill("600111222");

    const fieldset = page.locator("fieldset", { has: page.getByText("Viajero 1", { exact: true }) });
    await fieldset.getByLabel("Nombre").fill("QA");
    await fieldset.getByLabel("Apellidos").fill("Hotel");
    await fieldset.getByLabel("Nacionalidad").selectOption("España");
    await fieldset.getByLabel("Tipo de documento").selectOption({ label: "DNI" });
    await fieldset.getByLabel("Número de documento").fill("33334444Y");
    await fieldset.getByLabel("Caducidad del documento").fill("2031-01-01");
    await fieldset.getByLabel("País emisor del documento").fill("España");

    const payButton = page.getByRole("button", { name: "Continuar al pago" });
    await expect(payButton).toBeEnabled();
    await payButton.click();
    await page.waitForURL(/\/confirmacion\//, { timeout: 15000 });
    await page.getByRole("link", { name: "Ir a Mi Viaje" }).click();
    await page.waitForURL(/\/mi-viaje\//, { timeout: 15000 });

    await expect(page.locator("#hotel")).toBeVisible();
    await expect(page.getByText("Habitaciones", { exact: true })).toBeVisible();
    await expect(page.locator("#vuelos")).toHaveCount(0);
  });
});

test.describe("Mi Viaje — seguridad (§41)", () => {
  test("an unrecognized token is rejected with a real 404, not a partial/empty page", async ({ page }) => {
    const response = await page.goto("/mi-viaje/not-a-real-token-xyz");
    expect(response?.status()).toBe(404);
  });

  test("the public booking reference alone never grants access — only the access token does", async ({ page }) => {
    const response = await page.goto(`/mi-viaje/${DEMO_REFERENCE}`);
    expect(response?.status()).toBe(404);
  });

  test("two different bookings never leak each other's traveler data through their own token page", async ({ page }) => {
    const email = `qa-isolation-${Date.now()}@example.com`;
    await purchaseTicketOnly(page, email);
    const confirmationUrl = page.url();
    const freshToken = new URL(confirmationUrl).searchParams.get("token");
    expect(freshToken).toBeTruthy();

    await page.goto(`/mi-viaje/${freshToken}`);
    await expect(page.getByText("QA Solo")).toBeVisible();
    await expect(page.getByText("Demo Viajero Mi Viaje")).toHaveCount(0);

    await page.goto(`/mi-viaje/${DEMO_TOKEN}`);
    await expect(page.getByRole("heading", { name: "Demo Viajero Mi Viaje" })).toBeVisible();
    await expect(page.getByText("QA Solo")).toHaveCount(0);
  });
});
