"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { prepareRealCheckoutAttempt, type RealCheckoutTicketOption } from "@/server/actions/prepare-checkout-attempt";
import { searchRealHotelOptions, searchRealRoundTripFlightOptions, type RealHotelOption, type RealRoundTripOfferDTO } from "@/server/actions/real-checkout-search";
import type { PrepareCheckoutAttemptResult } from "@/lib/checkout-saga/prepareCheckoutAttempt";
import { COUNTRIES, isFlightPackageEligible } from "@/lib/checkout-atu-aire/countries";
import { CANDIDATE_SPANISH_ORIGINS } from "@/lib/providers/flights/realFlightProvider";
import { buildOutboundOptions, buildReturnOptions, resolveOffer, formatSliceTime, type DaypartPreference } from "./flightSelectionClient";
import { ReadyToPaySummary } from "./ReadyToPaySummary";

/**
 * Fase 2.5 §7-§17 — the new real pre-payment flow's UI, now modality-aware
 * (TICKET_ONLY / TICKET_HOTEL / TICKET_HOTEL_FLIGHT) with a real Nuitee
 * hotel picker (SEARCH only — PREBOOK happens exclusively inside
 * prepareCheckoutAttempt at CONTINUAR, §20) and a real Duffel round-trip
 * flight picker (ONE Offer Request with two slices, PASO IDA -> PASO
 * VUELTA -> one resolved offer, §10). Deliberately reuses this same
 * minimal, unstyled-by-design page rather than the legacy
 * AtuAireCheckout/CheckoutFlow components (§11: "no rediseñes
 * visualmente toda la web") — this stays a separate, intentionally plain
 * prototype page.
 *
 * LEGACY DEMO vs NEW REAL CHECKOUT (§23): /reservar (CheckoutFlow,
 * createAtuAireBooking) is the old, untouched demo flow — synchronous,
 * simulated payment, no real provider integration. This component is the
 * NEW real flow — real CheckoutAttempt saga, real Nuitee/Duffel SEARCH +
 * PREBOOK/revalidation, stops at READY_TO_PAY with no payment executed
 * (§17/§24: no Stripe, no PaymentIntent, no Nuitee BOOK, no Duffel Order).
 * A future phase replaces LEGACY with NEW; both coexist until then.
 */
type Traveler = { firstName: string; lastName: string; title: string; gender: string; birthDate: string; email: string; phone: string };
type PackageType = "TICKET_ONLY" | "TICKET_HOTEL" | "TICKET_HOTEL_FLIGHT";

