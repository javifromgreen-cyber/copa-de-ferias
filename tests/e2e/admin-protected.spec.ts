import { test, expect } from "@playwright/test";

test("visiting /admin without a session redirects to the login screen", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login/);
  await expect(page.getByRole("heading", { name: /panel de administración/i })).toBeVisible();
});

test("visiting /admin/viajes without a session also redirects to login", async ({ page }) => {
  await page.goto("/admin/viajes");
  await expect(page).toHaveURL(/\/admin\/login/);
});
