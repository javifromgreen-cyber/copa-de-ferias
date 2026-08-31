// Server-only by convention (same as src/lib/payments/*): this file must
// only ever be imported from server actions/route handlers, never from a
// client component — it holds the Nuitee API key in memory.
import { nuiteeConfig } from "@/lib/env";
import { ProviderError } from "@/lib/providers/errors";

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
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    throw new ProviderError("PROVIDER_UNAVAILABLE", "nuitee", timedOut ? "Nuitee request timed out." : `Nuitee request failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (response.status === 404) {
    throw new ProviderError("NO_AVAILABILITY", "nuitee", "Nuitee returned 404 for this request.");
  }
  if (response.status === 401 || response.status === 403) {
    throw new ProviderError("PROVIDER_UNAVAILABLE", "nuitee", `Nuitee rejected the request as unauthorized/forbidden (${response.status}) — check NUITEE_API_KEY.`);
  }
  if (response.status >= 500) {
    throw new ProviderError("PROVIDER_UNAVAILABLE", "nuitee", `Nuitee returned ${response.status}.`);
  }
  if (!response.ok) {
    throw new ProviderError("INVALID_PROVIDER_RESPONSE", "nuitee", `Nuitee returned ${response.status}.`);
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new ProviderError("INVALID_PROVIDER_RESPONSE", "nuitee", "Nuitee response was not valid JSON.");
  }
  return json as T;
}
