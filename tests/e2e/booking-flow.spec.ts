import { test, expect } from "@playwright/test";

test("completes a full demo booking through the mandatory Review screen and lands on a clearly simulated confirmation", async ({ page }) => {
  await page.goto("/viajes/derbi-eterno-belgrado/reservar");

  // Step 1: número de viajeros (default 1) — just continue.
  await page.getByRole("button", { name: "Continuar" }).click();

  // Step 2: datos de cada viajero — Belgrado requires nationality + document
  // fields; the required fields must genuinely block progress (checkout §56.J).
  // exact: true — "Nombre *" is also a substring of the emergency-contact
  // field's label ("Contacto de emergencia — nombre *") on this same step.
  await page.getByLabel("Nombre *", { exact: true }).fill("Test");
  await page.getByLabel("Apellidos *").fill("E2E");
  await expect(page.getByRole("button", { name: "Continuar" })).toBeDisabled();
  await page.getByLabel(/Nacionalidad/).selectOption("España");
  await page.getByLabel(/Tipo de documento/).selectOption("dni");
  await page.getByLabel(/Número de documento/).fill("12345678A");
  await page.getByLabel(/Caducidad del documento/).fill("2030-01-01");
  await page.getByLabel(/País emisor/).fill("España");
  await expect(page.getByRole("button", { name: "Continuar" })).toBeEnabled();
  await page.getByRole("button", { name: "Continuar" }).click();

  // Step 3: habitaciones — a lone traveler must explicitly resolve their room
  // before continuing (no ambiguous default for a single traveler).
  await expect(page.getByRole("button", { name: "Continuar" })).toBeDisabled();

  // Going back must preserve everything already entered (checkout §56.H).
  await page.getByRole("button", { name: "Atrás" }).click();
  await expect(page.getByLabel("Nombre *", { exact: true })).toHaveValue("Test");
  await page.getByRole("button", { name: "Continuar" }).click();

  await page.getByRole("radio", { name: /Habitación individual/ }).check();
  await page.getByRole("button", { name: "Continuar" }).click();

  // Step 4: comprador — origin no longer asked here, it lives per traveler.
  await page.getByLabel("Nombre").fill("Test");
  await page.getByLabel("Apellidos").fill("Comprador");
  await page.getByLabel("Email").fill(`e2e-${Date.now()}@example.com`);
  await page.getByLabel("Teléfono").fill("600000000");
  await page.getByRole("button", { name: "Continuar", exact: true }).click();

  // Step 5: Revisión — mandatory before payment, must show travelers (with
  // their own origin), rooms, and the correct price breakdown.
  await expect(page.getByRole("heading", { name: "Revisar reserva" })).toBeVisible();
  await expect(page.getByText("Test E2E", { exact: true })).toBeVisible();
  await expect(page.getByText(/Salida: Barcelona/)).toBeVisible();
  await expect(page.getByText(/Test E2E: habitación individual/i)).toBeVisible();
  await expect(page.getByText("Habitación individual", { exact: true })).toBeVisible();
  await expect(page.getByText("639 €", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Continuar al pago" }).click();

  // Step 6: payment — demo notice must be visible, accept conditions, submit.
  await expect(page.getByText(/modo demo/i)).toBeVisible();
  await page.getByRole("checkbox", { name: /he leído y acepto/i }).check();
  await page.getByRole("button", { name: /simular pago/i }).click();

  await expect(page).toHaveURL(/\/confirmacion\/CDF-/);
  await expect(page.getByText(/simulación/i)).toBeVisible();
  // 549 (base) + 90 (single supplement) = 639.
  await expect(page.getByText("639 €", { exact: true })).toBeVisible();

  // A freshly completed booking must never land on Mi Viaje looking like
  // essential data is still missing (checkout §31/§32/§59) — that's a bug,
  // not a valid state, since everything required was already captured above.
  await page.getByRole("link", { name: /ir a mi viaje/i }).click();
  await expect(page.getByText(/reserva confirmada/i)).toBeVisible();
  await expect(page.getByText(/te faltan/i)).toHaveCount(0);
  await expect(page.getByText(/datos pendientes/i)).toHaveCount(0);
});

test("two travelers default to sharing a room together, no supplement", async ({ page }) => {
  await page.goto("/viajes/derbi-eterno-belgrado/reservar");

  await page.getByRole("button", { name: "Sumar viajero" }).click();
  await page.getByRole("button", { name: "Continuar" }).click();

  for (const [n, first, last, doc] of [
    ["1", "Ana", "Uno", "11111111A"],
    ["2", "Berto", "Dos", "22222222B"],
  ] as const) {
    const group = page.getByRole("group", { name: `Viajero ${n}` });
    await group.getByLabel("Nombre *", { exact: true }).fill(first);
    await group.getByLabel("Apellidos *").fill(last);
    await group.getByLabel(/Nacionalidad/).selectOption("España");
    await group.getByLabel(/Tipo de documento/).selectOption("dni");
    await group.getByLabel(/Número de documento/).fill(doc);
    await group.getByLabel(/Caducidad del documento/).fill("2030-01-01");
    await group.getByLabel(/País emisor/).fill("España");
  }
  await page.getByRole("button", { name: "Continuar" }).click();

  // Habitaciones: the two travelers are paired together by default — no
  // interaction needed, Continuar is already enabled (regression guard for
  // the 1→2 traveler resize bug).
  await expect(page.getByText("Habitación 1")).toBeVisible();
  await expect(page.locator("select").first()).toHaveValue("0");
  await expect(page.locator("select").nth(1)).toHaveValue("1");
  await expect(page.getByRole("button", { name: "Continuar" })).toBeEnabled();
});
