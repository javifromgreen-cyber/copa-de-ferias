import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const DEMO_TOKEN = "demo-manchester-atu-aire";
const DEMO_REFERENCE = "CDF-DEMOMAN1";
const DEMO_EMAIL = "demo.mi.viaje@example.com";

test.describe("Header — Mi Viaje navigation (correction §1/§20)", () => {
  test("Mi Viaje link is visible in the desktop header and navigates to the access screen", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("banner").getByRole("link", { name: "Mi Viaje", exact: true }).click();
    await expect(page).toHaveURL(/\/mi-viaje$/);
    await expect(page.getByRole("heading", { name: "Accede a tu viaje" })).toBeVisible();
  });

  test("'Ver partidos' CTA stays present in the header alongside Mi Viaje", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("banner").getByRole("link", { name: /ver partidos/i })).toBeVisible();
  });
});

test.describe("/mi-viaje — real access screen (correction §2/§3)", () => {
  test("shows the access form with Email + Referencia de reserva fields", async ({ page }) => {
    await page.goto("/mi-viaje");
    await expect(page.getByRole("heading", { name: "Accede a tu viaje" })).toBeVisible();
    await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
    await expect(page.getByLabel(/referencia de reserva/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /ver mi viaje/i })).toBeVisible();
  });

  test("correct email + reference grants access to the real booking", async ({ page }) => {
    await page.goto("/mi-viaje");
    await page.getByLabel("Email", { exact: true }).fill(DEMO_EMAIL);
    await page.getByLabel(/referencia de reserva/i).fill(DEMO_REFERENCE);
    await page.getByRole("button", { name: /ver mi viaje/i }).click();
    await page.waitForURL(new RegExp(`/mi-viaje/${DEMO_TOKEN}`));
    await expect(page.getByText(`Reserva ${DEMO_REFERENCE}`)).toBeVisible();
  });

  test("a wrong email for a real reference is rejected with a generic error, never revealing the reference is real", async ({ page }) => {
    await page.goto("/mi-viaje");
    await page.getByLabel("Email", { exact: true }).fill("nadie@example.com");
    await page.getByLabel(/referencia de reserva/i).fill(DEMO_REFERENCE);
    await page.getByRole("button", { name: /ver mi viaje/i }).click();
    await expect(page.getByText("No encontramos ninguna reserva con esos datos")).toBeVisible();
    await expect(page).toHaveURL(/\/mi-viaje$/);
  });

  test("a made-up reference is rejected with the same generic error (no enumeration)", async ({ page }) => {
    await page.goto("/mi-viaje");
    await page.getByLabel("Email", { exact: true }).fill(DEMO_EMAIL);
    await page.getByLabel(/referencia de reserva/i).fill("CDF-NOEXISTE");
    await page.getByRole("button", { name: /ver mi viaje/i }).click();
    await expect(page.getByText("No encontramos ninguna reserva con esos datos")).toBeVisible();
  });

  test("the access token never appears anywhere in the lookup page's HTML", async ({ page }) => {
    await page.goto("/mi-viaje");
    const html = await page.content();
    expect(html).not.toContain(DEMO_TOKEN);
  });

  test("visiting /mi-viaje again after a successful lookup redirects straight to the authorized booking (§4)", async ({ page }) => {
    await page.goto("/mi-viaje");
    await page.getByLabel("Email", { exact: true }).fill(DEMO_EMAIL);
    await page.getByLabel(/referencia de reserva/i).fill(DEMO_REFERENCE);
    await page.getByRole("button", { name: /ver mi viaje/i }).click();
    await page.waitForURL(new RegExp(`/mi-viaje/${DEMO_TOKEN}`));

    await page.goto("/mi-viaje");
    await page.waitForURL(new RegExp(`/mi-viaje/${DEMO_TOKEN}`));
    await expect(page.getByText(`Reserva ${DEMO_REFERENCE}`)).toBeVisible();
  });
});

