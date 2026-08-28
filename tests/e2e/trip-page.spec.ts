import { test, expect } from "@playwright/test";

test("published A_TU_AIRE trip (Ámsterdam) has a public ficha with a human title and price, never plazas or 'Viaje #'", async ({ page }) => {
  const response = await page.goto("/viajes/amsterdam-de-klassieker");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Ámsterdam" })).toBeVisible();
  await expect(page.getByText(/^Desde/).first()).toBeVisible();
  await expect(page.getByText(/plaza.*disponible/i)).toHaveCount(0);
  await expect(page.getByText(/^Viaje #/)).toHaveCount(0);
});

test("upcoming trip without a public page (Fútbol Inglés) 404s", async ({ page }) => {
  const response = await page.goto("/viajes/futbol-ingles");
  expect(response?.status()).toBe(404);
});

test("/viajes groups trips into Abiertos and Próximamente, and never lists Belgrado", async ({ page }) => {
  await page.goto("/viajes");
  await expect(page.getByRole("heading", { name: "Abiertos" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Próximamente" })).toBeVisible();
  await expect(page.getByText("Belgrado")).toHaveCount(0);
});

test("Belgrado is retired from every public listing, but its own ficha URL stays technically reachable for GROUP_CDF checkout coverage", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Belgrado")).toHaveCount(0);
  await page.goto("/viajes");
  await expect(page.getByText("Belgrado")).toHaveCount(0);

  // Direct URL still resolves — this is intentional (see queries.ts's
  // PUBLIC_LISTING_EXCLUDED_SLUGS comment): Belgrado is the only seeded
  // GROUP_CDF trip, so its checkout stays reachable by direct link only,
  // never surfaced through browsing.
  const response = await page.goto("/viajes/derbi-eterno-belgrado");
  expect(response?.status()).toBe(200);
});
