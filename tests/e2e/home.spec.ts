import { test, expect } from "@playwright/test";

test("home no longer surfaces Belgrado (retired from public listings) and still shows the upcoming trips as Próximamente", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Belgrado")).toHaveCount(0);

  const ingles = page.locator("article", { hasText: "Fútbol Inglés" });
  await expect(ingles).toContainText("Próximamente");
  await expect(ingles.getByRole("button", { name: /avísame/i })).toBeVisible();

  const lisboa = page.locator("article", { hasText: "Lisboa" });
  await expect(lisboa).toContainText("Próximamente");
});

test("trip cards never show a price or spots counter", async ({ page }) => {
  await page.goto("/viajes");
  const card = page.locator("article", { hasText: "Ámsterdam" });
  await expect(card).not.toContainText("€");
});

test("reviews are hidden by default", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(/ver reseñas/i)).toHaveCount(0);
});
