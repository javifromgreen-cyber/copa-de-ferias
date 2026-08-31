// Server-only by convention (same as src/lib/payments/*): this file must
// only ever be imported from server actions/route handlers, never from a
// client component — it holds the Duffel access token in memory.
import { duffelConfig } from "@/lib/env";
import { ProviderError } from "@/lib/providers/errors";

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
 * Injectable so tests never touch the network — pass a stub `fetchImpl`
 * instead of relying on a global fetch mock. Every caller in this
 * directory goes through this one function so auth header, timeout, and
 * HTTP/network-error -> ProviderError mapping only exist in one place.
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
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    throw new ProviderError("PROVIDER_UNAVAILABLE", "duffel", timedOut ? "Duffel request timed out." : `Duffel request failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (response.status === 404) {
    throw new ProviderError("NO_AVAILABILITY", "duffel", "Duffel returned 404 for this request.");
  }
  if (response.status === 401 || response.status === 403) {
    throw new ProviderError("PROVIDER_UNAVAILABLE", "duffel", `Duffel rejected the request as unauthorized/forbidden (${response.status}) — check DUFFEL_ACCESS_TOKEN.`);
  }
  if (response.status >= 500) {
    throw new ProviderError("PROVIDER_UNAVAILABLE", "duffel", `Duffel returned ${response.status}.`);
  }
  if (!response.ok) {
    throw new ProviderError("INVALID_PROVIDER_RESPONSE", "duffel", `Duffel returned ${response.status}.`);
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new ProviderError("INVALID_PROVIDER_RESPONSE", "duffel", "Duffel response was not valid JSON.");
  }
  return json as T;
}
