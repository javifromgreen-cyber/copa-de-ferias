import { test, expect } from "@playwright/test";

test("completes a full demo booking and lands on a clearly simulated confirmation", async ({ page }) => {
  await page.goto("/viajes/derbi-eterno-belgrado/reservar");

  // Step 1: number of travelers (default 1) — just continue.
  await page.getByRole("button", { name: "Continuar" }).click();

  // Step 2: traveler data.
  await page.getByLabel("Nombre").fill("Test");
  await page.getByLabel("Apellidos").fill("E2E");
  await page.getByRole("button", { name: "Continuar" }).click();

  // Step 3: buyer data.
  await page.getByLabel("Nombre").fill("Test");
  await page.getByLabel("Apellidos").fill("Comprador");
  await page.getByLabel("Email").fill(`e2e-${Date.now()}@example.com`);
  await page.getByLabel("Teléfono").fill("600000000");
  await page.getByRole("button", { name: "Continuar" }).click();

  // Step 4: payment — demo notice must be visible, accept conditions, submit.
  await expect(page.getByText(/modo demo/i)).toBeVisible();
  await page.getByRole("checkbox", { name: /he leído y acepto/i }).check();
  await page.getByRole("button", { name: /simular pago/i }).click();

  await expect(page).toHaveURL(/\/confirmacion\/CDF-/);
  await expect(page.getByText(/simulación/i)).toBeVisible();
  await expect(page.getByText("549 €", { exact: true })).toBeVisible();
});
