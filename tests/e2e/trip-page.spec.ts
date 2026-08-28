import { test, expect } from "@playwright/test";

test("published A_TU_AIRE trip (Ámsterdam) has a match-first ficha with a real matchup title and price, never plazas or 'Viaje #'", async ({ page }) => {
  const response = await page.goto("/viajes/amsterdam-de-klassieker");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: /Ajax.*Feyenoord/i }).first()).toBeVisible();
  await expect(page.getByText(/^Desde/).first()).toBeVisible();
  await expect(page.getByText(/plaza.*disponible/i)).toHaveCount(0);
  await expect(page.getByText(/^Viaje #/)).toHaveCount(0);
  await expect(page.getByText("Grupos CDF")).toHaveCount(0);
});

test("A_TU_AIRE ficha shows the commercial panel checklist, gallery and dynamic FAQ", async ({ page }) => {
  await page.goto("/viajes/amsterdam-de-klassieker");
  // The commercial panel renders twice in the DOM (mobile inline + desktop
  // sidebar), only one visible via CSS at a time — always scope to .first().
  await expect(page.getByText("Puedes reservar").first()).toBeVisible();
  await expect(page.getByText("Entrada + Hotel + Vuelo").first()).toBeVisible();
  await expect(page.getByRole("link", { name: /configurar mi viaje/i }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Preguntas sobre este partido" })).toBeVisible();

  // Gallery: clicking "Ver todas las fotos" opens an accessible lightbox.
  await page.getByRole("button", { name: "Ver todas las fotos del partido" }).click();
  const dialog = page.getByRole("dialog", { name: /galería de fotos/i });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: /cerrar galería/i }).click();
  await expect(dialog).toHaveCount(0);
});

test("GROUP_CDF ficha (Belgrado) keeps its own simple price panel, not the A_TU_AIRE checklist", async ({ page }) => {
  await page.goto("/viajes/derbi-eterno-belgrado");
  await expect(page.getByText("Puedes reservar")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /reservar plaza/i }).first()).toBeVisible();
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
