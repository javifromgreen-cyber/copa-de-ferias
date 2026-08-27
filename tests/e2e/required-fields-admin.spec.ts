import { test, expect } from "@playwright/test";

/**
 * Verifies checkout §2/§3/§4: fields Admin marks as required for a trip
 * (including the emergency contact pair) block checkout before payment,
 * and a trip configured to need a shipping address enforces that too —
 * all through the real Admin UI and the real checkout flow, not a stub.
 * Reverts the trip config at the end so it doesn't affect other tests or
 * leave the demo trip in a non-default state.
 */
test("admin-configured emergency contact and shipping address are required before payment", async ({ page }) => {
  await page.goto("/admin/login");
  await page.getByLabel("Contraseña").fill("cambia-esta-clave");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/admin$/);

  await page.goto("/admin/viajes");
  await page.getByRole("link", { name: /Belgrado/i }).click();
  await page.waitForLoadState("networkidle");

  await page.getByText("Datos de viajero requeridos en checkout").click();
  await page.getByLabel("Contacto de emergencia").check();
  await page.getByLabel(/Requiere dirección de envío del comprador/).check();
  await page.getByRole("button", { name: "Guardar viaje" }).click();
  await page.waitForURL(/\/admin\/viajes\//);

  try {
    await page.goto("/viajes/derbi-eterno-belgrado/reservar");
    await page.getByRole("button", { name: "Continuar" }).click();

    // Datos de cada viajero: fill everything except the emergency contact.
    await page.getByLabel("Nombre *", { exact: true }).fill("Ana");
    await page.getByLabel("Apellidos *").fill("Emergencia");
    await page.getByLabel(/Nacionalidad/).fill("Española");
    await page.getByLabel(/Tipo de documento/).selectOption("dni");
    await page.getByLabel(/Número de documento/).fill("55555555Z");
    await page.getByLabel(/Caducidad del documento/).fill("2030-01-01");
    await page.getByLabel(/País emisor/).fill("España");
    await expect(page.getByRole("button", { name: "Continuar" })).toBeDisabled();

    await page.getByLabel(/Contacto de emergencia — nombre/).fill("Pedro Emergencia");
    await expect(page.getByRole("button", { name: "Continuar" })).toBeDisabled();
    await page.getByLabel(/Contacto de emergencia — teléfono/).fill("600555555");
    await expect(page.getByRole("button", { name: "Continuar" })).toBeEnabled();
    await page.getByRole("button", { name: "Continuar" }).click();

    await page.getByLabel(/Habitación individual/).check();
    await page.getByRole("button", { name: "Continuar" }).click();

    // Comprador: shipping address is required for this trip now.
    await page.getByLabel("Nombre").fill("Ana");
    await page.getByLabel("Apellidos").fill("Emergencia");
    await page.getByLabel("Email").fill(`e2e-shipping-${Date.now()}@example.com`);
    await page.getByLabel("Teléfono").fill("600555555");
    await expect(page.getByRole("button", { name: "Continuar", exact: true })).toBeDisabled();
    await page.getByLabel(/Dirección de envío/).fill("Calle Falsa 123, Madrid");
    await expect(page.getByRole("button", { name: "Continuar", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Continuar", exact: true }).click();

    await expect(page.getByRole("heading", { name: "Revisar reserva" })).toBeVisible();
    await page.getByRole("button", { name: "Continuar al pago" }).click();
    await page.getByRole("checkbox", { name: /he leído y acepto/i }).check();
    await page.getByRole("button", { name: /simular pago/i }).click();
    await expect(page).toHaveURL(/\/confirmacion\/CDF-/);
  } finally {
    // Revert Belgrado to its default checkout config so other tests (and
    // the demo) aren't left with an unexpected required-fields state.
    await page.goto("/admin/viajes");
    await page.getByRole("link", { name: /Belgrado/i }).click();
    await page.waitForLoadState("networkidle");
    await page.getByText("Datos de viajero requeridos en checkout").click();
    await page.getByLabel("Contacto de emergencia").uncheck();
    await page.getByLabel(/Requiere dirección de envío del comprador/).uncheck();
    await page.getByRole("button", { name: "Guardar viaje" }).click();
    await page.waitForURL(/\/admin\/viajes\//);
  }
});
