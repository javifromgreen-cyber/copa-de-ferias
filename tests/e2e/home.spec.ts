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

test("trip cards show a real 'Desde X€' price when one exists, but never a spots counter", async ({ page }) => {
  await page.goto("/viajes");
  const card = page.locator("article", { hasText: "Ajax" });
  await expect(card).toContainText("Desde");
  await expect(card).toContainText("94 €");
  await expect(card).not.toContainText(/plaza.*disponible/i);
});

test("an unpublished trip with no configured price never shows a literal 'Desde 0 €'", async ({ page }) => {
  await page.goto("/");
  const card = page.locator("article", { hasText: "Fútbol Inglés" });
  await expect(card).toContainText("Precio disponible próximamente");
  await expect(card).not.toContainText("0 €");
});

test("reviews are hidden by default", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(/ver reseñas/i)).toHaveCount(0);
});
