import { describe, it, expect, beforeEach, vi } from "vitest";
import { track } from "@/lib/analytics/events";

describe("track", () => {
  beforeEach(() => {
    window.localStorage.clear();
    // @ts-expect-error test shim
    window.gtag = vi.fn();
  });

  it("does not call any pixel without marketing consent", () => {
    track("trip_view", { tripId: "trip_1" });
    // @ts-expect-error test shim
    expect(window.gtag).not.toHaveBeenCalled();
  });

  it("never forwards PII-shaped keys to the pixel, even with consent", () => {
    window.localStorage.setItem("cdf_cookie_consent_marketing", "true");
    track("booking_completed", {
      tripId: "trip_1",
      email: "ana@example.com",
      firstName: "Ana",
      phone: "600000000",
    });
    // @ts-expect-error test shim
    const [, , payload] = window.gtag.mock.calls[0];
    expect(payload).toEqual({ tripId: "trip_1" });
  });
});
