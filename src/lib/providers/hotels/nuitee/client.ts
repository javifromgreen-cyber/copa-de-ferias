// Server-only by convention (same as src/lib/payments/*): this file must
// only ever be imported from server actions/route handlers, never from a
// client component — it holds the Nuitee API key in memory.
import { nuiteeConfig } from "@/lib/env";
import { ProviderError, type ProviderErrorDetail } from "@/lib/providers/errors";

// Nuitee/LiteAPI splits search and book/prebook across two hosts — see
// the manual PoC in this session's history (search validated against
// api.liteapi.travel, prebook/book against book.liteapi.travel).
const SEARCH_BASE_URL = "https://api.liteapi.travel/v3.0";
const BOOK_BASE_URL = "https://book.liteapi.travel/v3.0";
const DEFAULT_TIMEOUT_MS = 10_000;

export type NuiteeRequest = {
  method: "GET" | "POST";
  host: "search" | "book";
  path: string;
  body?: unknown;
  timeoutMs?: number;
};

/**
 * Nuitee/LiteAPI's error envelope isn't as uniformly documented as
 * Duffel's — this is deliberately best-effort and defensive. What
 * matters for Fase 2.6 (closure) §2 is `responseNotConfirmedFromProvider`:
 * when a 401/403/429 response body doesn't parse as JSON at all (an HTML
 * error page, an empty body, etc.), that's a real signal the response
 * may never have reached Nuitee itself — e.g. a proxy/CDN layer sitting
 * in front of api.liteapi.travel rejecting the request first. This never
 * asserts which one happened; it only records that we can't confirm the
 * response came from the provider, so a human/log reader isn't misled
 * into blaming NUITEE_API_KEY for what might be a network/proxy issue.
 */
async function parseNuiteeErrorDetail(response: Response): Promise<ProviderErrorDetail> {
  const base: ProviderErrorDetail = {
    httpStatus: response.status,
    rateLimitLimit: response.headers.get("ratelimit-limit") ?? response.headers.get("x-ratelimit-limit") ?? undefined,
    rateLimitRemaining: response.headers.get("ratelimit-remaining") ?? response.headers.get("x-ratelimit-remaining") ?? undefined,
    rateLimitReset: response.headers.get("ratelimit-reset") ?? response.headers.get("x-ratelimit-reset") ?? undefined,
  };
  try {
    const json = (await response.clone().json()) as { error?: { type?: string; code?: string; message?: string } | string; message?: string; status?: string };
    if (json == null || (typeof json === "object" && Object.keys(json).length === 0)) {
      return { ...base, responseNotConfirmedFromProvider: true };
    }
    const errType = typeof json.error === "object" ? json.error?.type : typeof json.error === "string" ? json.error : undefined;
    const errCode = typeof json.error === "object" ? json.error?.code : undefined;
    return { ...base, providerErrorType: errType ?? json.status, providerErrorCode: errCode };
  } catch {
    return { ...base, responseNotConfirmedFromProvider: true };
  }
}

/**
 * Fase 2.6 (closure) §2 — same 401/403/429 split as duffel/client.ts; see
 * errors.ts's own doc comment. A 403 here is never reported as a rate
 * limit, and never silently blamed on NUITEE_API_KEY when the response
 * couldn't be confirmed as coming from Nuitee itself.
 */
export async function nuiteeRequest<T>(req: NuiteeRequest, fetchImpl: typeof fetch = fetch): Promise<T> {
  if (!nuiteeConfig.isConfigured) {
    throw new ProviderError("PROVIDER_UNAVAILABLE", "nuitee", "NUITEE_API_KEY is not configured.");
  }

  const base = req.host === "search" ? SEARCH_BASE_URL : BOOK_BASE_URL;
  const url = `${base}${req.path}`;

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: req.method,
      headers: {
        "X-API-Key": nuiteeConfig.apiKey,
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
    throw new ProviderError("NETWORK_ERROR", "nuitee", timedOut ? "Nuitee request timed out before any response was received." : `Nuitee request failed before any response was received: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (response.status === 404) {
    throw new ProviderError("NO_AVAILABILITY", "nuitee", "Nuitee returned 404 for this request.");
  }
  if (response.status === 429) {
    const detail = await parseNuiteeErrorDetail(response);
    throw new ProviderError("RATE_LIMITED", "nuitee", "Nuitee rate limit exceeded (429).", detail);
  }
  if (response.status === 401) {
    const detail = await parseNuiteeErrorDetail(response);
    throw new ProviderError("AUTHENTICATION_FAILED", "nuitee", "Nuitee rejected the request as unauthenticated (401) — check NUITEE_API_KEY.", detail);
  }
  if (response.status === 403) {
    const detail = await parseNuiteeErrorDetail(response);
    const note = detail.responseNotConfirmedFromProvider ? " The response body could not be confirmed as coming from Nuitee itself (possible proxy/network interception before reaching the provider) — do not assume NUITEE_API_KEY is the cause." : " The token is valid but lacks permission for this request.";
    throw new ProviderError("PERMISSION_DENIED", "nuitee", `Nuitee rejected the request as forbidden (403).${note}`, detail);
  }
  if (response.status >= 500) {
    throw new ProviderError("PROVIDER_UNAVAILABLE", "nuitee", `Nuitee returned ${response.status}.`, { httpStatus: response.status });
  }
  if (!response.ok) {
    throw new ProviderError("INVALID_PROVIDER_RESPONSE", "nuitee", `Nuitee returned ${response.status}.`, { httpStatus: response.status });
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new ProviderError("INVALID_PROVIDER_RESPONSE", "nuitee", "Nuitee response was not valid JSON.");
  }
  return json as T;
}
