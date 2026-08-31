"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { prepareRealCheckoutAttempt, type RealCheckoutTicketOption } from "@/server/actions/prepare-checkout-attempt";
import type { PrepareCheckoutAttemptResult } from "@/lib/checkout-saga/prepareCheckoutAttempt";

/**
 * Fase 2 §24/§25 — the new real pre-payment flow's UI. Deliberately a
 * separate, minimal page (not a redesign of AtuAireCheckout/CheckoutFlow,
 * per §11's "no rediseñes visualmente toda la web"): CONFIGURACIÓN ->
 * CONTINUAR -> "Comprobando disponibilidad..." -> READY_TO_PAY, wired to
 * the real CheckoutAttempt saga (prepareCheckoutAttempt), stopping there —
 * no payment button actually charges anything.
 *
 * Scope of this prototype: TICKET_ONLY is fully interactive end-to-end
 * (this is also what the new e2e coverage exercises — see
 * tests/e2e/real-checkout-ticket-only.spec.ts). Entrada+Hotel and
 * Entrada+Hotel+Vuelo are fully implemented and tested at the backend
 * (prepareCheckoutAttempt already handles both — see
 * tests/unit/prepare-checkout-attempt.test.ts), but this prototype page
 * does not yet include a real Nuitee/Duffel search-and-select UI for
 * them — building that picker (ida/vuelta steps, hotel room cards) is
 * deferred; the options are shown disabled with an explanatory note
 * rather than half-built.
 */
type Traveler = { firstName: string; lastName: string };

export function RealCheckoutPrototype({ tripSlug, ticketOptions }: { tripSlug: string; ticketOptions: RealCheckoutTicketOption[] }) {
  const [partySize, setPartySize] = useState(1);
  const [ticketOfferId, setTicketOfferId] = useState(ticketOptions[0]?.ticketOfferId ?? "");
  const [travelers, setTravelers] = useState<Traveler[]>([{ firstName: "", lastName: "" }]);
  const [status, setStatus] = useState<"idle" | "checking" | "ready" | "error">("idle");
  const [result, setResult] = useState<PrepareCheckoutAttemptResult | null>(null);

  function setPartySizeAndTravelers(next: number) {
    setPartySize(next);
    setTravelers((prev) => {
      const copy = [...prev];
      while (copy.length < next) copy.push({ firstName: "", lastName: "" });
      copy.length = next;
      return copy;
    });
  }

  async function handleContinuar() {
    setStatus("checking");
    setResult(null);
    const res = await prepareRealCheckoutAttempt({
      tripSlug,
      packageType: "TICKET_ONLY",
      partySize,
      travelers,
      ticketOfferId,
      ticketQuantity: 1,
    });
    setResult(res);
    setStatus(res.ok ? "ready" : "error");
  }

  if (ticketOptions.length === 0) {
    return <p className="text-carbon/70">Este producto todavía no tiene entradas configuradas.</p>;
  }

  if (status === "ready" && result?.ok) {
    const snapshot = result.finalQuoteSnapshot;
    return (
      <div data-testid="ready-to-pay" className="max-w-xl space-y-6 border border-carbon/20 p-6">
        <h2 className="font-display text-2xl uppercase">Listo para pagar</h2>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-carbon/70">Viajeros</dt>
            <dd>{snapshot.travelersCount}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-carbon/70">Entrada</dt>
            <dd>
              {snapshot.ticket[0]?.category} × {snapshot.ticket[0]?.quantity}
            </dd>
          </div>
          {snapshot.hotel && (
            <div className="flex justify-between">
              <dt className="text-carbon/70">Hotel</dt>
              <dd>{snapshot.hotel.name}</dd>
            </div>
          )}
          {snapshot.flight && (
            <div className="flex justify-between">
              <dt className="text-carbon/70">Vuelo ida y vuelta</dt>
              <dd>
                {(snapshot.flight.pricePerPerson).toFixed(2)} {snapshot.flight.currency}/persona
              </dd>
            </div>
          )}
          <div className="flex justify-between border-t border-carbon/20 pt-2 font-semibold">
            <dt>Total</dt>
            <dd data-testid="pvp-total">
              {snapshot.commercial.pvpTotal.toFixed(2)} {snapshot.commercial.currency}
            </dd>
          </div>
        </dl>
        <Button disabled title="Pago todavía no disponible en sandbox">
          Pago todavía no disponible en sandbox
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-xl space-y-8">
      <div>
        <h2 className="font-display mb-3 text-xl uppercase">Modalidad</h2>
        <div className="flex flex-wrap gap-3 text-sm">
          <span className="rounded-sm border border-carbon bg-carbon px-4 py-2 text-ivory">Entrada</span>
          <span className="rounded-sm border border-carbon/30 px-4 py-2 text-carbon/40" title="Selección real de hotel: próxima iteración de este flujo">
            Entrada + Hotel
          </span>
          <span className="rounded-sm border border-carbon/30 px-4 py-2 text-carbon/40" title="Selección real de vuelo: próxima iteración de este flujo">
            Entrada + Hotel + Vuelo
          </span>
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

      <div className="space-y-4">
        <h2 className="font-display text-xl uppercase">Datos de cada viajero</h2>
        {travelers.map((traveler, i) => (
          <div key={i} role="group" aria-label={`Viajero ${i + 1}`} className="grid grid-cols-2 gap-3">
            <input
              aria-label={`Nombre viajero ${i + 1}`}
              placeholder="Nombre"
              value={traveler.firstName}
              onChange={(e) =>
                setTravelers((prev) => prev.map((t, idx) => (idx === i ? { ...t, firstName: e.target.value } : t)))
              }
              className="border border-carbon/30 px-3 py-2"
            />
            <input
              aria-label={`Apellidos viajero ${i + 1}`}
              placeholder="Apellidos"
              value={traveler.lastName}
              onChange={(e) =>
                setTravelers((prev) => prev.map((t, idx) => (idx === i ? { ...t, lastName: e.target.value } : t)))
              }
              className="border border-carbon/30 px-3 py-2"
            />
          </div>
        ))}
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
