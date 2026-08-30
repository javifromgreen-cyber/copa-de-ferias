import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const DEMO_TOKEN = "demo-manchester-atu-aire";
const DEMO_REFERENCE = "CDF-DEMOMAN1";

async function loginAsAdmin(page: import("@playwright/test").Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Contraseña").fill("cambia-esta-clave");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/admin$/);
}

/**
 * TripForm/EventForm stay on the same URL after a successful save (they
 * router.push to the page they're already on), so waitForURL never proves
 * the round trip finished, and "networkidle" is unreliable here — Next
 * dev's HMR keeps a live WebSocket open, and a fast local save can resolve
 * before a disabled-button poll ever catches it. Waiting for the actual
 * POST the click triggers (the server action itself) is the one precise
 * signal that the mutation has been committed.
 */
async function clickAndWaitSave(page: import("@playwright/test").Page, buttonName: string) {
  await Promise.all([
    page.waitForResponse((resp) => resp.request().method() === "POST"),
    page.getByRole("button", { name: buttonName }).click(),
  ]);
}

test.describe("Admin — Eventos", () => {
  test("edit an Event's schedule status and save, then revert", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/eventos");
    await page.getByRole("link", { name: /Manchester City vs Manchester United/i }).click();
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: /Editar evento/i })).toBeVisible();
    // Competition is inherited, never manually duplicated (§3/§31) — shown
    // as read-only region/type text, not re-entered.
    await expect(page.getByText(/Liga nacional/)).toBeVisible();

    const scheduleSelect = page.getByLabel("Horario");
    await expect(scheduleSelect).toHaveValue("confirmed");
    await scheduleSelect.selectOption("time_provisional");
    await clickAndWaitSave(page, "Guardar evento");
    await expect(page.getByLabel("Horario")).toHaveValue("time_provisional");
    await expect(page.getByText(/Horario provisional/)).toBeVisible();

    await page.getByLabel("Horario").selectOption("confirmed");
    await clickAndWaitSave(page, "Guardar evento");
    await expect(page.getByLabel("Horario")).toHaveValue("confirmed");
  });

  test("editing an Event preserves matchDate's existing time, and only changes it when the time field itself is edited", async ({ page }) => {
    const prisma = new PrismaClient();
    let eventId = "";
    let originalMatchDate: Date;
    try {
      const event = await prisma.event.findFirstOrThrow({ where: { homeTeam: "Manchester City", awayTeam: "Manchester United" } });
      eventId = event.id;
      originalMatchDate = event.matchDate;
      const pad = (n: number) => String(n).padStart(2, "0");
      const originalTime = `${pad(originalMatchDate.getUTCHours())}:${pad(originalMatchDate.getUTCMinutes())}`;

      await loginAsAdmin(page);
      await page.goto(`/admin/eventos/${eventId}`);
      await page.waitForLoadState("networkidle");

      // §1: both date and time must be precracked correctly from the
      // existing matchDate.
      await expect(page.getByLabel("Hora del partido")).toHaveValue(originalTime);

      // §2: saving after touching only an unrelated field must not move
      // matchDate at all — not even to the same day at a different hour.
      const orderInput = page.getByLabel("Orden");
      const currentOrder = await orderInput.inputValue();
      await orderInput.fill(currentOrder);
      await clickAndWaitSave(page, "Guardar evento");
      const afterUnrelatedSave = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
      expect(afterUnrelatedSave.matchDate.getTime()).toBe(originalMatchDate.getTime());

      // §3: editing the time field must update matchDate to that exact
      // new time, on the same date.
      await page.getByLabel("Hora del partido").fill("09:15");
      await clickAndWaitSave(page, "Guardar evento");
      const afterTimeChange = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
      expect(afterTimeChange.matchDate.toISOString()).toBe(
        `${originalMatchDate.toISOString().slice(0, 10)}T09:15:00.000Z`,
      );
    } finally {
      if (eventId) await prisma.event.update({ where: { id: eventId }, data: { matchDate: originalMatchDate! } });
      await prisma.$disconnect();
    }
  });

  test("filters the Eventos list by competition and by team", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/eventos");

    await page.getByLabel("Equipo").fill("Manchester");
    await page.getByRole("button", { name: "Filtrar" }).click();
    await expect(page.getByRole("link", { name: /Manchester City vs Manchester United/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Ajax vs Feyenoord/i })).toHaveCount(0);

    await page.goto("/admin/eventos");
    await page.getByLabel("Competición").selectOption({ label: "Premier League" });
    await page.getByRole("button", { name: "Filtrar" }).click();
    await expect(page.getByRole("link", { name: /Manchester City vs Manchester United/i })).toBeVisible();
  });
});

