import { test, expect } from "@playwright/test";

test("home shows Belgrado as Abierto and the two upcoming trips as Próximamente", async ({ page }) => {
  await page.goto("/");

  const belgrado = page.locator("article", { hasText: "Belgrado" });
  await expect(belgrado).toContainText("Abierto");

  const ingles = page.locator("article", { hasText: "Fútbol Inglés" });
  await expect(ingles).toContainText("Próximamente");
  await expect(ingles.getByRole("button", { name: /avísame/i })).toBeVisible();

  const lisboa = page.locator("article", { hasText: "Lisboa" });
  await expect(lisboa).toContainText("Próximamente");
});

test("home does not show a price or spots counter on trip cards", async ({ page }) => {
  await page.goto("/");
  const belgrado = page.locator("article", { hasText: "Belgrado" });
  await expect(belgrado).not.toContainText("€");
});

test("reviews are hidden by default", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(/ver reseñas/i)).toHaveCount(0);
});
