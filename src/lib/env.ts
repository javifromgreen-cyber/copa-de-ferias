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
