import { test, expect } from "@playwright/test";

test("home has no horizontal overflow on a mobile viewport", async ({ page }) => {
  await page.goto("/");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("mobile menu opens and navigates", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /abrir menú/i }).click();
  await page.getByRole("banner").getByRole("link", { name: "Partidos", exact: true }).click();
  await expect(page).toHaveURL(/\/viajes$/);
});

test("trip page shows a sticky mobile reserve CTA", async ({ page }) => {
  await page.goto("/viajes/derbi-eterno-belgrado");
  await expect(page.getByRole("link", { name: /reservar plaza/i }).last()).toBeVisible();
});
