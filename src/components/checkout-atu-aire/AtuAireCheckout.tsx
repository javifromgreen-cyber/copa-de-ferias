"use client";

import { useEffect, useState } from "react";
import { getAtuAireCheckoutQuote } from "@/server/actions/atu-aire-checkout";
import { packageRequiresHotel, packageRequiresFlight } from "@/lib/checkout-atu-aire/packageRequirements";
import { DEFAULT_SELECTION, type AtuAireQuote, type AtuAireSelection, type FlightDaypartPreference } from "@/lib/checkout-atu-aire/types";
import { EventsHeader } from "./EventsHeader";
import { PackageTypeStep } from "./PackageTypeStep";
import { TravelersStep } from "./TravelersStep";
import { TicketStep } from "./TicketStep";
import { NightsStep } from "./NightsStep";
import { HotelStep } from "./HotelStep";
import { FlightStep } from "./FlightStep";
import { SummarySidebar } from "./SummarySidebar";
import { MobileSummaryBar } from "./MobileSummaryBar";
import { Button } from "@/components/ui/Button";
import type { PackageType } from "@prisma/client";

/**
 * Reconciles a selection against the just-fetched quote: a choice that
 * depended on something that changed (party size invalidating a hotel,
 * a preference change dropping a concrete flight offer) is cleared —
 * everything else survives untouched (§21). Returns the same object
 * reference when nothing needs to change, so callers can skip a refetch.
 */
function reconcile(selection: AtuAireSelection, quote: AtuAireQuote): AtuAireSelection {
  let next = selection;

  if (next.hotelOfferId) {
    const stillValid = quote.hotelOptions.find((h) => h.offer.id === next.hotelOfferId && h.valid);
    if (!stillValid) next = { ...next, hotelOfferId: null };
  }
  if (next.flightOfferId) {
    const stillThere = quote.flightOffers.find((f) => f.id === next.flightOfferId);
    if (!stillThere) next = { ...next, flightOfferId: null };
  }

  return next;
}

export function AtuAireCheckout({ tripSlug }: { tripSlug: string }) {
  const [selection, setSelection] = useState<AtuAireSelection>(DEFAULT_SELECTION);
  const [quote, setQuote] = useState<AtuAireQuote | null>(null);
  const [error, setError] = useState("");
  const [revalidating, setRevalidating] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [priceChangedNotice, setPriceChangedNotice] = useState<string | null>(null);

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
      const reconciled = reconcile(selection, result.quote);
      if (reconciled !== selection) setSelection(reconciled);
      setConfirmed(false);
    });
    return () => {
      cancelled = true;
    };
  }, [tripSlug, selection]);

  function selectPackageType(packageType: PackageType) {
    setSelection((s) => ({
      ...s,
      packageType,
      nights: packageRequiresHotel(packageType) ? s.nights : null,
      hotelOfferId: packageRequiresHotel(packageType) ? s.hotelOfferId : null,
      outboundPreference: packageRequiresFlight(packageType) ? s.outboundPreference : "ANY",
      returnPreference: packageRequiresFlight(packageType) ? s.returnPreference : "ANY",
      flightOfferId: packageRequiresFlight(packageType) ? s.flightOfferId : null,
    }));
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
    const reconciled = reconcile(selection, result.quote);
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

  if (error) {
    return <p className="rounded-sm bg-stamp/10 p-4 text-sm text-stamp">{error}</p>;
  }
  if (!quote) {
    return <p className="text-carbon/60">Cargando…</p>;
  }

  const hotelRequired = selection.packageType ? packageRequiresHotel(selection.packageType) : false;
  const flightRequired = selection.packageType ? packageRequiresFlight(selection.packageType) : false;

  const showTravelers = Boolean(selection.packageType);
  const showTicket = showTravelers && Boolean(selection.partySize);
  const showNights = showTicket && Boolean(selection.ticketCategory) && hotelRequired;
  const showHotel = showNights && Boolean(selection.nights);
  // TICKET_HOTEL_FLIGHT is the only modality that ever requires a flight,
  // and it always requires a hotel too — so the flight step only ever
  // unlocks once a valid hotel has actually been picked.
  const showFlight = flightRequired && showHotel && Boolean(selection.hotelOfferId);
  const readyToRevalidate = quote.price.missing.length === 0 && Boolean(selection.partySize);

  return (
    <div className="grid gap-8 pb-24 lg:grid-cols-[1fr_360px] lg:pb-0">
      <div className="space-y-6">
        <EventsHeader events={quote.events} />

        <PackageTypeStep options={quote.packageTypeOptions} selected={selection.packageType} onSelect={selectPackageType} />

        {showTravelers ? (
          <TravelersStep
            partySize={selection.partySize}
            limits={quote.partySizeLimits}
            onChange={(partySize) => setSelection((s) => ({ ...s, partySize }))}
          />
        ) : null}

        {showTicket ? (
          <TicketStep options={quote.ticketOptions} selected={selection.ticketCategory} onSelect={(ticketCategory) => setSelection((s) => ({ ...s, ticketCategory }))} />
        ) : null}

        {showNights ? <NightsStep nights={selection.nights} onSelect={(nights) => setSelection((s) => ({ ...s, nights, hotelOfferId: null }))} /> : null}

        {showHotel ? (
          <HotelStep options={quote.hotelOptions} selectedId={selection.hotelOfferId} onSelect={(hotelOfferId) => setSelection((s) => ({ ...s, hotelOfferId }))} />
        ) : null}

        {showFlight ? (
          <FlightStep
            quote={quote}
            outboundPreference={selection.outboundPreference}
            returnPreference={selection.returnPreference}
            flightOfferId={selection.flightOfferId}
            onChangeOutbound={(outboundPreference: FlightDaypartPreference) => setSelection((s) => ({ ...s, outboundPreference, flightOfferId: null }))}
            onChangeReturn={(returnPreference: FlightDaypartPreference) => setSelection((s) => ({ ...s, returnPreference, flightOfferId: null }))}
            onSelectFlight={(flightOfferId) => setSelection((s) => ({ ...s, flightOfferId }))}
          />
        ) : null}

        {readyToRevalidate ? (
          <section className="rounded-sm border border-carbon/15 bg-white p-5">
            <h2 className="font-display mb-3 text-lg uppercase">Revisar reserva</h2>
            {priceChangedNotice ? <p className="mb-3 rounded-sm bg-stamp/10 p-3 text-sm text-stamp">{priceChangedNotice}</p> : null}
            {confirmed ? (
              <>
                <p className="mb-3 text-sm text-carbon/70">Hemos revalidado precio y disponibilidad. Todo listo.</p>
                <Button disabled title="El pago se habilitará en el siguiente bloque">
                  Continuar al pago
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
