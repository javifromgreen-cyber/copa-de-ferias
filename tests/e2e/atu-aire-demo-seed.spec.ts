import { test, expect } from "@playwright/test";

/**
 * Verifies the three A_TU_AIRE demo products (§5 of the CMS block) exist
 * and are coherent from the real Admin UI — not three clones with a
 * different team, but genuinely different scenarios: ticket-only,
 * ticket+hotel, and a two-match ticket+hotel+flight product with one
 * PROVISIONAL event. Read-only: never mutates seed data.
 */
test.describe("A_TU_AIRE demo seed coherence", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/admin/login");
    await page.getByLabel("Contraseña").fill("cambia-esta-clave");
    await page.getByRole("button", { name: "Entrar" }).click();
    await page.waitForURL(/\/admin$/);
  });

  test("known competitions are seeded, including Champions League and Copa Libertadores", async ({ page }) => {
    await page.goto("/admin/competiciones");
    for (const name of ["Premier League", "LaLiga", "Serie A", "Eredivisie", "Champions League", "Liga Profesional", "Copa Libertadores"]) {
      await expect(page.getByRole("link", { name })).toBeVisible();
    }
  });

  test("Demo A (Ámsterdam) is ticket-only with two differently priced offers", async ({ page }) => {
    await page.goto("/admin/eventos");
    await expect(page.getByRole("link", { name: /Ajax vs Feyenoord/ })).toBeVisible();
    await page.getByRole("link", { name: /Ajax vs Feyenoord/ }).click();
    // The region/type line is read-only text derived from the selected
    // competition — asserting on it (rather than the <select>'s closed
    // <option> text, which Playwright treats as not visible) confirms
    // Eredivisie was actually pre-selected.
    await expect(page.getByText("Europa · Liga nacional · Netherlands")).toBeVisible();
    await expect(page.getByText("General")).toBeVisible();
    await expect(page.getByText("Tribuna preferente")).toBeVisible();
  });

  test("Demo B (Milán) — Admin no longer configures per-product modalities; it always supports all three (§1/§5)", async ({ page }) => {
    await page.goto("/admin/viajes");
    await page.getByRole("link", { name: /Milán/i }).click();
    await page.getByText("Producto A TU AIRE", { exact: true }).click();
    await expect(page.getByText(/siempre las tres modalidades/i)).toBeVisible();
    await expect(page.getByLabel("Solo entrada", { exact: true })).toHaveCount(0);
  });

  test("Demo C (Londres) has two Events, one confirmed and one time_provisional (day known, hour pending)", async ({ page }) => {
    await page.goto("/admin/eventos");
    const confirmedRow = page.getByRole("row", { name: /Arsenal vs Tottenham/ });
    const provisionalRow = page.getByRole("row", { name: /Chelsea vs Arsenal/ });
    await expect(confirmedRow).toBeVisible();
    await expect(provisionalRow).toBeVisible();
    await expect(confirmedRow.getByText("Confirmado")).toBeVisible();
    await expect(provisionalRow.getByText("Hora provisional")).toBeVisible();

    await page.goto("/admin/viajes");
    await page.getByRole("link", { name: /Londres/i }).click();
    await expect(page.getByText("Arsenal vs Tottenham")).toBeVisible();
    await expect(page.getByText("Chelsea vs Arsenal")).toBeVisible();
  });
});
