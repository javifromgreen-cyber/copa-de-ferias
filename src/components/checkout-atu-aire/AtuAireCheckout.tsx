"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAtuAireCheckoutQuote } from "@/server/actions/atu-aire-checkout";
import { createAtuAireBooking } from "@/server/actions/atu-aire-booking";
import { packageRequiresHotel, packageRequiresFlight } from "@/lib/checkout-atu-aire/packageRequirements";
import { isFlightPackageEligible } from "@/lib/checkout-atu-aire/countries";
import { reconcileSelection } from "@/lib/checkout-atu-aire/reconcile";
import { DEFAULT_SELECTION, type AtuAireQuote, type AtuAireSelection, type FlightDaypartPreference } from "@/lib/checkout-atu-aire/types";
import { EventsHeader } from "./EventsHeader";
import { CountryStep } from "./CountryStep";
import { PackageTypeStep } from "./PackageTypeStep";
import { TravelersStep } from "./TravelersStep";
import { TicketStep } from "./TicketStep";
import { NightsStep } from "./NightsStep";
import { HotelStep } from "./HotelStep";
import { AirportStep } from "./AirportStep";
import { OutboundFlightStep, ReturnFlightStep } from "./FlightStep";
import { BuyerStep, EMPTY_BUYER, isBuyerFormComplete, type AtuAireBuyerFormState } from "./BuyerStep";
import { TravelerDetailsStep, emptyAtuAireTraveler, isAtuAireTravelersComplete, type AtuAireTravelerFormState } from "./TravelerDetailsStep";
import { RoomingStep } from "./RoomingStep";
import { assignTravelersToRooms } from "@/lib/checkout-atu-aire/rooming";
import { SummarySidebar } from "./SummarySidebar";
import { MobileSummaryBar } from "./MobileSummaryBar";
import { Button } from "@/components/ui/Button";
import type { PackageType } from "@prisma/client";