test.describe("Admin — Home destacados loop (§26)", () => {
  test("toggling homeFeatured off removes the trip from Home, toggling it back on restores it", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/viajes");
    await page.getByRole("link", { name: /Manchester/i }).first().click();
    await page.waitForLoadState("networkidle");

    const featuredCheckbox = page.getByLabel("Destacado en Home");
    await expect(featuredCheckbox).toBeChecked();

    const destacadosSection = page.locator("section", { has: page.getByRole("heading", { name: "Partidos destacados" }) });

    try {
      await featuredCheckbox.uncheck();
      await clickAndWaitSave(page, "Guardar viaje");
      await page.goto("/");
      await expect(destacadosSection.getByRole("link", { name: /Manchester City.*Manchester United/i })).toHaveCount(0);
    } finally {
      await page.goto("/admin/viajes");
      await page.getByRole("link", { name: /Manchester/i }).first().click();
      await page.waitForLoadState("networkidle");
      const checkbox = page.getByLabel("Destacado en Home");
      if (!(await checkbox.isChecked())) {
        await checkbox.check();
        await clickAndWaitSave(page, "Guardar viaje");
      }
      await expect(page.getByLabel("Destacado en Home")).toBeChecked();
    }

    await page.goto("/");
    await expect(destacadosSection.getByRole("link", { name: /Manchester City.*Manchester United/i }).first()).toBeVisible();
  });
});

test.describe("Admin — Entradas (TicketOffer)", () => {
  test("editing a ticket offer's price is reflected in the global Entradas list", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/eventos");
    await page.getByRole("link", { name: /Manchester City vs Manchester United/i }).click();
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "Editar" }).first().click();
    const costInput = page.getByLabel("Precio coste");
    await costInput.fill("60");
    await page.getByRole("button", { name: "Guardar oferta" }).click();
    await expect(page.getByRole("button", { name: "Guardar oferta" })).toHaveCount(0);
    const generalRow = page.locator("tr", { hasText: "General" });
    await expect(generalRow).toContainText("60");

    // Revert.
    await page.getByRole("button", { name: "Editar" }).first().click();
    await page.getByLabel("Precio coste").fill("55");
    await page.getByRole("button", { name: "Guardar oferta" }).click();
    await expect(page.getByRole("button", { name: "Guardar oferta" })).toHaveCount(0);
    await expect(generalRow).toContainText("55");
  });

  test("Entradas list filters by competition and by team", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/entradas");
    await expect(page.getByRole("heading", { name: "Entradas" })).toBeVisible();

    await page.getByLabel("Buscar").fill("Manchester");
    await page.getByRole("button", { name: "Filtrar" }).click();
    await expect(page.getByText(/Manchester City vs Manchester United/).first()).toBeVisible();

    await page.goto("/admin/entradas");
    await page.getByLabel("Competición").selectOption({ label: "Premier League" });
    await page.getByRole("button", { name: "Filtrar" }).click();
    await expect(page.getByText(/Manchester City vs Manchester United/).first()).toBeVisible();
  });

  test("quick active/inactive toggle works from the Entradas list", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/entradas");
    await page.getByLabel("Buscar").fill("Manchester");
    await page.getByRole("button", { name: "Filtrar" }).click();

    const toggle = page.getByRole("button", { name: "Activa" }).first();
    await toggle.click();
    await expect(page.getByRole("button", { name: "Inactiva" }).first()).toBeVisible();
    // Revert.
    await page.getByRole("button", { name: "Inactiva" }).first().click();
    await expect(page.getByRole("button", { name: "Activa" }).first()).toBeVisible();
  });
});

