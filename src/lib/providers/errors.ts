/**
 * Domain-level errors every real provider adapter (flights/hotels) must
 * normalize its failures into — callers (server actions, future checkout
 * wiring) branch on `code`, never on a raw HTTP status or vendor error
 * shape. Keeps a specific vendor's quirks from leaking past its own
 * adapter directory.
 */
export type ProviderErrorCode =
  | "PROVIDER_UNAVAILABLE" // network/timeout/5xx/no credentials configured
  | "NO_AVAILABILITY" // request succeeded, nothing matched
  | "OFFER_EXPIRED" // offer/prebook no longer valid at the time of use
  | "PRICE_CHANGED" // revalidation/prebook returned a different price than expected
  | "CONDITIONS_CHANGED" // revalidation/prebook returned different cancellation/board/itinerary terms
  | "INVALID_PROVIDER_RESPONSE"; // 2xx but the payload doesn't match the expected shape

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly provider: string;

  constructor(code: ProviderErrorCode, provider: string, message: string) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
    this.provider = provider;
  }
}
