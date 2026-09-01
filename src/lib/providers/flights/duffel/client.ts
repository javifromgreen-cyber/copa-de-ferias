// Server-only by convention (same as src/lib/payments/*): this file must
// only ever be imported from server actions/route handlers, never from a
// client component — it holds the Duffel access token in memory.
import { duffelConfig } from "@/lib/env";
import { ProviderError, type ProviderErrorDetail } from "@/lib/providers/errors";

const BASE_URL = "https://api.duffel.com";
const DEFAULT_TIMEOUT_MS = 10_000;

export type DuffelRequest = {
  method: "GET" | "POST";
  path: string;
  query?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
};

/**
 * Duffel's own documented error envelope: `{ errors: [{ type, code,
 * title, message, ... }], meta: { request_id, ... } }`. Best-effort —
 * never assumed present (a proxy/CDN layer intercepting the request
 * before Duffel sees it won't produce this shape at all, which is
 * itself the signal captured by `responseNotConfirmedFromProvider`
 * below).
 */
async function parseDuffelErrorDetail(response: Response): Promise<ProviderErrorDetail> {
  const base: ProviderErrorDetail = {
    httpStatus: response.status,
    rateLimitLimit: response.headers.get("ratelimit-limit") ?? undefined,
    rateLimitRemaining: response.headers.get("ratelimit-remaining") ?? undefined,
    rateLimitReset: response.headers.get("ratelimit-reset") ?? undefined,
  };
  try {
    const json = (await response.clone().json()) as { errors?: { type?: string; code?: string }[]; meta?: { request_id?: string } };
    const first = Array.isArray(json.errors) ? json.errors[0] : undefined;
    if (!first && !json.meta?.request_id) return { ...base, responseNotConfirmedFromProvider: true };
    return { ...base, providerErrorType: first?.type, providerErrorCode: first?.code, requestId: json.meta?.request_id };
  } catch {
    return { ...base, responseNotConfirmedFromProvider: true };
  }
}

/**
 * Injectable so tests never touch the network — pass a stub `fetchImpl`
 * instead of relying on a global fetch mock. Every caller in this
 * directory goes through this one function so auth header, timeout, and
 * HTTP/network-error -> ProviderError mapping only exist in one place.
 *
 * Fase 2.6 (closure) §1 — 401/403/429 are no longer collapsed into one
 * generic "unauthorized/forbidden" PROVIDER_UNAVAILABLE. Duffel documents
 * these as three distinct conditions (rate limit, insufficient
 * permissions, authentication failure) and callers need to be able to
 * tell them apart — see errors.ts's own doc comment for why.
 */
export async function duffelRequest<T>(req: DuffelRequest, fetchImpl: typeof fetch = fetch): Promise<T> {
  if (!duffelConfig.isConfigured) {
    throw new ProviderError("PROVIDER_UNAVAILABLE", "duffel", "DUFFEL_ACCESS_TOKEN is not configured.");
  }

  const url = new URL(req.path, BASE_URL);
  for (const [key, value] of Object.entries(req.query ?? {})) url.searchParams.set(key, value);

  let response: Response;
  try {
    response = await fetchImpl(url.toString(), {
      method: req.method,
      headers: {
        Authorization: `Bearer ${duffelConfig.accessToken}`,
        "Duffel-Version": "v2",
        Accept: "application/json",
        ...(req.body ? { "Content-Type": "application/json" } : {}),
      },
      body: req.body ? JSON.stringify(req.body) : undefined,
      signal: AbortSignal.timeout(req.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
  } catch (err) {
    // No HTTP response ever arrived — DNS/connect/timeout/proxy failure,
    // never a provider-issued error, so never PROVIDER_UNAVAILABLE.
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    throw new ProviderError("NETWORK_ERROR", "duffel", timedOut ? "Duffel request timed out before any response was received." : `Duffel request failed before any response was received: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (response.status === 404) {
    throw new ProviderError("NO_AVAILABILITY", "duffel", "Duffel returned 404 for this request.");
  }
  if (response.status === 429) {
    const detail = await parseDuffelErrorDetail(response);
    throw new ProviderError("RATE_LIMITED", "duffel", "Duffel rate limit exceeded (429).", detail);
  }
  if (response.status === 401) {
    const detail = await parseDuffelErrorDetail(response);
    throw new ProviderError("AUTHENTICATION_FAILED", "duffel", "Duffel rejected the request as unauthenticated (401) — check DUFFEL_ACCESS_TOKEN.", detail);
  }
  if (response.status === 403) {
    const detail = await parseDuffelErrorDetail(response);
    throw new ProviderError("PERMISSION_DENIED", "duffel", "Duffel rejected the request as forbidden (403) — the token is valid but lacks permission for this request.", detail);
  }
  if (response.status >= 500) {
    throw new ProviderError("PROVIDER_UNAVAILABLE", "duffel", `Duffel returned ${response.status}.`, { httpStatus: response.status });
  }
  if (!response.ok) {
    throw new ProviderError("INVALID_PROVIDER_RESPONSE", "duffel", `Duffel returned ${response.status}.`, { httpStatus: response.status });
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new ProviderError("INVALID_PROVIDER_RESPONSE", "duffel", "Duffel response was not valid JSON.");
  }
  return json as T;
}