const EMPTY_TRAVELER: Traveler = { firstName: "", lastName: "", title: "", gender: "", birthDate: "", email: "", phone: "" };

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
  const [buyerCountryCode, setBuyerCountryCode] = useState("ES");
  const [partySize, setPartySize] = useState(1);
  const [ticketOfferId, setTicketOfferId] = useState(ticketOptions[0]?.ticketOfferId ?? "");
  const [travelers, setTravelers] = useState<Traveler[]>([{ ...EMPTY_TRAVELER }]);
  const [buyer, setBuyer] = useState({ firstName: "", lastName: "", email: "", phone: "" });

  // --- Hotel picker state (§8/§9) ---
  const [hotelStatus, setHotelStatus] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [hotelOptions, setHotelOptions] = useState<RealHotelOption[]>([]);
  const [hotelError, setHotelError] = useState<string | null>(null);
  const [selectedHotel, setSelectedHotel] = useState<RealHotelOption | null>(null);

  // --- Flight picker state (§10/§11/§12) ---
  const [originIata, setOriginIata] = useState(CANDIDATE_SPANISH_ORIGINS[0]?.iata ?? "MAD");
  const [flightStatus, setFlightStatus] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [flightOffers, setFlightOffers] = useState<RealRoundTripOfferDTO[]>([]);
  const [flightError, setFlightError] = useState<string | null>(null);
  const [outboundPref, setOutboundPref] = useState<DaypartPreference>("ANY");
  const [returnPref, setReturnPref] = useState<DaypartPreference>("ANY");
  const [outboundKey, setOutboundKey] = useState<string | null>(null);
  const [returnKey, setReturnKey] = useState<string | null>(null);

  // --- CONTINUAR / READY_TO_PAY ---
  const [status, setStatus] = useState<"idle" | "checking" | "ready" | "error">("idle");
  const [result, setResult] = useState<PrepareCheckoutAttemptResult | null>(null);

  const requiresHotel = packageType !== "TICKET_ONLY";
  const requiresFlight = packageType === "TICKET_HOTEL_FLIGHT";
  const flightEligible = isFlightPackageEligible(buyerCountryCode);

  const resolvedFlight = outboundKey && returnKey ? resolveOffer(flightOffers, outboundKey, returnKey) : null;
  const outboundOptions = flightStatus === "loaded" ? buildOutboundOptions(flightOffers, outboundPref) : [];
  const returnOptions = flightStatus === "loaded" && outboundKey ? buildReturnOptions(flightOffers, outboundKey, returnPref) : [];

  function setPartySizeAndTravelers(next: number) {
    setPartySize(next);
    setTravelers((prev) => {
      const copy = [...prev];
      while (copy.length < next) copy.push({ ...EMPTY_TRAVELER });
      copy.length = next;
      return copy;
    });
  }

  function setPackageTypeSafe(next: PackageType) {
    if (next === "TICKET_HOTEL_FLIGHT" && !flightEligible) return;
    setPackageType(next);
    setSelectedHotel(null);
    setOutboundKey(null);
    setReturnKey(null);
  }

  async function handleSearchHotels() {
    setHotelStatus("loading");
    setHotelError(null);
    setSelectedHotel(null);
    const res = await searchRealHotelOptions({ tripSlug, partySize, buyerCountryCode });
    if (res.ok) {
      setHotelOptions(res.hotels);
      setHotelStatus("loaded");
    } else {
      setHotelError(res.error);
      setHotelStatus("error");
    }
  }

  async function handleSearchFlights() {
    setFlightStatus("loading");
    setFlightError(null);
    setOutboundKey(null);
    setReturnKey(null);
    const res = await searchRealRoundTripFlightOptions({ tripSlug, originIata, partySize });
    if (res.ok) {
      setFlightOffers(res.offers);
      setFlightStatus("loaded");
    } else {
      setFlightError(res.error);
      setFlightStatus("error");
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
      buyer,
      travelers: requiresFlight ? travelers.map(toDuffelTraveler) : travelers.map((t) => ({ firstName: t.firstName, lastName: t.lastName })),
      ticketOfferId,
      ticketQuantity: partySize,
      hotel: requiresHotel && selectedHotel ? { offerId: selectedHotel.offerId, expectedTotalPrice: 0, expectedRooms: selectedHotel.rooms.map((r) => ({ occupancyNumber: r.occupancyNumber, roomName: r.roomName })), hotelName: selectedHotel.name } : undefined,
      flight:
        requiresFlight && resolvedFlight?.ok
          ? { offerId: resolvedFlight.offer.offerId, offerRequestId: resolvedFlight.offer.offerRequestId, passengerIds: resolvedFlight.offer.passengerIds, originalTotalAmount: resolvedFlight.offer.totalAmount, outboundSliceKey: outboundKey!, returnSliceKey: returnKey! }
          : undefined,
    });
    setResult(res);
    setStatus(res.ok ? "ready" : "error");
    if (res.ok) router.replace(`/viajes/${tripSlug}/reservar-real?attempt=${res.accessToken}`);
  }

  if (ticketOptions.length === 0) {
    return <p className="text-carbon/70">Este producto todavía no tiene entradas configuradas.</p>;
  }

  if (status === "ready" && result?.ok) {
    return <ReadyToPaySummary tripName={tripName} matchLabel={matchLabel} snapshot={result.finalQuoteSnapshot} travelers={travelers.map((t) => ({ firstName: t.firstName, lastName: t.lastName }))} />;
  }

  return (
    <div className="max-w-xl space-y-8">
      <div>
        <label htmlFor="buyer-country" className="mb-2 block text-sm font-semibold uppercase">
          ¿Desde qué país viajas?
        </label>
        <select id="buyer-country" value={buyerCountryCode} onChange={(e) => setBuyerCountryCode(e.target.value)} className="border border-carbon/30 px-3 py-2">
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
          <label htmlFor="origin-airport" className="mb-1 block text-sm font-semibold uppercase">
            Aeropuerto de salida
          </label>
          <select id="origin-airport" value={originIata} onChange={(e) => setOriginIata(e.target.value)} className="border border-carbon/30 px-3 py-2">
            {CANDIDATE_SPANISH_ORIGINS.map((o) => (
              <option key={o.iata} value={o.iata}>
                {o.city} ({o.iata})
              </option>
            ))}
          </select>
          <div>
            <Button type="button" variant="secondary" onClick={handleSearchFlights} disabled={flightStatus === "loading"}>
              {flightStatus === "loading" ? "Buscando vuelos..." : "Buscar vuelos"}
            </Button>
          </div>
          {flightStatus === "error" && (
            <p role="alert" className="text-sm text-red-700">
              {flightError}
            </p>
          )}
          {flightStatus === "loaded" && flightOffers.length === 0 && <p className="text-sm text-carbon/70">No hay vuelos directos disponibles para este origen.</p>}

          {flightStatus === "loaded" && flightOffers.length > 0 && (
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
                          <input type="radio" name="return" className="mr-2" checked={returnKey === opt.key} onChange={() => setReturnKey(opt.key)} />
                          {opt.slice.segments[0].originIata} → {opt.slice.segments[opt.slice.segments.length - 1].destinationIata} · {formatSliceTime(opt.slice.segments[0].departingAt)} ({opt.slice.segments[0].carrierName})
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {outboundKey && returnKey && (
                <p className="text-sm">
                  {resolvedFlight?.ok ? (
                    <>
                      Vuelo ida y vuelta {(resolvedFlight.offer.totalAmount / partySize).toFixed(2)} {resolvedFlight.offer.currency}/persona
                    </>
                  ) : (
                    <span role="alert" className="text-red-700">
                      Estas opciones combinan tarifas distintas (cabina, equipaje o condiciones de cambio/reembolso) — elige otra combinación de ida/vuelta para continuar.
                    </span>
                  )}
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
