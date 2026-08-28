import { test, expect } from "@playwright/test";

test("published trip (Belgrado) has a public ficha with a human title and price, never plazas or 'Viaje #' (§1/§2/§20)", async ({ page }) => {
  const response = await page.goto("/viajes/derbi-eterno-belgrado");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Belgrado" })).toBeVisible();
  await expect(page.getByText("El Derbi Eterno")).toBeVisible();
  await expect(page.getByText("549 €", { exact: true })).toBeVisible();
  await expect(page.getByText(/plaza.*disponible/i)).toHaveCount(0);
  await expect(page.getByText(/^Viaje #/)).toHaveCount(0);
});

test("upcoming trip without a public page (Fútbol Inglés) 404s", async ({ page }) => {
  const response = await page.goto("/viajes/futbol-ingles");
  expect(response?.status()).toBe(404);
});

test("/viajes groups trips into Abiertos and Próximamente", async ({ page }) => {
  await page.goto("/viajes");
  await expect(page.getByRole("heading", { name: "Abiertos" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Próximamente" })).toBeVisible();
});
