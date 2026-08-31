import type { RealFlightSliceDTO, RealRoundTripOfferDTO } from "@/server/actions/real-checkout-search";

/**
 * Fase 2.5 §10/§11 — a UI-only mirror of
 * src/lib/providers/flights/duffel/roundTripSelection.ts's pure functions
 * (flightSliceKey / buildOutboundSliceOptions /
 * buildReturnSliceOptionsForOutbound / resolveRoundTripOffer), but
 * operating on the plain, already-serialized RealRoundTripOfferDTO shape
 * (ISO date strings) instead of RoundTripFlightOffer (Date objects,
 * server-only Duffel client imports upstream). Duplicated on purpose
 * rather than imported: roundTripSearch.ts pulls in duffel/client.ts,
 * which must never end up in a client bundle. The rules themselves are
 * identical — same slice-key composition, same "same currency AND same
 * commercialProduct on both directions" comparability gate — because this
 * is only a UI grouping/dedup convenience; the actual selected offerId is
 * always re-revalidated server-side inside prepareCheckoutAttempt before
 * anything is trusted (§15).
 */
export type DaypartPreference = "ANY" | "MORNING" | "AFTERNOON";

function classifyDaypart(iso: string): "morning" | "midday" | "afternoon" | "night" {
  const h = new Date(iso).getHours();
  if (h >= 6 && h < 12) return "morning";
  if (h >= 12 && h < 15) return "midday";
  if (h >= 15 && h < 20) return "afternoon";
  return "night";
}

function sliceMatchesDaypart(slice: RealFlightSliceDTO, preference: DaypartPreference): boolean {
  if (preference === "ANY") return true;
  return classifyDaypart(slice.segments[0].departingAt) === preference.toLowerCase();
}

export function sliceKey(slice: RealFlightSliceDTO): string {
  return slice.segments.map((s) => [s.originIata, s.destinationIata, s.departingAt, s.arrivingAt, s.carrierIata, s.flightNumber ?? ""].join("|")).join(">>");
}

export type SliceOption = { key: string; slice: RealFlightSliceDTO };

export function buildOutboundOptions(offers: RealRoundTripOfferDTO[], preference: DaypartPreference): SliceOption[] {
  const byKey = new Map<string, RealFlightSliceDTO>();
  for (const offer of offers) {
    if (!sliceMatchesDaypart(offer.outbound, preference)) continue;
    const key = sliceKey(offer.outbound);
    if (!byKey.has(key)) byKey.set(key, offer.outbound);
  }
  return [...byKey.entries()].map(([key, slice]) => ({ key, slice }));
}

export function buildReturnOptions(offers: RealRoundTripOfferDTO[], outboundKey: string, preference: DaypartPreference): SliceOption[] {
  const byKey = new Map<string, RealFlightSliceDTO>();
  for (const offer of offers) {
    if (sliceKey(offer.outbound) !== outboundKey) continue;
    if (!sliceMatchesDaypart(offer.return, preference)) continue;
    const key = sliceKey(offer.return);
    if (!byKey.has(key)) byKey.set(key, offer.return);
  }
  return [...byKey.entries()].map(([key, slice]) => ({ key, slice }));
}

export type ResolveOfferResult = { ok: true; offer: RealRoundTripOfferDTO } | { ok: false; reason: "not_found" | "not_comparable" };

export function resolveOffer(offers: RealRoundTripOfferDTO[], outboundKey: string, returnKey: string): ResolveOfferResult {
  const matches = offers.filter((o) => sliceKey(o.outbound) === outboundKey && sliceKey(o.return) === returnKey);
  if (matches.length === 0) return { ok: false, reason: "not_found" };
  const currencies = new Set(matches.map((o) => o.currency));
  const productKeys = new Set(matches.map((o) => JSON.stringify(o.commercialProduct)));
  if (currencies.size > 1 || productKeys.size > 1) return { ok: false, reason: "not_comparable" };
  const cheapest = [...matches].sort((a, b) => a.totalAmount - b.totalAmount || a.offerId.localeCompare(b.offerId))[0];
  return { ok: true, offer: cheapest };
}

export function formatSliceTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}
