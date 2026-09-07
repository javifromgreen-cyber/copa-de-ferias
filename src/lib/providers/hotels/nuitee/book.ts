import { nuiteeRequest } from "./client";
import { isSandboxProviderBookingAllowed, nuiteeConfig } from "@/lib/env";
import { ProviderError } from "@/lib/providers/errors";
import type { HotelBookingGuest, HotelBookingResult, HotelCancelResult } from "./types";

function toHotelBookingResult(raw: RawBookingResult): HotelBookingResult {
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

/**
 * §7 — deliberately does NOT model `bookedRooms[]` at all. Real sandbox
 * BOOK responses have returned bookedRooms with occupancy_number stuck at
 * 1 for every room and a repeated first-room guest, even though the
 * booking's own top-level `adults`/room-count were correct — so this type
 * only reads the top-level fields, never anything per-room from BOOK.
 * Rooming comes exclusively from roomingSnapshot.ts, built from Copa de
 * Ferias' own RoomAssignment[] before BOOK is ever called. Also note
 * retailRate.total inside bookedRooms (if it were read) is an OBJECT
 * ({amount, currency}) here — a different shape than the array form
 * SEARCH/PREBOOK use (see normalize.ts's extractAmountFromArray) — one
 * more reason this file never reuses that parser.
 */
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
    throw new ProviderError("PROVIDER_UNAVAILABLE", "nuitee", "bookPrebook refuses to run: NUITEE_API_KEY does not look like a sand_/sandbox_ sandbox key.");
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
  return toHotelBookingResult(raw);
}

/**
 * Fase 3B.2 §6/§8 — a fresh, authoritative read of one Nuitee booking by
 * its OWN bookingId, used to reconcile after a BOOK call whose HTTP
 * response was lost (timeout/network error) but which returned a
 * bookingId in some earlier, now-uncertain attempt — or simply to
 * re-verify a previously-confirmed booking before trusting it.
 *
 * UNVERIFIED ENDPOINT — this codebase has never been able to reach the
 * real Nuitee/LiteAPI sandbox from this environment (network egress is
 * blocked here), so `GET /bookings/{bookingId}` is this file's best-effort
 * reading of LiteAPI's documented booking-retrieval contract, not a
 * captured real response like bookPrebook's own shape. If the real path
 * or shape differs, the only consequence is that this call throws
 * INVALID_PROVIDER_RESPONSE/NETWORK_ERROR — every caller in this codebase
 * already treats that as "cannot confirm" and falls back to
 * RECOVERY_REQUIRED rather than guessing, so a wrong endpoint here can
 * never cause a double booking or a silent charge — see the final report
 * for the explicit recommendation to verify this against LiteAPI's real
 * docs or a controlled manual call before relying on it in production.
 */
function assertSandboxBookingAllowed(): void {
  if (!isSandboxProviderBookingAllowed()) {
    throw new ProviderError("PROVIDER_UNAVAILABLE", "nuitee", "Nuitee BOOK-lifecycle calls are disabled — set ALLOW_SANDBOX_PROVIDER_BOOKING=true outside APP_MODE=production.");
  }
  if (!nuiteeConfig.looksLikeSandboxKey) {
    throw new ProviderError("PROVIDER_UNAVAILABLE", "nuitee", "Nuitee BOOK-lifecycle calls refuse to run: NUITEE_API_KEY does not look like a sand_/sandbox_ sandbox key.");
  }
}

export async function getHotelBooking(bookingId: string, fetchImpl?: typeof fetch): Promise<HotelBookingResult> {
  assertSandboxBookingAllowed();
  const response = await nuiteeRequest<{ data: RawBookingResult }>({ method: "GET", host: "book", path: `/bookings/${encodeURIComponent(bookingId)}`, timeoutMs: 12_000 }, fetchImpl);
  const raw = response.data;
  if (!raw?.bookingId || !raw?.status) {
    throw new ProviderError("INVALID_PROVIDER_RESPONSE", "nuitee", "Nuitee booking-lookup response is missing required fields.");
  }
  return toHotelBookingResult(raw);
}

/**
 * Fase 3B.2 §7/§8 — looks up a booking by OUR OWN clientReference (never
 * Nuitee's bookingId, which we may not have yet) — the recovery path for a
 * BOOK call whose response never arrived at all, and for reconciling
 * Nuitee's error 4005 ("duplicate clientReference"). Returns every match
 * (normally 0 or 1) rather than picking one itself — per §8 "si existe
 * EXACTAMENTE una reserva CONFIRMED", the caller (hotelFulfillment.ts)
 * decides what 0/1/>1 results each mean, this function never guesses.
 *
 * Same UNVERIFIED ENDPOINT caveat as getHotelBooking above — best-effort
 * `GET /bookings?clientReference=...`, never confirmed against a real
 * response from this sandbox.
 */
export async function findHotelBookingByClientReference(clientReference: string, fetchImpl?: typeof fetch): Promise<HotelBookingResult[]> {
  assertSandboxBookingAllowed();
  const response = await nuiteeRequest<{ data: RawBookingResult[] }>({ method: "GET", host: "book", path: `/bookings?clientReference=${encodeURIComponent(clientReference)}`, timeoutMs: 12_000 }, fetchImpl);
  const raw = Array.isArray(response.data) ? response.data : [];
  return raw.filter((r): r is RawBookingResult => Boolean(r?.bookingId && r?.status)).map(toHotelBookingResult);
}

/**
 * Fase 3B.2 §15 — cancels a confirmed Nuitee booking (compensation: Stripe
 * capture failed definitively AFTER the hotel was already booked). Nuitee
 * is documented to answer either `CANCELLED` (no charges) or
 * `CANCELLED_WITH_CHARGES` — this function reports both distinctly and
 * NEVER collapses them; hotelFulfillment.ts is the one place that decides
 * what each means for the CheckoutAttempt (§15: clean cancel only for
 * CANCELLED with a confirmed-zero cost, RECOVERY_REQUIRED otherwise).
 *
 * Same UNVERIFIED ENDPOINT caveat as getHotelBooking/findHotelBookingByClientReference
 * above — best-effort `POST /bookings/{bookingId}/cancel`. A thrown error
 * here is always treated as "cancellation outcome unknown" by the caller,
 * never as "cancelled" — see §15 "Si cancel endpoint devuelve 204/sin
 * detalle: GET booking después y confirmar estado", which
 * hotelFulfillment.ts implements by following this call with a
 * getHotelBooking() re-check rather than trusting this response alone.
 */
export async function cancelHotelBooking(bookingId: string, fetchImpl?: typeof fetch): Promise<HotelCancelResult> {
  assertSandboxBookingAllowed();
  const response = await nuiteeRequest<{ data: { bookingId: string; status: string; charges?: number | null; currency?: string | null } }>(
    { method: "POST", host: "book", path: `/bookings/${encodeURIComponent(bookingId)}/cancel`, timeoutMs: 15_000 },
    fetchImpl,
  );
  const raw = response.data;
  if (!raw?.bookingId || !raw?.status) {
    throw new ProviderError("INVALID_PROVIDER_RESPONSE", "nuitee", "Nuitee cancel-booking response is missing required fields.");
  }
  return { bookingId: raw.bookingId, status: raw.status, charges: raw.charges ?? null, currency: raw.currency ?? null };
}