test.describe("Admin — Reservas + Mi Viaje reflection (§39/§42)", () => {
  test("search finds the demo booking by reference", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/reservas");
    await page.getByLabel("Buscar").fill(DEMO_REFERENCE);
    await page.getByRole("button", { name: "Filtrar" }).click();
    await expect(page.getByRole("link", { name: DEMO_REFERENCE })).toBeVisible();
  });

  test("Booking detail shows Partido(s), Viajeros, Hotel, Habitaciones and Vuelos", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/reservas");
    await page.getByLabel("Buscar").fill(DEMO_REFERENCE);
    await page.getByRole("button", { name: "Filtrar" }).click();
    await page.getByRole("link", { name: DEMO_REFERENCE }).click();
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: "Partido(s)" })).toBeVisible();
    await expect(page.getByText(/Manchester City vs Manchester United/).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Viajeros" })).toBeVisible();
    await expect(page.getByText("Demo Viajero Mi Viaje", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Hotel" })).toBeVisible();
    await expect(page.getByText("Hotel Central Manchester", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Habitaciones" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Vuelos" })).toBeVisible();
    await expect(page.getByText("MAD").first()).toBeVisible();
  });

  test("create a BookingUpdate and see it reflected in Mi Viaje", async ({ page }) => {
    const prisma = new PrismaClient();
    const title = `[E2E] Actualización de prueba ${Date.now()}`;
    try {
      await loginAsAdmin(page);
      await page.goto("/admin/reservas");
      await page.getByLabel("Buscar").fill(DEMO_REFERENCE);
      await page.getByRole("button", { name: "Filtrar" }).click();
      await page.getByRole("link", { name: DEMO_REFERENCE }).click();
      await page.waitForLoadState("networkidle");

      await page.getByRole("button", { name: "+ Nueva actualización" }).click();
      await page.getByLabel("Título").fill(title);
      await page.getByRole("button", { name: "Publicar actualización" }).click();
      await expect(page.getByText(title)).toBeVisible();

      await page.goto(`/mi-viaje/${DEMO_TOKEN}`);
      await expect(page.getByText(title)).toBeVisible();
    } finally {
      await prisma.bookingUpdate.deleteMany({ where: { title } });
      await prisma.$disconnect();
    }
  });

  test("create a BookingAction, see it in Mi Viaje's Acciones necesarias, complete it, and see it disappear", async ({ page }) => {
    const prisma = new PrismaClient();
    const title = `[E2E] Acción de prueba ${Date.now()}`;
    try {
      await loginAsAdmin(page);
      await page.goto("/admin/reservas");
      await page.getByLabel("Buscar").fill(DEMO_REFERENCE);
      await page.getByRole("button", { name: "Filtrar" }).click();
      await page.getByRole("link", { name: DEMO_REFERENCE }).click();
      await page.waitForLoadState("networkidle");

      await page.getByRole("button", { name: "+ Añadir acción necesaria" }).click();
      await page.getByLabel("Título").fill(title);
      await page.getByRole("button", { name: "Añadir acción" }).click();
      await expect(page.getByText(title)).toBeVisible();

      await page.goto(`/mi-viaje/${DEMO_TOKEN}`);
      await expect(page.locator("#acciones-necesarias")).toContainText(title);

      await page.goto("/admin/reservas");
      await page.getByLabel("Buscar").fill(DEMO_REFERENCE);
      await page.getByRole("button", { name: "Filtrar" }).click();
      await page.getByRole("link", { name: DEMO_REFERENCE }).click();
      await page.waitForLoadState("networkidle");
      const row = page.locator("li", { hasText: title });
      await row.getByRole("button", { name: "Marcar completada" }).click();
      await expect(row.getByText("Completada")).toBeVisible();

      await page.goto(`/mi-viaje/${DEMO_TOKEN}`);
      const actionsSection = page.locator("#acciones-necesarias");
      const hasSection = (await actionsSection.count()) > 0;
      if (hasSection) await expect(actionsSection).not.toContainText(title);
    } finally {
      await prisma.bookingAction.deleteMany({ where: { title } });
      await prisma.$disconnect();
    }
  });

  test("changing a BookingDocument's status is reflected in Mi Viaje", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/reservas");
    await page.getByLabel("Buscar").fill(DEMO_REFERENCE);
    await page.getByRole("button", { name: "Filtrar" }).click();
    await page.getByRole("link", { name: DEMO_REFERENCE }).click();
    await page.waitForLoadState("networkidle");

    try {
      const flightRow = page.locator("tr", { hasText: "Vuelo" });
      await flightRow.getByRole("button", { name: "Editar" }).click();
      await page.getByLabel("Estado").selectOption("available");
      await page.getByRole("button", { name: "Guardar documento" }).click();
      await expect(page.locator("tr", { hasText: "Vuelo" })).toContainText("Disponible");

      await page.goto(`/mi-viaje/${DEMO_TOKEN}`);
      await expect(page.locator("#vuelos")).toContainText("Confirmado");
    } finally {
      await page.goto("/admin/reservas");
      await page.getByLabel("Buscar").fill(DEMO_REFERENCE);
      await page.getByRole("button", { name: "Filtrar" }).click();
      await page.getByRole("link", { name: DEMO_REFERENCE }).click();
      await page.waitForLoadState("networkidle");
      const flightRow = page.locator("tr", { hasText: "Vuelo" });
      await flightRow.getByRole("button", { name: "Editar" }).click();
      await page.getByLabel("Estado").selectOption("pending");
      await page.getByRole("button", { name: "Guardar documento" }).click();
    }
  });
});
