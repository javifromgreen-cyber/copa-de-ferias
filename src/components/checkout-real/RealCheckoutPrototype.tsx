"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { prepareRealCheckoutAttempt, type RealCheckoutTicketOption } from "@/server/actions/prepare-checkout-attempt";
import { searchRealHotelOptions, searchViableFlightOrigins, getFlightSessionOffers, type RealHotelOption, type RealRoundTripOfferDTO, type ViableFlightOrigin } from "@/server/actions/real-checkout-search";
import type { PrepareCheckoutAttemptResult } from "@/lib/checkout-saga/prepareCheckoutAttempt";
import { COUNTRIES, isFlightPackageEligible } from "@/lib/checkout-atu-aire/countries";
import { buildOutboundOptions, buildReturnOptions, resolveOffer, formatSliceTime, type DaypartPreference } from "./flightSelectionClient";
import { ReadyToPaySummary } from "./ReadyToPaySummary";
import { PaymentAuthorizationPanel } from "./PaymentAuthorizationPanel";

/**
 * Fase 2.5 §7-§17, corrected in Fase 2.6 — the new real pre-payment
 * flow's UI, modality-aware (TICKET_ONLY / TICKET_HOTEL /
 * TICKET_HOTEL_FLIGHT) with a real Nuitee hotel picker (SEARCH only —
 * PREBOOK happens exclusively inside prepareCheckoutAttempt at
 * CONTINUAR) and a real Duffel round-trip flight picker.
 *
 * Fase 2.6 §2/§4 — the flight side is now: "Buscar aeropuertos de
 * salida" (one search per candidate Spanish origin, server-side; only
 * origins that actually have a viable direct round trip come back, each
 * already carrying an opaque FlightSearchSession id) -> pick an origin
 * (a DB-only read, no new Duffel call) -> Paso Ida -> Paso Vuelta -> if
 * several commercial products remain for that exact itinerary, a
 * Tarifa/Condiciones step lets the customer choose one explicitly
 * instead of hitting a dead end. passengerIds/offerRequestId never reach
 * this component at all — only the session id and the single resolved
 * offerId travel to prepareRealCheckoutAttempt.
 *
 * Fase 2.6 §3 — "¿Desde qué país viajas?" is `travelOriginCountry`, a
 * distinct concept from a traveler's nationality; it alone drives flight
 * eligibility (isFlightPackageEligible) and is persisted on
 * CheckoutAttempt, never confused with Nuitee's own guestNationality
 * parameter (used internally by searchRealHotelOptions for a different
 * purpose).
 *
 * LEGACY DEMO vs NEW REAL CHECKOUT (§23): /reservar (CheckoutFlow,
 * createAtuAireBooking) is the old, untouched demo flow. This component
 * is the NEW real flow — stops at READY_TO_PAY with no payment executed.
 */
type Traveler = { firstName: string; lastName: string; title: string; gender: string; birthDate: string; email: string; phone: string };
type PackageType = "TICKET_ONLY" | "TICKET_HOTEL" | "TICKET_HOTEL_FLIGHT";

const EMPTY_TRAVELER: Traveler = { firstName: "", lastName: "", title: "", gender: "", birthDate: "", email: "", phone: "" };

function baggageSummary(baggage: { checkedIncluded: boolean; carryOnIncluded: boolean } | null): string {
  if (!baggage) return "Equipaje: sin datos";
  const parts: string[] = [];
  parts.push(baggage.checkedIncluded ? "facturado incluido" : "sin facturado");
  parts.push(baggage.carryOnIncluded ? "de mano incluido" : "sin equipaje de mano");
  return `Equipaje: ${parts.join(", ")}`;
}

function conditionSummary(label: string, condition: { allowed: boolean; penaltyAmount: number | null; penaltyCurrency: string | null } | null): string {
  if (!condition) return `${label}: condiciones no informadas`;
  if (!condition.allowed) return `${label}: no permitido`;
  if (condition.penaltyAmount) return `${label}: permitido (penalización ${condition.penaltyAmount} ${condition.penaltyCurrency ?? ""})`;
  return `${label}: permitido sin penalización`;
}

