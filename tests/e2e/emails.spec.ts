import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const DEMO_REFERENCE = "CDF-DEMOMAN1";
const LEGACY_KEYS = [
  "welcome",
  "pending_data",
  "reminder_30_days",
  "reminder_21_days",
  "whatsapp_15_days",
  "planning_7_days",
  "final_48h",
  "thanks_after_return",
  "review_request",
  "future_trips",
];
const FORBIDDEN_WORDS = [/grupo de whatsapp/i, /\bhost\b/i, /coordinador/i, /viajar con el grupo/i];

async function loginAsAdmin(page: import("@playwright/test").Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Contraseña").fill("cambia-esta-clave");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/admin$/);
}

async function openDemoBooking(page: import("@playwright/test").Page) {
  await page.goto("/admin/reservas");
  await page.getByLabel("Buscar").fill(DEMO_REFERENCE);
  await page.getByRole("button", { name: "Filtrar" }).click();
  await page.getByRole("link", { name: DEMO_REFERENCE }).click();
  await page.waitForLoadState("networkidle");
}

test.describe("Reserva confirmada + Mi Viaje", () => {
  test("a completed checkout sends exactly one email (booking_confirmed), with a Mi Viaje CTA, never a separate welcome email", async ({ page }) => {
    const prisma = new PrismaClient();
    let bookingId: string | null = null;
    let tripId: string | null = null;
    let travelersCount = 0;

    try {
      await page.goto("/viajes/derbi-eterno-belgrado/reservar");
      await page.getByRole("button", { name: "Continuar" }).click();

      await page.getByLabel("Nombre *", { exact: true }).fill("Test");
      await page.getByLabel("Apellidos *").fill("Emails");
      await page.getByLabel(/Nacionalidad/).selectOption("España");
      await page.getByLabel(/Tipo de documento/).selectOption("dni");
      await page.getByLabel(/Número de documento/).fill("99887766Z");
      await page.getByLabel(/Caducidad del documento/).fill("2030-01-01");
      await page.getByLabel(/País emisor/).fill("España");
      await page.getByRole("button", { name: "Continuar" }).click();

      await page.getByRole("radio", { name: /Habitación individual/ }).check();
      await page.getByRole("button", { name: "Continuar" }).click();

      const buyerEmail = `e2e-emails-${Date.now()}@example.com`;
      await page.getByLabel("Nombre").fill("Test");
      await page.getByLabel("Apellidos").fill("Emails");
      await page.getByLabel("Email").fill(buyerEmail);
      await page.getByLabel("Teléfono").fill("600000000");
      await page.getByRole("button", { name: "Continuar", exact: true }).click();

      await expect(page.getByRole("heading", { name: "Revisar reserva" })).toBeVisible();
      await page.getByRole("button", { name: "Continuar al pago" }).click();
      await page.getByRole("checkbox", { name: /he leído y acepto/i }).check();
      await page.getByRole("button", { name: /simular pago/i }).click();
      await page.waitForURL(/\/confirmacion\/CDF-/);

      const booking = await prisma.booking.findFirstOrThrow({ where: { buyerEmail }, include: { emailLogs: true, trip: true } });
      bookingId = booking.id;
      tripId = booking.tripId;
      travelersCount = booking.travelersCount;

      expect(booking.emailLogs).toHaveLength(1);
      expect(booking.emailLogs[0].templateKey).toBe("booking_confirmed");
      expect(booking.emailLogs[0].body).toContain("/mi-viaje/");
      expect(booking.emailLogs.some((l) => l.templateKey === "welcome")).toBe(false);
    } finally {
      if (bookingId) {
        await prisma.bookingDocument.deleteMany({ where: { bookingId } });
        await prisma.bookingUpdate.deleteMany({ where: { bookingId } });
        await prisma.bookingAction.deleteMany({ where: { bookingId } });
        await prisma.emailLog.deleteMany({ where: { bookingId } });
        await prisma.traveler.deleteMany({ where: { bookingId } });
        await prisma.booking.delete({ where: { id: bookingId } });
      }
      if (tripId) {
        const trip = await prisma.trip.findUniqueOrThrow({ where: { id: tripId }, include: { bookings: { where: { bookingStatus: { not: "cancelled" } } } } });
        const trueSold = trip.bookings.reduce((sum, b) => sum + b.travelersCount, 0);
        await prisma.trip.update({ where: { id: tripId }, data: { soldSpots: trueSold, status: trip.status === "sold_out" && trueSold < trip.maxSpots ? "open" : trip.status } });
      }
      void travelersCount;
      await prisma.$disconnect();
    }
  });
});

test.describe("Acción necesaria", () => {
  test("creating a BookingAction sends exactly one action_required email; completing it sends no new email", async ({ page }) => {
    const prisma = new PrismaClient();
    const title = `[E2E] Acción de email ${Date.now()}`;
    try {
      await loginAsAdmin(page);
      await openDemoBooking(page);

      const booking = await prisma.booking.findUniqueOrThrow({ where: { reference: DEMO_REFERENCE } });
      const before = await prisma.emailLog.count({ where: { bookingId: booking.id } });

      await page.getByRole("button", { name: "+ Añadir acción necesaria" }).click();
      await page.getByLabel("Título").fill(title);
      await page.getByRole("button", { name: "Añadir acción" }).click();
      await expect(page.getByText(title)).toBeVisible();

      const afterCreate = await prisma.emailLog.findMany({ where: { bookingId: booking.id }, orderBy: { sentAt: "desc" } });
      expect(afterCreate.length).toBe(before + 1);
      expect(afterCreate[0].templateKey).toBe("action_required");
      expect(afterCreate[0].body).toContain(title);
      expect(afterCreate[0].body).toContain("/mi-viaje/");

      const row = page.locator("li", { hasText: title });
      await row.getByRole("button", { name: "Marcar completada" }).click();
      await expect(row.getByText("Completada")).toBeVisible();

      const afterComplete = await prisma.emailLog.count({ where: { bookingId: booking.id } });
      expect(afterComplete).toBe(before + 1);
    } finally {
      await prisma.bookingAction.deleteMany({ where: { title } });
      await prisma.emailLog.deleteMany({ where: { templateKey: "action_required", body: { contains: title } } });
      await prisma.$disconnect();
    }
  });
});

