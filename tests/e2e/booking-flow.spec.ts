import { test, expect } from "@playwright/test";

test("completes a full demo booking and lands on a clearly simulated confirmation", async ({ page }) => {
  await page.goto("/viajes/derbi-eterno-belgrado/reservar");

  // Step 1: number of travelers (default 1) — just continue.
  await page.getByRole("button", { name: "Continuar" }).click();

  // Step 2: traveler data.
  await page.getByLabel("Nombre").fill("Test");
  await page.getByLabel("Apellidos").fill("E2E");
  await page.getByRole("button", { name: "Continuar" }).click();

  // Step 3: habitaciones — a lone traveler must explicitly resolve their room
  // before continuing (no ambiguous default for a single traveler).
  await expect(page.getByRole("button", { name: "Continuar" })).toBeDisabled();
  await page.getByRole("combobox").selectOption("single");
  await expect(page.getByText("Test E2E — habitación individual")).toBeVisible();
  await page.getByRole("button", { name: "Continuar" }).click();

  // Step 4: buyer data.
  await page.getByLabel("Nombre").fill("Test");
  await page.getByLabel("Apellidos").fill("Comprador");
  await page.getByLabel("Email").fill(`e2e-${Date.now()}@example.com`);
  await page.getByLabel("Teléfono").fill("600000000");
  await page.getByRole("button", { name: "Continuar" }).click();

  // Step 5: payment — demo notice must be visible, accept conditions, submit.
  await expect(page.getByText(/modo demo/i)).toBeVisible();
  await page.getByRole("checkbox", { name: /he leído y acepto/i }).check();
  await page.getByRole("button", { name: /simular pago/i }).click();

  await expect(page).toHaveURL(/\/confirmacion\/CDF-/);
  await expect(page.getByText(/simulación/i)).toBeVisible();
  // 549 (base) + 90 (single supplement) = 639.
  await expect(page.getByText("639 €", { exact: true })).toBeVisible();
});

test("two travelers default to sharing a room together, no supplement", async ({ page }) => {
  await page.goto("/viajes/derbi-eterno-belgrado/reservar");

  await page.getByRole("button", { name: "Sumar viajero" }).click();
  await page.getByRole("button", { name: "Continuar" }).click();

  await page.getByRole("group", { name: "Viajero 1" }).getByLabel("Nombre").fill("Ana");
  await page.getByRole("group", { name: "Viajero 1" }).getByLabel("Apellidos").fill("Uno");
  await page.getByRole("group", { name: "Viajero 2" }).getByLabel("Nombre").fill("Berto");
  await page.getByRole("group", { name: "Viajero 2" }).getByLabel("Apellidos").fill("Dos");
  await page.getByRole("button", { name: "Continuar" }).click();

  // Habitaciones: the two travelers are paired together by default.
  await expect(page.getByText("Ana Uno + Berto Dos — habitación compartida")).toBeVisible();
  await expect(page.getByRole("button", { name: "Continuar" })).toBeEnabled();
});
