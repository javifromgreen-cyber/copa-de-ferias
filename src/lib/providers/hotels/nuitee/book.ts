import { nuiteeRequest } from "./client";
import { isSandboxProviderBookingAllowed, nuiteeConfig } from "@/lib/env";
import { ProviderError } from "@/lib/providers/errors";
import type { HotelBookingGuest, HotelBookingResult } from "./types";

type RawBookingResult = {
  bookingId: string;
  supplierBookingId?: string | null;
  hotelConfirmationCode?: string | null;
  status: string;
  paymentStatus?: string;
  price?: number;
  currency?: string;
  processingFee?: number | null;
};

/**
 * Generate + persist THIS before ever calling bookPrebook (§16 —
 * idempotency): if a BOOK call times out, retrying with the SAME
 * clientReference lets Nuitee recognize a duplicate instead of creating a
 * second real booking. This function only generates the value; the
 * caller is responsible for persisting it before the network call.
 */
export function generateClientReference(): string {
  return `cdf_${crypto.randomUUID()}`;
}

/**
 * NOT called from anywhere in checkout/server actions in this phase (§17:
 * no automatic hotel purchases from public checkout). Hard-gated behind
 * isSandboxProviderBookingAllowed() — never reachable in
 * APP_MODE=production — and hardcodes payment.method=ACC_CREDIT_CARD,
 * Nuitee's documented sandbox-only payment simulation (never a real card).
 * A single attempt only — never auto-retried (§16); the caller decides
 * whether re-calling with the same clientReference is safe.
 */
export async function bookPrebook(prebookId: string, clientReference: string, holder: { firstName: string; lastName: string; email: string }, guests: HotelBookingGuest[], fetchImpl?: typeof fetch): Promise<HotelBookingResult> {
  if (!isSandboxProviderBookingAllowed()) {
    throw new ProviderError("PROVIDER_UNAVAILABLE", "nuitee", "bookPrebook is disabled — set ALLOW_SANDBOX_PROVIDER_BOOKING=true outside APP_MODE=production to use it explicitly (e.g. for manual verification).");
  }
  if (!nuiteeConfig.looksLikeSandboxKey) {
    throw new ProviderError("PROVIDER_UNAVAILABLE", "nuitee", "bookPrebook refuses to run: NUITEE_API_KEY does not look like a sand_ sandbox key.");
  }

  const response = await nuiteeRequest<{ data: RawBookingResult }>(
    {
      method: "POST",
      host: "book",
      path: "/rates/book",
      body: {
        prebookId,
        clientReference,
        holder,
        payment: { method: "ACC_CREDIT_CARD" },
        guests: guests.map((g) => ({ occupancyNumber: g.occupancyNumber, firstName: g.firstName, lastName: g.lastName, email: g.email })),
      },
      timeoutMs: 20_000,
    },
    fetchImpl,
  );

  const raw = response.data;
  if (!raw?.bookingId || !raw?.status) {
    throw new ProviderError("INVALID_PROVIDER_RESPONSE", "nuitee", "Nuitee book response is missing required fields.");
  }
  return {
    bookingId: raw.bookingId,
    supplierBookingId: raw.supplierBookingId ?? null,
    hotelConfirmationCode: raw.hotelConfirmationCode ?? null,
    status: raw.status,
    paymentStatus: raw.paymentStatus ?? "",
    currency: raw.currency ?? "",
    totalPrice: raw.price ?? 0,
    processingFee: raw.processingFee ?? null,
  };
}