test.describe("Cambio importante", () => {
  test("a normal update sends no email; checking 'notificar' sends exactly one important_update email", async ({ page }) => {
    const prisma = new PrismaClient();
    const quietTitle = `[E2E] Actualización silenciosa ${Date.now()}`;
    const loudTitle = `[E2E] Cambio importante ${Date.now()}`;
    try {
      await loginAsAdmin(page);
      await openDemoBooking(page);

      const booking = await prisma.booking.findUniqueOrThrow({ where: { reference: DEMO_REFERENCE } });
      const before = await prisma.emailLog.count({ where: { bookingId: booking.id } });

      await page.getByRole("button", { name: "+ Nueva actualización" }).click();
      await page.getByLabel("Título").fill(quietTitle);
      await page.getByRole("button", { name: "Publicar actualización" }).click();
      await expect(page.getByText(quietTitle)).toBeVisible();

      const afterQuiet = await prisma.emailLog.count({ where: { bookingId: booking.id } });
      expect(afterQuiet).toBe(before);

      await page.getByRole("button", { name: "+ Nueva actualización" }).click();
      await page.getByLabel("Título").fill(loudTitle);
      await page.getByLabel(/Es un cambio importante/).check();
      await page.getByRole("button", { name: "Publicar actualización" }).click();
      await expect(page.getByText(loudTitle)).toBeVisible();

      const afterLoud = await prisma.emailLog.findMany({ where: { bookingId: booking.id }, orderBy: { sentAt: "desc" } });
      expect(afterLoud.length).toBe(before + 1);
      expect(afterLoud[0].templateKey).toBe("important_update");
      expect(afterLoud[0].body).toContain(loudTitle);
    } finally {
      await prisma.bookingUpdate.deleteMany({ where: { title: { in: [quietTitle, loudTitle] } } });
      await prisma.emailLog.deleteMany({ where: { templateKey: "important_update", body: { contains: loudTitle } } });
      await prisma.$disconnect();
    }
  });
});

test.describe("Recordatorio antes del viaje", () => {
  test("processing pending emails twice for a departing trip sends the reminder only once", async ({ page }) => {
    const prisma = new PrismaClient();
    const booking = await prisma.booking.findUniqueOrThrow({ where: { reference: DEMO_REFERENCE }, include: { trip: { include: { events: true } } } });
    const trip = booking.trip;
    const event = trip.events[0];
    const originalTripMatchDate = trip.matchDate;
    const originalEventMatchDate = event?.matchDate;
    const originalEventKickoff = event?.kickoff;

    try {
      // Bring the trip's matchDate close enough that trip_reminder's
      // "48h before departure" target date is already in the past —
      // mirrors the existing "later Event change" pattern used elsewhere
      // to test date-dependent logic without waiting for real time to pass.
      const soon = new Date();
      await prisma.trip.update({ where: { id: trip.id }, data: { matchDate: soon } });
      if (event) await prisma.event.update({ where: { id: event.id }, data: { matchDate: soon, kickoff: soon } });

      await loginAsAdmin(page);
      await page.goto("/admin/emails");

      await page.getByRole("button", { name: "Procesar emails pendientes" }).click();
      await expect(page.getByText(/emails procesados/)).toBeVisible();
      const afterFirst = await prisma.emailLog.count({ where: { bookingId: booking.id, templateKey: "trip_reminder" } });
      expect(afterFirst).toBe(1);

      await page.getByRole("button", { name: "Procesar emails pendientes" }).click();
      await expect(page.getByText(/emails procesados/)).toBeVisible();
      const afterSecond = await prisma.emailLog.count({ where: { bookingId: booking.id, templateKey: "trip_reminder" } });
      expect(afterSecond).toBe(1);
    } finally {
      await prisma.emailLog.deleteMany({ where: { bookingId: booking.id, templateKey: "trip_reminder" } });
      await prisma.trip.update({ where: { id: trip.id }, data: { matchDate: originalTripMatchDate } });
      if (event) await prisma.event.update({ where: { id: event.id }, data: { matchDate: originalEventMatchDate!, kickoff: originalEventKickoff } });
      await prisma.$disconnect();
    }
  });
});

test.describe("Plantillas archivadas (Grupos CDF)", () => {
  test("every legacy template is archived and inactive, and none of the active templates mention Grupos CDF concepts", async () => {
    const prisma = new PrismaClient();
    try {
      const legacy = await prisma.emailTemplate.findMany({ where: { key: { in: LEGACY_KEYS } } });
      expect(legacy).toHaveLength(LEGACY_KEYS.length);
      for (const t of legacy) {
        expect(t.archived).toBe(true);
        expect(t.active).toBe(false);
      }

      const active = await prisma.emailTemplate.findMany({ where: { archived: false } });
      expect(active.length).toBeGreaterThan(0);
      for (const t of active) {
        for (const pattern of FORBIDDEN_WORDS) {
          expect(`${t.subject} ${t.body}`).not.toMatch(pattern);
        }
      }
    } finally {
      await prisma.$disconnect();
    }
  });
});
