import { test, expect } from "@playwright/test";

test("submitting the Avísame form shows a confirmation message", async ({ page }) => {
  await page.goto("/");
  const ingles = page.locator("article", { hasText: "Fútbol Inglés" });
  await ingles.getByRole("button", { name: /avísame/i }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  await dialog.getByLabel("Nombre").fill("Test E2E");
  await dialog.getByLabel("Email").fill(`test-${Date.now()}@example.com`);
  await dialog.getByLabel("Ciudad de salida").fill("Barcelona");
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: /avísame/i }).click();

  await expect(dialog.getByText("Hecho. Estás en la lista.")).toBeVisible();
});
