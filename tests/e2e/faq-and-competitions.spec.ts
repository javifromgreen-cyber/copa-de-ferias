import { test, expect } from "@playwright/test";

test("general FAQ page groups questions into categories with accessible accordions", async ({ page }) => {
  await page.goto("/faq");
  await expect(page.getByRole("heading", { name: "Antes de reservar", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "¿Por qué Copa de Ferias?", exact: true })).toBeVisible();

  // All items start collapsed on this page (§46 — scannable, not a wall of open text).
  const firstQuestion = page.getByRole("button", { name: "¿Cómo elijo el partido?" });
  await expect(firstQuestion).toHaveAttribute("aria-expanded", "false");
  await firstQuestion.click();
  await expect(firstQuestion).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText(/Busca por equipo, ciudad o competición/)).toBeVisible();

  // Payment methods reflect the actually-enabled providers, never an invented one.
  await page.getByRole("button", { name: "¿Cómo funcionan los pagos?" }).click();
  await expect(page.getByText(/Stripe/)).toBeVisible();
  await expect(page.getByText(/PayPal/)).toBeVisible();
});

test("/competiciones only lists competitions with a real published match, and links into the filtered catalog", async ({ page }) => {
  await page.goto("/competiciones");
  const eredivisie = page.getByRole("link", { name: "Eredivisie" });
  await expect(eredivisie).toBeVisible();
  await eredivisie.click();
  await expect(page).toHaveURL(/\/viajes\?competicion=/);
  await expect(page.getByText(/Filtrando por/)).toBeVisible();
  await expect(page.locator("article", { hasText: "Ajax" })).toBeVisible();
});

test("/viajes search filters by team/city/competition using the real catalog query", async ({ page }) => {
  await page.goto("/viajes");
  await page.getByPlaceholder("Buscar equipo, ciudad o competición…").fill("Ajax");
  await page.getByRole("button", { name: "Buscar" }).click();
  await expect(page).toHaveURL(/\/viajes\?q=Ajax/);
  await expect(page.locator("article", { hasText: "Ajax" })).toBeVisible();
  await expect(page.locator("article", { hasText: "Manchester" })).toHaveCount(0);
});