export function AtuAireCheckout({ tripSlug }: { tripSlug: string }) {
  const router = useRouter();
  const [selection, setSelection] = useState<AtuAireSelection>(DEFAULT_SELECTION);
  const [quote, setQuote] = useState<AtuAireQuote | null>(null);
  const [error, setError] = useState("");
  const [revalidating, setRevalidating] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [priceChangedNotice, setPriceChangedNotice] = useState<string | null>(null);
  const [buyer, setBuyer] = useState<AtuAireBuyerFormState>(EMPTY_BUYER);
  const [travelers, setTravelers] = useState<AtuAireTravelerFormState[]>([emptyAtuAireTraveler()]);
  const [paying, setPaying] = useState(false);
  const [paymentError, setPaymentError] = useState("");

  // The only place partySize ever changes — keeps exactly one traveler
  // fieldset per party member (§15) in the same update, in either
  // direction, preserving already-entered data for travelers that still
  // exist. Done here rather than in an effect reacting to partySize, so
  // it's one direct state update from a real event, not a cascading
  // render off a synchronized derived value.
  function setPartySize(partySize: number) {
    setSelection((s) => ({ ...s, partySize }));
    setTravelers((prev) => {
      if (prev.length === partySize) return prev;
      const next = [...prev];
      while (next.length < partySize) next.push(emptyAtuAireTraveler());
      return next.slice(0, partySize);
    });
  }

  function updateTraveler(index: number, patch: Partial<AtuAireTravelerFormState>) {
    setTravelers((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  }

  useEffect(() => {
    let cancelled = false;
    getAtuAireCheckoutQuote(tripSlug, selection).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError("");
      setQuote(result.quote);
      const reconciled = reconcileSelection(selection, result.quote);
      if (reconciled !== selection) setSelection(reconciled);
      setConfirmed(false);
    });
    return () => {
      cancelled = true;
    };
  }, [tripSlug, selection]);

  function selectCountry(buyerCountry: string) {
    setSelection((s) => {
      // The chosen modality itself can become invalid on a country change
      // (e.g. TICKET_HOTEL_FLIGHT while switching to a non-eligible
      // market) — when that happens the whole downstream flow has to be
      // redone, since it all hung off that modality. Otherwise nothing
      // else is touched.
      const packageStillValid = !s.packageType || !packageRequiresFlight(s.packageType) || isFlightPackageEligible(buyerCountry);
      if (packageStillValid) return { ...s, buyerCountry };
      return { ...DEFAULT_SELECTION, buyerCountry };
    });
  }

  function selectPackageType(packageType: PackageType) {
    setSelection((s) => ({
      ...s,
      packageType,
      nights: packageRequiresHotel(packageType) ? s.nights : null,
      hotelOfferId: packageRequiresHotel(packageType) ? s.hotelOfferId : null,
      originAirport: packageRequiresFlight(packageType) ? s.originAirport : null,
      outboundPreference: packageRequiresFlight(packageType) ? s.outboundPreference : "ANY",
      returnPreference: packageRequiresFlight(packageType) ? s.returnPreference : "ANY",
      outboundLegId: packageRequiresFlight(packageType) ? s.outboundLegId : null,
      returnLegId: packageRequiresFlight(packageType) ? s.returnLegId : null,
    }));
  }

  function selectTicket(eventId: string, category: string) {
    setSelection((s) => ({ ...s, ticketSelections: { ...s.ticketSelections, [eventId]: category } }));
  }

  function selectOrigin(originAirport: string) {
    setSelection((s) => ({ ...s, originAirport, outboundLegId: null, returnLegId: null }));
  }

  async function handleRevalidate() {
    setRevalidating(true);
    setPriceChangedNotice(null);
    const previousTotal = quote?.price.totalCommercial ?? null;
    const result = await getAtuAireCheckoutQuote(tripSlug, selection, { revalidate: true });
    setRevalidating(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const reconciled = reconcileSelection(selection, result.quote);
    if (reconciled !== selection) {
      setSelection(reconciled);
      setError("");
      setQuote(result.quote);
      return; // a selection was dropped — let the customer pick again before confirming
    }
    if (previousTotal !== null && result.quote.price.totalCommercial !== null && previousTotal !== result.quote.price.totalCommercial) {
      setPriceChangedNotice(`El precio ha cambiado de ${previousTotal.toFixed(0)} € a ${result.quote.price.totalCommercial.toFixed(0)} €. Hemos actualizado el total.`);
    }
    setQuote(result.quote);
    setConfirmed(true);
  }

  async function handlePay() {
    setPaying(true);
    setPaymentError("");
    const result = await createAtuAireBooking(tripSlug, selection, buyer, travelers);
    setPaying(false);
    if (!result.ok) {
      setPaymentError(result.error);
      return;
    }
    router.push(`/confirmacion/${result.reference}?token=${result.accessToken}`);
  }

  if (error) {
    return <p className="rounded-sm bg-stamp/10 p-4 text-sm text-stamp">{error}</p>;
  }
  if (!quote) {
    return <p className="text-carbon/60">Cargando…</p>;
  }

  const hotelRequired = selection.packageType ? packageRequiresHotel(selection.packageType) : false;
  const flightRequired = selection.packageType ? packageRequiresFlight(selection.packageType) : false;

  const showPackageType = Boolean(selection.buyerCountry);
  const showTravelers = showPackageType && Boolean(selection.packageType);
  const showTickets = showTravelers && Boolean(selection.partySize);
  const allTicketsSelected = quote.events.every((event) => {
    const options = quote.ticketOptionsByEvent[event.id] ?? [];
    return Boolean(selection.ticketSelections[event.id]) || options.length === 1;
  });
  const showNights = showTickets && allTicketsSelected && hotelRequired;
  const showHotel = showNights && Boolean(selection.nights);
  // TICKET_HOTEL_FLIGHT is the only modality that ever requires a flight,
  // and it always requires a hotel too — so the flight/airport steps only
  // ever unlock once a valid hotel has actually been picked.
  const showFlightGate = flightRequired && showHotel && Boolean(selection.hotelOfferId);
  const showAirport = showFlightGate && !quote.flightAvailability.blocked;
  const showOutboundFlightStep = showFlightGate && (quote.flightAvailability.blocked || Boolean(selection.originAirport));
  // Vuelta only appears once ida has been picked — two distinct,
  // sequential steps, never one combined block (§10). Once reached, it
  // must stay visible even if the customer later changes ida's daypart
  // preference (which clears only outboundLegId, forcing a fresh outbound
  // pick) — checking returnLegId too means an already-chosen return leg,
  // and the whole vuelta step, is never hidden by an ida-only change
  // (§11: changing one must never make the other's options disappear).
  const showReturnFlightStep = showOutboundFlightStep && !quote.flightAvailability.blocked && (Boolean(selection.outboundLegId) || Boolean(selection.returnLegId));
  const readyToRevalidate = quote.price.missing.length === 0 && Boolean(selection.partySize);

  const requiredTravelerFields = quote.trip.requiredTravelerFields;
  const travelerNames = travelers.map((t) => `${t.firstName} ${t.lastName}`.trim());
  const roomAssignments = hotelRequired && quote.roomMix && selection.partySize ? assignTravelersToRooms(selection.partySize, quote.roomMix) : [];
  const canPay = isBuyerFormComplete(buyer) && isAtuAireTravelersComplete(travelers, requiredTravelerFields);

  return (
    <div className="grid gap-8 pb-24 lg:grid-cols-[1fr_360px] lg:pb-0">
      <div className="space-y-6">
        <EventsHeader events={quote.events} />

        <CountryStep value={selection.buyerCountry} onSelect={selectCountry} />

        {showPackageType ? <PackageTypeStep options={quote.packageTypeOptions} selected={selection.packageType} onSelect={selectPackageType} /> : null}

        {showTravelers ? (
          <TravelersStep
            partySize={selection.partySize}
            limits={quote.partySizeLimits}
            onChange={setPartySize}
          />
        ) : null}

        {showTickets ? (
          <TicketStep events={quote.events} optionsByEvent={quote.ticketOptionsByEvent} selections={selection.ticketSelections} onSelect={selectTicket} />
        ) : null}

        {showNights ? <NightsStep nights={selection.nights} onSelect={(nights) => setSelection((s) => ({ ...s, nights, hotelOfferId: null }))} /> : null}

        {showHotel ? (
          <HotelStep options={quote.hotelOptions} selectedId={selection.hotelOfferId} onSelect={(hotelOfferId) => setSelection((s) => ({ ...s, hotelOfferId }))} />
        ) : null}

        {showAirport ? <AirportStep origins={quote.eligibleOrigins} selected={selection.originAirport} onSelect={selectOrigin} /> : null}

        {showOutboundFlightStep ? (
          <OutboundFlightStep
            quote={quote}
            preference={selection.outboundPreference}
            legId={selection.outboundLegId}
            onChangePreference={(outboundPreference: FlightDaypartPreference) => setSelection((s) => ({ ...s, outboundPreference, outboundLegId: null }))}
            onSelectLeg={(outboundLegId) => setSelection((s) => ({ ...s, outboundLegId }))}
          />
        ) : null}

        {showReturnFlightStep ? (
          <ReturnFlightStep
            quote={quote}
            preference={selection.returnPreference}
            legId={selection.returnLegId}
            onChangePreference={(returnPreference: FlightDaypartPreference) => setSelection((s) => ({ ...s, returnPreference, returnLegId: null }))}
            onSelectLeg={(returnLegId) => setSelection((s) => ({ ...s, returnLegId }))}
          />
        ) : null}

        {readyToRevalidate ? (
          <section className="rounded-sm border border-carbon/15 bg-white p-5">
            <h2 className="font-display mb-3 text-lg uppercase">Revisar reserva</h2>
            {priceChangedNotice ? <p className="mb-3 rounded-sm bg-stamp/10 p-3 text-sm text-stamp">{priceChangedNotice}</p> : null}
            {confirmed ? (
              <>
                <p className="mb-3 text-sm text-carbon/70">Hemos revalidado precio y disponibilidad. Todo listo.</p>
                <div className="mb-4">
                  <BuyerStep value={buyer} onChange={setBuyer} />
                </div>
                <div className="mb-4">
                  <TravelerDetailsStep travelers={travelers} requiredFields={requiredTravelerFields} onChange={updateTraveler} />
                </div>
                {hotelRequired ? (
                  <div className="mb-4">
                    <RoomingStep assignments={roomAssignments} travelerNames={travelerNames} />
                  </div>
                ) : null}
                {paymentError ? <p className="mb-3 rounded-sm bg-stamp/10 p-3 text-sm text-stamp">{paymentError}</p> : null}
                <Button onClick={handlePay} disabled={paying || !canPay}>
                  {paying ? "Procesando pago…" : "Continuar al pago"}
                </Button>
              </>
            ) : (
              <Button variant="secondary" onClick={handleRevalidate} disabled={revalidating}>
                {revalidating ? "Comprobando disponibilidad…" : "Revisar precio y disponibilidad"}
              </Button>
            )}
          </section>
        ) : null}
      </div>

      <div className="hidden lg:block">
        <div className="sticky top-6">
          <SummarySidebar quote={quote} selection={selection} />
        </div>
      </div>

      <MobileSummaryBar quote={quote} />
    </div>
  );
}