export function RealCheckoutPrototype({
  tripSlug,
  tripName,
  matchLabel,
  ticketOptions,
}: {
  tripSlug: string;
  tripName: string;
  matchLabel: string;
  ticketOptions: RealCheckoutTicketOption[];
}) {
  const router = useRouter();
  const [packageType, setPackageType] = useState<PackageType>("TICKET_ONLY");
  const [travelOriginCountry, setTravelOriginCountry] = useState("ES");
  const [partySize, setPartySize] = useState(1);
  const [ticketOfferId, setTicketOfferId] = useState(ticketOptions[0]?.ticketOfferId ?? "");
  const [travelers, setTravelers] = useState<Traveler[]>([{ ...EMPTY_TRAVELER }]);
  const [buyer, setBuyer] = useState({ firstName: "", lastName: "", email: "", phone: "" });

  // --- Hotel picker state (§8/§9) ---
  const [hotelStatus, setHotelStatus] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [hotelOptions, setHotelOptions] = useState<RealHotelOption[]>([]);
  const [hotelError, setHotelError] = useState<string | null>(null);
  const [selectedHotel, setSelectedHotel] = useState<RealHotelOption | null>(null);

  // --- Flight picker state (Fase 2.6 §2/§4) ---
  const [originStatus, setOriginStatus] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [viableOrigins, setViableOrigins] = useState<ViableFlightOrigin[]>([]);
  const [originError, setOriginError] = useState<string | null>(null);
  const [selectedOriginSessionId, setSelectedOriginSessionId] = useState<string | null>(null);
  const [flightOffersStatus, setFlightOffersStatus] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [flightOffers, setFlightOffers] = useState<RealRoundTripOfferDTO[]>([]);
  const [flightOffersError, setFlightOffersError] = useState<string | null>(null);
  const [outboundPref, setOutboundPref] = useState<DaypartPreference>("ANY");
  const [returnPref, setReturnPref] = useState<DaypartPreference>("ANY");
  const [outboundKey, setOutboundKey] = useState<string | null>(null);
  const [returnKey, setReturnKey] = useState<string | null>(null);
  const [selectedFareOfferId, setSelectedFareOfferId] = useState<string | null>(null);

  // --- CONTINUAR / READY_TO_PAY ---
  const [status, setStatus] = useState<"idle" | "checking" | "ready" | "error">("idle");
  const [result, setResult] = useState<PrepareCheckoutAttemptResult | null>(null);

  const requiresHotel = packageType !== "TICKET_ONLY";
  const requiresFlight = packageType === "TICKET_HOTEL_FLIGHT";
  const flightEligible = isFlightPackageEligible(travelOriginCountry);

  const outboundOptions = flightOffersStatus === "loaded" ? buildOutboundOptions(flightOffers, outboundPref) : [];
  const returnOptions = flightOffersStatus === "loaded" && outboundKey ? buildReturnOptions(flightOffers, outboundKey, returnPref) : [];
  const resolvedFlight = outboundKey && returnKey ? resolveOffer(flightOffers, outboundKey, returnKey) : null;
  const fareCandidates = resolvedFlight && !resolvedFlight.ok && resolvedFlight.reason === "not_comparable" ? resolvedFlight.candidates : [];
  const finalFlightOffer: RealRoundTripOfferDTO | null = resolvedFlight?.ok ? resolvedFlight.offer : fareCandidates.find((c) => c.offerId === selectedFareOfferId) ?? null;

  function setPartySizeAndTravelers(next: number) {
    setPartySize(next);
    setTravelers((prev) => {
      const copy = [...prev];
      while (copy.length < next) copy.push({ ...EMPTY_TRAVELER });
      copy.length = next;
      return copy;
    });
  }

  function resetFlightSelection() {
    setViableOrigins([]);
    setOriginStatus("idle");
    setSelectedOriginSessionId(null);
    setFlightOffers([]);
    setFlightOffersStatus("idle");
    setOutboundKey(null);
    setReturnKey(null);
    setSelectedFareOfferId(null);
  }

  function setPackageTypeSafe(next: PackageType) {
    if (next === "TICKET_HOTEL_FLIGHT" && !flightEligible) return;
    setPackageType(next);
    setSelectedHotel(null);
    resetFlightSelection();
  }

  async function handleSearchHotels() {
    setHotelStatus("loading");
    setHotelError(null);
    setSelectedHotel(null);
    const res = await searchRealHotelOptions({ tripSlug, partySize, travelOriginCountry });
    if (res.ok) {
      setHotelOptions(res.hotels);
      setHotelStatus("loaded");
    } else {
      setHotelError(res.error);
      setHotelStatus("error");
    }
  }

  async function handleSearchOrigins() {
    resetFlightSelection();
    setOriginStatus("loading");
    const res = await searchViableFlightOrigins({ tripSlug, partySize });
    if (res.ok) {
      setViableOrigins(res.origins);
      setOriginStatus("loaded");
    } else {
      setOriginError(res.error);
      setOriginStatus("error");
    }
  }

  async function handleSelectOrigin(sessionId: string) {
    setSelectedOriginSessionId(sessionId);
    setOutboundKey(null);
    setReturnKey(null);
    setSelectedFareOfferId(null);
    setFlightOffersStatus("loading");
    const res = await getFlightSessionOffers({ sessionId });
    if (res.ok) {
      setFlightOffers(res.offers);
      setFlightOffersStatus("loaded");
    } else {
      setFlightOffersError(res.error);
      setFlightOffersStatus("error");
    }
  }

  function toDuffelTraveler(t: Traveler) {
    return { firstName: t.firstName, lastName: t.lastName, title: t.title || undefined, gender: t.gender || undefined, birthDate: t.birthDate || undefined, email: t.email || undefined, phone: t.phone || undefined };
  }

  async function handleContinuar() {
    setStatus("checking");
    setResult(null);
    const res = await prepareRealCheckoutAttempt({
      tripSlug,
      packageType,
      partySize,
      travelOriginCountry,
      buyer,
      travelers: requiresFlight ? travelers.map(toDuffelTraveler) : travelers.map((t) => ({ firstName: t.firstName, lastName: t.lastName })),
      ticketOfferId,
      ticketQuantity: partySize,
      hotel: requiresHotel && selectedHotel ? { offerId: selectedHotel.offerId, expectedTotalPrice: 0, expectedRooms: selectedHotel.rooms.map((r) => ({ occupancyNumber: r.occupancyNumber, roomName: r.roomName })), hotelName: selectedHotel.name } : undefined,
      flight: requiresFlight && selectedOriginSessionId && finalFlightOffer && outboundKey && returnKey ? { searchSessionId: selectedOriginSessionId, offerId: finalFlightOffer.offerId, outboundSliceKey: outboundKey, returnSliceKey: returnKey } : undefined,
    });
    setResult(res);
    setStatus(res.ok ? "ready" : "error");
    if (res.ok) router.replace(`/viajes/${tripSlug}/reservar-real?attempt=${res.accessToken}`);
  }

  if (ticketOptions.length === 0) {
    return <p className="text-carbon/70">Este producto todavía no tiene entradas configuradas.</p>;
  }

  if (status === "ready" && result?.ok) {
    return (
      <div className="max-w-xl space-y-6">
        <ReadyToPaySummary
          tripName={tripName}
          matchLabel={matchLabel}
          snapshot={result.finalQuoteSnapshot}
          travelers={travelers.map((t) => ({ firstName: t.firstName, lastName: t.lastName }))}
          travelOriginCountry={travelOriginCountry}
        />
        <PaymentAuthorizationPanel accessToken={result.accessToken} totalLabel={`${result.finalQuoteSnapshot.commercial.pvpTotal.toFixed(2)} ${result.finalQuoteSnapshot.commercial.currency}`} />
      </div>
    );
  }

  return (
    <div className="max-w-xl space-y-8">
      <div>
        <label htmlFor="travel-origin-country" className="mb-2 block text-sm font-semibold uppercase">
          ¿Desde qué país viajas?
        </label>
        <select id="travel-origin-country" value={travelOriginCountry} onChange={(e) => setTravelOriginCountry(e.target.value)} className="border border-carbon/30 px-3 py-2">
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <h2 className="font-display mb-3 text-xl uppercase">Modalidad</h2>
        <div className="flex flex-wrap gap-3 text-sm">
          <button type="button" onClick={() => setPackageTypeSafe("TICKET_ONLY")} className={`rounded-sm border px-4 py-2 ${packageType === "TICKET_ONLY" ? "border-carbon bg-carbon text-ivory" : "border-carbon/30"}`}>
            Entrada
          </button>
          <button type="button" onClick={() => setPackageTypeSafe("TICKET_HOTEL")} className={`rounded-sm border px-4 py-2 ${packageType === "TICKET_HOTEL" ? "border-carbon bg-carbon text-ivory" : "border-carbon/30"}`}>
            Entrada + Hotel
          </button>
          <button
            type="button"
            onClick={() => setPackageTypeSafe("TICKET_HOTEL_FLIGHT")}
            disabled={!flightEligible}
            title={flightEligible ? undefined : "El paquete con vuelo solo está disponible para viajeros que salen desde España"}
            className={`rounded-sm border px-4 py-2 ${packageType === "TICKET_HOTEL_FLIGHT" ? "border-carbon bg-carbon text-ivory" : "border-carbon/30"} ${!flightEligible ? "opacity-40" : ""}`}
          >
            Entrada + Hotel + Vuelo
          </button>
        </div>
      </div>

      <div>
        <label htmlFor="party-size" className="mb-2 block text-sm font-semibold uppercase">
          Viajeros
        </label>
        <select id="party-size" value={partySize} onChange={(e) => setPartySizeAndTravelers(Number(e.target.value))} className="border border-carbon/30 px-3 py-2">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="ticket-offer" className="mb-2 block text-sm font-semibold uppercase">
          Entrada
        </label>
        <select id="ticket-offer" value={ticketOfferId} onChange={(e) => setTicketOfferId(e.target.value)} className="w-full border border-carbon/30 px-3 py-2">
          {ticketOptions.map((o) => (
            <option key={o.ticketOfferId} value={o.ticketOfferId}>
              {o.eventLabel} — {o.category}
            </option>
          ))}
        </select>
      </div>

      {requiresHotel && (
        <div className="space-y-3">
          <h2 className="font-display text-xl uppercase">Hotel</h2>
          <Button type="button" variant="secondary" onClick={handleSearchHotels} disabled={hotelStatus === "loading"}>
            {hotelStatus === "loading" ? "Buscando hoteles..." : "Buscar hoteles"}
          </Button>
          {hotelStatus === "error" && (
            <p role="alert" className="text-sm text-red-700">
              {hotelError}
            </p>
          )}
          {hotelStatus === "loaded" && hotelOptions.length === 0 && <p className="text-sm text-carbon/70">No hay hoteles disponibles para estas fechas.</p>}
          {hotelStatus === "loaded" && hotelOptions.length > 0 && (
            <div className="space-y-2">
              {hotelOptions.map((h) => (
                <label key={h.hotelId} className={`block cursor-pointer border p-3 text-sm ${selectedHotel?.hotelId === h.hotelId ? "border-carbon" : "border-carbon/20"}`}>
                  <input type="radio" name="hotel" className="mr-2" checked={selectedHotel?.hotelId === h.hotelId} onChange={() => setSelectedHotel(h)} />
                  <span className="font-semibold">{h.name}</span>
                  {h.stars != null && <span className="ml-2 text-carbon/60">{h.stars}★</span>}
                  <div className="text-carbon/60">{h.address}</div>
                  <div className="text-carbon/60">{h.rooms.map((r) => `${r.roomName}${r.board ? ` (${r.board})` : ""}`).join(", ")}</div>
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {requiresFlight && (
        <div className="space-y-3">
          <h2 className="font-display text-xl uppercase">Vuelo</h2>

          <Button type="button" variant="secondary" onClick={handleSearchOrigins} disabled={originStatus === "loading"}>
            {originStatus === "loading" ? "Buscando aeropuertos de salida..." : "Buscar aeropuertos de salida"}
          </Button>
          {originStatus === "error" && (
            <p role="alert" className="text-sm text-red-700">
              {originError}
            </p>
          )}

          {originStatus === "loaded" && (
            <div className="space-y-1">
              <p className="text-sm font-semibold uppercase">Aeropuerto de salida</p>
              {viableOrigins.map((o) => (
                <label key={o.sessionId} className={`block cursor-pointer border p-2 text-sm ${selectedOriginSessionId === o.sessionId ? "border-carbon" : "border-carbon/20"}`}>
                  <input type="radio" name="origin" className="mr-2" checked={selectedOriginSessionId === o.sessionId} onChange={() => handleSelectOrigin(o.sessionId)} />
                  {o.city} ({o.iata})
                </label>
              ))}
            </div>
          )}

          {flightOffersStatus === "error" && (
            <p role="alert" className="text-sm text-red-700">
              {flightOffersError}
            </p>
          )}

          {flightOffersStatus === "loaded" && flightOffers.length > 0 && (
            <div className="space-y-4">
              <div>
                <h3 className="mb-2 text-sm font-semibold uppercase">Paso 1 — Ida</h3>
                <div className="mb-2 flex gap-2 text-xs">
                  {(["ANY", "MORNING", "AFTERNOON"] as DaypartPreference[]).map((p) => (
                    <button key={p} type="button" onClick={() => setOutboundPref(p)} className={`border px-2 py-1 ${outboundPref === p ? "border-carbon bg-carbon text-ivory" : "border-carbon/30"}`}>
                      {p === "ANY" ? "Cualquiera" : p === "MORNING" ? "Mañana" : "Tarde"}
                    </button>
                  ))}
                </div>
                {outboundOptions.length === 0 ? (
                  <p className="text-sm text-carbon/70">No disponible para esta preferencia.</p>
                ) : (
                  <div className="space-y-1">
                    {outboundOptions.map((opt) => (
                      <label key={opt.key} className={`block cursor-pointer border p-2 text-sm ${outboundKey === opt.key ? "border-carbon" : "border-carbon/20"}`}>
                        <input
                          type="radio"
                          name="outbound"
                          className="mr-2"
                          checked={outboundKey === opt.key}
                          onChange={() => {
                            setOutboundKey(opt.key);
                            setReturnKey(null);
                            setSelectedFareOfferId(null);
                          }}
                        />
                        {opt.slice.segments[0].originIata} → {opt.slice.segments[opt.slice.segments.length - 1].destinationIata} · {formatSliceTime(opt.slice.segments[0].departingAt)} ({opt.slice.segments[0].carrierName})
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {outboundKey && (
                <div>
                  <h3 className="mb-2 text-sm font-semibold uppercase">Paso 2 — Vuelta</h3>
                  <div className="mb-2 flex gap-2 text-xs">
                    {(["ANY", "MORNING", "AFTERNOON"] as DaypartPreference[]).map((p) => (
                      <button key={p} type="button" onClick={() => setReturnPref(p)} className={`border px-2 py-1 ${returnPref === p ? "border-carbon bg-carbon text-ivory" : "border-carbon/30"}`}>
                        {p === "ANY" ? "Cualquiera" : p === "MORNING" ? "Mañana" : "Tarde"}
                      </button>
                    ))}
                  </div>
                  {returnOptions.length === 0 ? (
                    <p className="text-sm text-carbon/70">No disponible para esta preferencia.</p>
                  ) : (
                    <div className="space-y-1">
                      {returnOptions.map((opt) => (
                        <label key={opt.key} className={`block cursor-pointer border p-2 text-sm ${returnKey === opt.key ? "border-carbon" : "border-carbon/20"}`}>
                          <input
                            type="radio"
                            name="return"
                            className="mr-2"
                            checked={returnKey === opt.key}
                            onChange={() => {
                              setReturnKey(opt.key);
                              setSelectedFareOfferId(null);
                            }}
                          />
                          {opt.slice.segments[0].originIata} → {opt.slice.segments[opt.slice.segments.length - 1].destinationIata} · {formatSliceTime(opt.slice.segments[0].departingAt)} ({opt.slice.segments[0].carrierName})
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Fase 2.6 §1 — when several genuinely different commercial products share this exact ida/vuelta, the customer chooses one explicitly rather than hitting a dead end. */}
              {outboundKey && returnKey && resolvedFlight && !resolvedFlight.ok && resolvedFlight.reason === "not_comparable" && (
                <div>
                  <h3 className="mb-2 text-sm font-semibold uppercase">Paso 3 — Tarifa</h3>
                  <div className="space-y-1">
                    {fareCandidates.map((c) => (
                      <label key={c.offerId} className={`block cursor-pointer border p-2 text-sm ${selectedFareOfferId === c.offerId ? "border-carbon" : "border-carbon/20"}`}>
                        <input type="radio" name="fare" className="mr-2" checked={selectedFareOfferId === c.offerId} onChange={() => setSelectedFareOfferId(c.offerId)} />
                        <span className="font-semibold">{c.commercialProduct.outbound.fareBrandName ?? c.commercialProduct.outbound.cabinClass ?? "Tarifa"}</span>
                        <div className="text-carbon/60">{baggageSummary(c.commercialProduct.outbound.baggage)}</div>
                        <div className="text-carbon/60">{conditionSummary("Reembolso", c.commercialProduct.refundBeforeDeparture)}</div>
                        <div className="text-carbon/60">{conditionSummary("Cambio", c.commercialProduct.changeBeforeDeparture)}</div>
                        <div className="text-carbon/60">
                          {(c.totalAmount / partySize).toFixed(2)} {c.currency}/persona
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {outboundKey && returnKey && finalFlightOffer && (
                <p className="text-sm">
                  Vuelo ida y vuelta {(finalFlightOffer.totalAmount / partySize).toFixed(2)} {finalFlightOffer.currency}/persona
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <div className="space-y-4">
        <h2 className="font-display text-xl uppercase">Datos de cada viajero</h2>
        {travelers.map((traveler, i) => (
          <div key={i} role="group" aria-label={`Viajero ${i + 1}`} className="grid grid-cols-2 gap-3">
            <input
              aria-label={`Nombre viajero ${i + 1}`}
              placeholder="Nombre"
              value={traveler.firstName}
              onChange={(e) => setTravelers((prev) => prev.map((t, idx) => (idx === i ? { ...t, firstName: e.target.value } : t)))}
              className="border border-carbon/30 px-3 py-2"
            />
            <input
              aria-label={`Apellidos viajero ${i + 1}`}
              placeholder="Apellidos"
              value={traveler.lastName}
              onChange={(e) => setTravelers((prev) => prev.map((t, idx) => (idx === i ? { ...t, lastName: e.target.value } : t)))}
              className="border border-carbon/30 px-3 py-2"
            />
            {requiresFlight && (
              <>
                <select
                  aria-label={`Título viajero ${i + 1}`}
                  value={traveler.title}
                  onChange={(e) => setTravelers((prev) => prev.map((t, idx) => (idx === i ? { ...t, title: e.target.value } : t)))}
                  className="border border-carbon/30 px-3 py-2"
                >
                  <option value="">Título</option>
                  <option value="mr">Sr.</option>
                  <option value="mrs">Sra.</option>
                  <option value="ms">Srta.</option>
                </select>
                <select
                  aria-label={`Género viajero ${i + 1}`}
                  value={traveler.gender}
                  onChange={(e) => setTravelers((prev) => prev.map((t, idx) => (idx === i ? { ...t, gender: e.target.value } : t)))}
                  className="border border-carbon/30 px-3 py-2"
                >
                  <option value="">Género</option>
                  <option value="m">M</option>
                  <option value="f">F</option>
                </select>
                <input
                  aria-label={`Fecha de nacimiento viajero ${i + 1}`}
                  type="date"
                  value={traveler.birthDate}
                  onChange={(e) => setTravelers((prev) => prev.map((t, idx) => (idx === i ? { ...t, birthDate: e.target.value } : t)))}
                  className="border border-carbon/30 px-3 py-2"
                />
                <input
                  aria-label={`Email viajero ${i + 1}`}
                  type="email"
                  placeholder="Email"
                  value={traveler.email}
                  onChange={(e) => setTravelers((prev) => prev.map((t, idx) => (idx === i ? { ...t, email: e.target.value } : t)))}
                  className="border border-carbon/30 px-3 py-2"
                />
                <input
                  aria-label={`Teléfono viajero ${i + 1}`}
                  placeholder="+34600000000"
                  value={traveler.phone}
                  onChange={(e) => setTravelers((prev) => prev.map((t, idx) => (idx === i ? { ...t, phone: e.target.value } : t)))}
                  className="border border-carbon/30 px-3 py-2"
                />
              </>
            )}
          </div>
        ))}
      </div>

      <div className="space-y-4">
        <h2 className="font-display text-xl uppercase">Datos del comprador</h2>
        <div className="grid grid-cols-2 gap-3">
          <input aria-label="Nombre del comprador" placeholder="Nombre" value={buyer.firstName} onChange={(e) => setBuyer((b) => ({ ...b, firstName: e.target.value }))} className="border border-carbon/30 px-3 py-2" />
          <input aria-label="Apellidos del comprador" placeholder="Apellidos" value={buyer.lastName} onChange={(e) => setBuyer((b) => ({ ...b, lastName: e.target.value }))} className="border border-carbon/30 px-3 py-2" />
          <input aria-label="Email del comprador" type="email" placeholder="Email" value={buyer.email} onChange={(e) => setBuyer((b) => ({ ...b, email: e.target.value }))} className="border border-carbon/30 px-3 py-2" />
          <input aria-label="Teléfono del comprador" placeholder="+34600000000" value={buyer.phone} onChange={(e) => setBuyer((b) => ({ ...b, phone: e.target.value }))} className="border border-carbon/30 px-3 py-2" />
        </div>
      </div>

      {status === "error" && result && !result.ok && (
        <p role="alert" className="text-sm text-red-700">
          {result.error}
        </p>
      )}

      <Button onClick={handleContinuar} disabled={status === "checking"}>
        {status === "checking" ? "Comprobando disponibilidad..." : "Continuar"}
      </Button>
    </div>
  );
}
