import { nuiteeRequest } from "./client";
import { isSandboxProviderBookingAllowed, nuiteeConfig } from "@/lib/env";
import { ProviderError } from "@/lib/providers/errors";
import type { HotelBookingGuest, HotelBookingResult, HotelCancelOutcome } from "./types";

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
 * `GET /bookings/{bookingId}` — verified by the user against LiteAPI's
 * current official docs (this sandbox has no network access to confirm
 * it directly). The exact response body shape beyond {bookingId, status}
 * is still this file's best-effort reading; any mismatch there still only
 * ever throws INVALID_PROVIDER_RESPONSE, which every caller treats as
 * "cannot confirm" and falls back to RECOVERY_REQUIRED — never a double
 * booking or a silent charge.
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
 * `GET /bookings?clientReference=...` — same as getHotelBooking above,
 * verified by the user against LiteAPI's current official docs.
 */
export async function findHotelBookingByClientReference(clientReference: string, fetchImpl?: typeof fetch): Promise<HotelBookingResult[]> {
  assertSandboxBookingAllowed();
  const response = await nuiteeRequest<{ data: RawBookingResult[] }>({ method: "GET", host: "book", path: `/bookings?clientReference=${encodeURIComponent(clientReference)}`, timeoutMs: 12_000 }, fetchImpl);
  const raw = Array.isArray(response.data) ? response.data : [];
  return raw.filter((r): r is RawBookingResult => Boolean(r?.bookingId && r?.status)).map(toHotelBookingResult);
}

/**
 * Fase 3B.2 §15, corrected against LiteAPI's verified official docs —
 * cancels a confirmed Nuitee booking via `PUT /bookings/{bookingId}` (NOT
 * a `/cancel` sub-path — that endpoint never existed on the real API).
 * Nuitee answers either `CANCELLED` (no charges) or
 * `CANCELLED_WITH_CHARGES` — reported distinctly, never collapsed.
 *
 * This function owns its OWN reconciliation end-to-end — it never returns
 * a "maybe cancelled" guess to its caller:
 *  - the PUT itself can answer 204/empty body (a real, documented
 *    possibility, not an error) — never treated as compensated on its
 *    own; a follow-up GET decides the real status first.
 *  - a PUT that throws (network/timeout, or any other provider error) is
 *    likewise never assumed to mean anything — the same GET follow-up
 *    decides it.
 *  - if that GET ALSO can't produce a real, nameable status (throws, or
 *    returns something other than the two known cancel statuses), the
 *    outcome is "unknown" — the caller (hotelFulfillment.ts) must treat
 *    that as RECOVERY_REQUIRED, never as compensated.
 *
 * The exact response body shape beyond {bookingId, status, charges?} is
 * still this file's best-effort reading (method + path are the part the
 * user verified); a shape mismatch only ever produces "unknown" here, per
 * the same fail-safe convention as every other BOOK-lifecycle call.
 */
async function fetchCurrentCancelStatus(bookingId: string, fetchImpl?: typeof fetch): Promise<HotelCancelOutcome> {
  let fresh: HotelBookingResult;
  try {
    fresh = await getHotelBooking(bookingId, fetchImpl);
  } catch {
    return { outcome: "unknown", reason: "cancel_unverifiable_get_unreachable" };
  }
  const status = fresh.status.trim().toUpperCase();
  if (status === "CANCELLED" || status === "CANCELLED_WITH_CHARGES") {
    // A GET response has no dedicated charges field of its own — the
    // status string itself is the only charge signal Nuitee's vocabulary
    // gives us here; `charges: null` for the WITH_CHARGES case is not
    // "confirmed zero", it is "unknown amount", and isCleanCancel()
    // callers must never read null as zero.
    return { outcome: "resolved", result: { bookingId, status: fresh.status, charges: null, currency: fresh.currency || null } };
  }
  return { outcome: "unknown", reason: `cancel_unverifiable_get_status:${fresh.status}` };
}

export async function cancelHotelBooking(bookingId: string, fetchImpl?: typeof fetch): Promise<HotelCancelOutcome> {
  assertSandboxBookingAllowed();

  let response: { data: { bookingId: string; status: string; charges?: number | null; currency?: string | null } } | null;
  try {
    response = await nuiteeRequest<{ data: { bookingId: string; status: string; charges?: number | null; currency?: string | null } } | null>(
      { method: "PUT", host: "book", path: `/bookings/${encodeURIComponent(bookingId)}`, timeoutMs: 15_000, allowEmptyResponse: true },
      fetchImpl,
    );
  } catch {
    // PUT itself failed (network/timeout/any provider error) — never
    // assumed to mean cancelled OR not-cancelled; reconcile via GET.
    return fetchCurrentCancelStatus(bookingId, fetchImpl);
  }

  const raw = response?.data;
  if (!raw?.bookingId || !raw?.status) {
    // 204/empty body, or a body missing the fields we need — same rule:
    // never assume compensation, confirm the real state via GET.
    return fetchCurrentCancelStatus(bookingId, fetchImpl);
  }
  return { outcome: "resolved", result: { bookingId: raw.bookingId, status: raw.status, charges: raw.charges ?? null, currency: raw.currency ?? null } };
}