test.describe("Acciones necesarias (correction §6-11)", () => {
  test("the demo booking's one pending action appears right after the header, with its due date", async ({ page }) => {
    await page.goto(`/mi-viaje/${DEMO_TOKEN}`);
    const section = page.locator("#acciones-necesarias");
    await expect(section).toBeVisible();
    await expect(section).toContainText("Completa el check-in del hotel");
    await expect(section).toContainText("Antes del");
  });

  test("a booking with no actions never shows the Acciones necesarias block at all", async ({ page }) => {
    // Belgrado's GROUP_CDF page is a different template entirely and never
    // renders this A_TU_AIRE-only section — used here only as a booking
    // with zero BookingAction rows, to prove the block stays absent.
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
    await page.getByLabel("Apellidos", { exact: true }).fill("SinAcciones");
    await page.getByLabel("Email", { exact: true }).fill(`qa-no-actions-${Date.now()}@example.com`);
    await page.getByLabel("Teléfono", { exact: true }).fill("600111222");
    const fieldset = page.locator("fieldset", { has: page.getByText("Viajero 1", { exact: true }) });
    await fieldset.getByLabel("Nombre").fill("QA");
    await fieldset.getByLabel("Apellidos").fill("Sin");
    await fieldset.getByLabel("Nacionalidad").selectOption("España");
    await fieldset.getByLabel("Tipo de documento").selectOption({ label: "DNI" });
    await fieldset.getByLabel("Número de documento").fill("55556666Q");
    await fieldset.getByLabel("Caducidad del documento").fill("2031-01-01");
    await fieldset.getByLabel("País emisor del documento").fill("España");
    await page.getByRole("button", { name: "Continuar al pago" }).click();
    await page.waitForURL(/\/confirmacion\//, { timeout: 15000 });
    await page.getByRole("link", { name: "Ir a Mi Viaje" }).click();
    await page.waitForURL(/\/mi-viaje\//, { timeout: 15000 });

    await expect(page.locator("#acciones-necesarias")).toHaveCount(0);
  });
});

test.describe("Snapshots survive a later Event change (correction §16/§17/§19)", () => {
  test("changing the Event's matchDate updates the match info shown but never the already-booked hotel dates, rooming or flights", async ({ page }) => {
    const prisma = new PrismaClient();
    const trip = await prisma.trip.findUniqueOrThrow({ where: { slug: "manchester-a-tu-aire" }, include: { events: true } });
    const event = trip.events[0];
    const originalMatchDate = event.matchDate;
    const originalKickoff = event.kickoff;

    try {
      await page.goto(`/mi-viaje/${DEMO_TOKEN}`);
      const hotelBefore = await page.locator("#hotel").innerText();
      const flightsBefore = await page.locator("#vuelos").innerText();
      const roomsBefore = await page.getByText("Habitación 1").innerText();

      // Simulate an official reschedule of the match, well after this
      // booking's hotel/flights/rooming were already purchased and frozen.
      const rescheduled = new Date(2027, 4, 15, 20, 0, 0);
      await prisma.event.update({ where: { id: event.id }, data: { matchDate: rescheduled, kickoff: rescheduled } });

      await page.goto(`/mi-viaje/${DEMO_TOKEN}`);
      await expect(page.locator("#entradas")).toContainText("15 de mayo de 2027");
      await expect(page.locator("#hotel").getByText("4 de diciembre")).toBeVisible();
      await expect(page.locator("#hotel").getByText("6 de diciembre")).toBeVisible();
      expect(await page.locator("#hotel").innerText()).toBe(hotelBefore);
      expect(await page.locator("#vuelos").innerText()).toBe(flightsBefore);
      expect(await page.getByText("Habitación 1").innerText()).toBe(roomsBefore);
    } finally {
      await prisma.event.update({ where: { id: event.id }, data: { matchDate: originalMatchDate, kickoff: originalKickoff } });
      await prisma.$disconnect();
    }
  });
});
