/**
 * Central place to read runtime configuration. Nothing else in the app
 * should read `process.env` directly — this keeps every environment
 * decision (demo vs production, payments gate, secrets) in one file.
 */

export type AppMode = "demo" | "production";

export function getAppMode(): AppMode {
  return process.env.APP_MODE === "production" ? "production" : "demo";
}

export function isDemoMode(): boolean {
  return getAppMode() === "demo";
}

/**
 * Second, explicit gate for real payments. Even in APP_MODE=production,
 * this must ALSO be "true" before a real payment provider is allowed to
 * charge anything. See src/lib/payments/index.ts.
 */
export function isPaymentsLiveEnabled(): boolean {
  return process.env.PAYMENTS_LIVE_ENABLED === "true";
}

export function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
}

export function getAdminPassword(): string {
  return process.env.ADMIN_PASSWORD || "";
}

export function getAdminSessionSecret(): string {
  return process.env.ADMIN_SESSION_SECRET || "demo-insecure-admin-secret-change-me";
}

export function getCronSecret(): string {
  return process.env.CRON_SECRET || "";
}

export const stripeConfig = {
  get secretKey() {
    return process.env.STRIPE_SECRET_KEY || "";
  },
  get publishableKey() {
    return process.env.STRIPE_PUBLISHABLE_KEY || "";
  },
  get webhookSecret() {
    return process.env.STRIPE_WEBHOOK_SECRET || "";
  },
  get isConfigured() {
    return Boolean(this.secretKey && this.publishableKey);
  },
};

export const paypalConfig = {
  get clientId() {
    return process.env.PAYPAL_CLIENT_ID || "";
  },
  get clientSecret() {
    return process.env.PAYPAL_CLIENT_SECRET || "";
  },
  get webhookId() {
    return process.env.PAYPAL_WEBHOOK_ID || "";
  },
  get isConfigured() {
    return Boolean(this.clientId && this.clientSecret);
  },
};

export const resendConfig = {
  get apiKey() {
    return process.env.RESEND_API_KEY || "";
  },
  get from() {
    return process.env.EMAIL_FROM || "Copa de Ferias <hola@copadeferias.com>";
  },
  get isConfigured() {
    return Boolean(this.apiKey);
  },
};

/**
 * Real flight-search API credentials — deliberately generic (no vendor
 * name baked into the app). Superseded by duffelConfig below now that a
 * specific vendor (Duffel TEST) is actually wired up; kept only so an
 * unset FLIGHT_API_KEY doesn't become a silent dead reference elsewhere.
 * See src/lib/providers/flights/realFlightProvider.ts.
 */
export const flightApiConfig = {
  get apiKey() {
    return process.env.FLIGHT_API_KEY || "";
  },
  get isConfigured() {
    return Boolean(this.apiKey);
  },
};

/**
 * Duffel (flights) — server-side only, TEST/sandbox for now. Never read
 * from client code; never logged. See
 * src/lib/providers/flights/duffel/client.ts.
 */
export const duffelConfig = {
  get accessToken() {
    return process.env.DUFFEL_ACCESS_TOKEN || "";
  },
  get isConfigured() {
    return Boolean(this.accessToken);
  },
  /** True when the token itself is Duffel's own test-mode prefix — a second, independent signal (not a substitute for live_mode on the actual API response) that we're not pointed at a live token. */
  get looksLikeTestToken() {
    return this.accessToken.startsWith("duffel_test_");
  },
};

/**
 * Nuitee / LiteAPI (hotels) — server-side only, sandbox for now. Never
 * read from client code; never logged. See
 * src/lib/providers/hotels/nuitee/client.ts.
 */
export const nuiteeConfig = {
  get apiKey() {
    return process.env.NUITEE_API_KEY || "";
  },
  get isConfigured() {
    return Boolean(this.apiKey);
  },
  /** True when the key itself has Nuitee's own sandbox prefix — a second, independent signal, not a substitute for a real API check. */
  get looksLikeSandboxKey() {
    return this.apiKey.startsWith("sand_");
  },
};

export type ProviderMode = "mock" | "real";

/**
 * Explicit opt-in to exercise the real Duffel/Nuitee sandbox adapters
 * outside APP_MODE=production (§14) — e.g. FLIGHT_PROVIDER=real while
 * developing locally against Duffel TEST. Defaults to "mock". Has no
 * effect in APP_MODE=production, where the existing triple-gate
 * (see src/lib/providers/flights/index.ts) is the only path to a real
 * provider, and no effect at all on hotels' getHotelProviders() — see
 * src/lib/providers/hotels/nuitee/index.ts for why hotels use a separate
 * accessor instead of this legacy factory.
 */
export function getFlightProviderMode(): ProviderMode {
  return process.env.FLIGHT_PROVIDER === "real" ? "real" : "mock";
}

export function getHotelProviderMode(): ProviderMode {
  return process.env.HOTEL_PROVIDER === "real" ? "real" : "mock";
}

/**
 * Hard gate for anything that can create a real (even if sandbox) booking
 * with a provider — a Duffel Order or a Nuitee rates/book. Requires an
 * explicit, separate opt-in on top of provider credentials being present;
 * never true in APP_MODE=production, so a misconfigured production
 * deployment can never place accidental provider bookings. Nothing in the
 * checkout/UI/server-action layer calls the functions this gates yet —
 * see src/lib/providers/flights/duffel/order.ts and
 * src/lib/providers/hotels/nuitee/book.ts.
 */
export function isSandboxProviderBookingAllowed(): boolean {
  return getAppMode() !== "production" && process.env.ALLOW_SANDBOX_PROVIDER_BOOKING === "true";
}

export const analyticsConfig = {
  get ga4Id() {
    return process.env.NEXT_PUBLIC_GA4_ID || "";
  },
  get metaPixelId() {
    return process.env.NEXT_PUBLIC_META_PIXEL_ID || "";
  },
  get tiktokPixelId() {
    return process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID || "";
  },
};
