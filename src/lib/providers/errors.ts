/**
 * Domain-level errors every real provider adapter (flights/hotels) must
 * normalize its failures into — callers (server actions, future checkout
 * wiring) branch on `code`, never on a raw HTTP status or vendor error
 * shape. Keeps a specific vendor's quirks from leaking past its own
 * adapter directory.
 *
 * Fase 2.6 (closure) — a 403 is NOT a rate limit and must never be
 * reported as one: Duffel documents 429 + `rate_limit_exceeded` for rate
 * limiting and a distinct 403 (`insufficient_permissions`-style errors)
 * for "the token is valid but not allowed to do this". Nuitee documents
 * the same 429-vs-403 split. Collapsing every non-2xx into
 * PROVIDER_UNAVAILABLE (the previous behavior) made it impossible to
 * tell "we're being throttled" from "this credential lacks a scope"
 * from "the request never reached the provider at all" — three
 * different problems needing three different fixes. See client.ts in
 * each provider directory for exactly how these are derived.
 */
export type ProviderErrorCode =
  | "PROVIDER_UNAVAILABLE" // credentials not configured, or the provider itself responded 5xx
  | "RATE_LIMITED" // HTTP 429 (optionally confirmed by a rate_limit_exceeded-style body)
  | "PERMISSION_DENIED" // HTTP 403 — a valid-looking request the credential isn't allowed to make
  | "AUTHENTICATION_FAILED" // HTTP 401 — missing/invalid/expired credential
  | "NETWORK_ERROR" // the request never got ANY HTTP response (DNS/connect/timeout/proxy failure)
  | "NO_AVAILABILITY" // request succeeded, nothing matched
  | "OFFER_EXPIRED" // offer/prebook no longer valid at the time of use
  | "PRICE_CHANGED" // revalidation/prebook returned a different price than expected
  | "CONDITIONS_CHANGED" // revalidation/prebook returned different cancellation/board/itinerary terms
  | "INVALID_PROVIDER_RESPONSE"; // 2xx but the payload doesn't match the expected shape

/**
 * Sanitized diagnostic detail attached to a ProviderError — every field
 * here is safe to log/persist as-is (never the API key/token itself).
 * All optional: not every failure path has all of these available (e.g.
 * a NETWORK_ERROR has no httpStatus at all, because no response ever
 * arrived).
 */
export type ProviderErrorDetail = {
  httpStatus?: number;
  /** The provider's own error taxonomy value from the response body, e.g. Duffel's `errors[0].type` ("rate_limit_exceeded", "insufficient_permissions", ...). */
  providerErrorType?: string;
  /** The provider's own error code from the response body, when distinct from `type`. */
  providerErrorCode?: string;
  requestId?: string;
  rateLimitLimit?: string;
  rateLimitRemaining?: string;
  rateLimitReset?: string;
  /**
   * Set when the response body couldn't be parsed as the provider's own
   * JSON error shape — a real signal that the response may not have come
   * from the provider at all (e.g. a proxy/CDN/CONNECT-layer rejection
   * intercepted before reaching it), not a confirmed provider error.
   * Never asserted as fact — only that we can't confirm it came from the
   * provider.
   */
  responseNotConfirmedFromProvider?: boolean;
};

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly provider: string;
  readonly detail: ProviderErrorDetail;

  constructor(code: ProviderErrorCode, provider: string, message: string, detail: ProviderErrorDetail = {}) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
    this.provider = provider;
    this.detail = detail;
  }
}
