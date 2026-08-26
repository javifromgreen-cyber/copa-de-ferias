import { test, expect } from "@playwright/test";

test("Mi Viaje requires a valid access token", async ({ page }) => {
  const response = await page.goto("/mi-viaje/not-a-real-token");
  expect(response?.status()).toBe(404);
});

test("Mi Viaje lookup form is reachable without a token", async ({ page }) => {
  await page.goto("/mi-viaje");
  await expect(page.getByLabel(/número de reserva/i)).toBeVisible();
  await expect(page.getByLabel(/email/i)).toBeVisible();
});
