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

  // Fase 3A — the real Stripe Payment Element panel mounts next to the
  // summary. This dev/test environment has no real Stripe TEST keys
  // configured (STRIPE_SECRET_KEY is an empty placeholder — see
  // .env.example), so the panel is expected to surface a clear error
  // rather than ever silently claiming anything was charged/authorized —
  // exactly the same "never claims a payment happened" guarantee the
  // previous disabled-button placeholder used to assert, now expressed
  // against the real payment flow's own graceful-degradation path.
  await expect(page.getByText(/preparando el pago/i)).toBeVisible();
  // React's dev-mode StrictMode double-invokes this panel's mount effect,
  // so which of the two error paths' message ends up rendered depends on
  // harmless timing between the two invocations — both are correct,
  // expected outcomes of no Stripe TEST keys being configured (see
  // .env.example) and neither ever claims a payment happened.
  await expect(page.getByText(/no se pudo iniciar el pago|no está configurado|ya no está disponible para pagar/i)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("payment-authorized")).toHaveCount(0);
  await expect(page.getByTestId("payment-form")).toHaveCount(0);
});

test("a missing traveler name is rejected server-side with a visible error, never silently proceeding", async ({ page }) => {
  await page.goto("/viajes/amsterdam-de-klassieker/reservar-real");
  // Leave firstName/lastName empty and submit.
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByTestId("ready-to-pay")).toHaveCount(0);
});
