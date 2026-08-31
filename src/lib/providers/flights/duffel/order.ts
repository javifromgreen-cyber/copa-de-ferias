import { duffelRequest } from "./client";
import { normalizeSegment, type RawSegment } from "./normalize";
import { duffelConfig, isSandboxProviderBookingAllowed } from "@/lib/env";
import { ProviderError } from "@/lib/providers/errors";
import type { FlightOrderPassenger, FlightOrderResult } from "./types";

/**
 * NOT called from anywhere in checkout/server actions in this phase (§17:
 * no automatic flight purchases from public checkout). Exists so the
 * architecture supports it later, hard-gated behind
 * isSandboxProviderBookingAllowed() — never reachable in
 * APP_MODE=production, and refuses outright if the configured token
 * doesn't look like a Duffel test token, as a second line of defense
 * against ever placing a real order from this path.
 */
export async function createSandboxOrder(offerId: string, totalAmount: string, currency: string, passengers: FlightOrderPassenger[], fetchImpl?: typeof fetch): Promise<FlightOrderResult> {
  if (!isSandboxProviderBookingAllowed()) {
    throw new ProviderError("PROVIDER_UNAVAILABLE", "duffel", "createSandboxOrder is disabled — set ALLOW_SANDBOX_PROVIDER_BOOKING=true outside APP_MODE=production to use it explicitly (e.g. for manual verification).");
  }
  if (!duffelConfig.looksLikeTestToken) {
    throw new ProviderError("PROVIDER_UNAVAILABLE", "duffel", "createSandboxOrder refuses to run: DUFFEL_ACCESS_TOKEN does not look like a duffel_test_ token.");
  }

  const response = await duffelRequest<{ data: unknown }>(
    {
      method: "POST",
      path: "/air/orders",
      body: {
        data: {
          type: "instant",
          selected_offers: [offerId],
          payments: [{ type: "balance", currency, amount: totalAmount }],
          passengers: passengers.map((p) => ({
            id: p.id,
            title: p.title,
            gender: p.gender,
            given_name: p.givenName,
            family_name: p.familyName,
            born_on: p.bornOn,
            email: p.email,
            phone_number: p.phoneNumber,
          })),
        },
      },
      timeoutMs: 20_000,
    },
    fetchImpl,
  );

  const raw = response.data as {
    id?: string;
    live_mode?: boolean;
    booking_reference?: string;
    total_amount?: string;
    total_currency?: string;
    slices?: { segments: RawSegment[] }[];
  };
  if (!raw?.id || !raw.booking_reference || !raw.total_amount || !raw.total_currency || !Array.isArray(raw.slices)) {
    throw new ProviderError("INVALID_PROVIDER_RESPONSE", "duffel", "Duffel order response is missing required fields.");
  }
  return {
    orderId: raw.id,
    liveMode: raw.live_mode ?? false,
    bookingReference: raw.booking_reference,
    totalAmount: Number(raw.total_amount),
    currency: raw.total_currency,
    segments: raw.slices.flatMap((s) => s.segments.map(normalizeSegment)),
  };
}
