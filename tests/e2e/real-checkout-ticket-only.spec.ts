import { test, expect } from "@playwright/test";

// Fase 2 §24/§29 — the NEW real pre-payment saga's own route
// (/reservar-real), separate from the legacy /reservar demo flow. Only
// TICKET_ONLY is covered here: it's the one path that never calls Duffel
// or Nuitee, so it's genuinely testable end-to-end against the real dev
// server with zero network mocking needed — matching §28's "no real
// Duffel/Nuitee in tests" for anything that DOES need a provider (covered
// instead by the extensive HTTP-mocked vitest suite —
// tests/unit/prepare-checkout-attempt.test.ts).

test("CONFIGURACIÓN -> CONTINUAR -> READY_TO_PAY for a real TICKET_ONLY CheckoutAttempt, no Booking, no payment", async ({ page }) => {
  await page.goto("/viajes/amsterdam-de-klassieker/reservar-real");

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await page.getByLabel(/Nombre viajero 1/).fill("Ada");
  await page.getByLabel(/Apellidos viajero 1/).fill("Lovelace");
  await page.getByLabel("Nombre del comprador").fill("Ada");
  await page.getByLabel("Apellidos del comprador").fill("Lovelace");
  await page.getByLabel("Email del comprador").fill("ada@example.com");
  await page.getByLabel("Teléfono del comprador").fill("+34600000000");

  await page.getByRole("button", { name: "Continuar" }).click();

  // "Comprobando disponibilidad..." — however briefly — then READY_TO_PAY.
  await expect(page.getByTestId("ready-to-pay")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/listo para pagar/i)).toBeVisible();
  await expect(page.getByTestId("pvp-total")).toBeVisible();

  // The payment button must never claim to have charged anything.
  const payButton = page.getByRole("button", { name: /pago todavía no disponible en sandbox/i });
  await expect(payButton).toBeVisible();
  await expect(payButton).toBeDisabled();
});

test("a missing traveler name is rejected server-side with a visible error, never silently proceeding", async ({ page }) => {
  await page.goto("/viajes/amsterdam-de-klassieker/reservar-real");
  // Leave firstName/lastName empty and submit.
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByTestId("ready-to-pay")).toHaveCount(0);
});
