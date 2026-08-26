export type AnalyticsEventName =
  | "home_view"
  | "trip_card_view"
  | "trip_view"
  | "notify_open"
  | "notify_submit"
  | "waitlist_submit"
  | "booking_start"
  | "checkout_view"
  | "payment_method_selected"
  | "booking_completed"
  | "booking_failed"
  | "my_trip_view"
  | "traveler_data_completed"
  | "whatsapp_clicked"
  | "review_clicked";

export type AnalyticsEventPayload = Record<string, string | number | boolean | undefined>;

const PII_KEYS = ["email", "name", "firstname", "lastname", "phone", "address", "dni", "passport"];

function stripPii(payload: AnalyticsEventPayload): AnalyticsEventPayload {
  const clean: AnalyticsEventPayload = {};
  for (const [key, value] of Object.entries(payload)) {
    if (PII_KEYS.some((pii) => key.toLowerCase().includes(pii))) continue;
    clean[key] = value;
  }
  return clean;
}

function hasMarketingConsent(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem("cdf_cookie_consent_marketing") === "true";
  } catch {
    return false;
  }
}

/**
 * Fires an analytics event to whichever pixels are configured, but only
 * after marketing consent, and never with PII in the payload. Safe to call
 * even when no pixel IDs are configured (no-op).
 */
export function track(event: AnalyticsEventName, payload: AnalyticsEventPayload = {}) {
  if (typeof window === "undefined") return;
  const clean = stripPii(payload);

  if (process.env.NODE_ENV !== "production") console.debug("[analytics]", event, clean);

  if (!hasMarketingConsent()) return;

  const w = window as unknown as {
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
    ttq?: { track?: (...args: unknown[]) => void };
  };

  w.gtag?.("event", event, clean);
  w.fbq?.("trackCustom", event, clean);
  w.ttq?.track?.(event, clean);
}
