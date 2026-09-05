"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { loadStripe, type Stripe as StripeJs } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/Button";
import { startPaymentAuthorization, getPaymentAuthorizationStatus, confirmRealCheckout } from "@/server/actions/real-checkout-payment";

/**
 * Fase 3A §9/§10/§18/§19, extended Fase 3B.1 — the real Stripe TEST
 * Payment Element, replacing ReadyToPaySummary's old disabled placeholder
 * button. This is the ONLY place in the app that ever touches the
 * Stripe.js SDK; it never receives or handles a raw card number/CVC
 * itself — Stripe's own iframe-hosted Payment Element does, and only
 * client_secret (fetched once via the accessToken-gated
 * startPaymentAuthorization server action) ever reaches this component.
 *
 * On mount it ALWAYS asks the server what stage this attempt is
 * actually in (getPaymentAuthorizationStatus) before deciding what to
 * render — the same entry point whether this is the very first mount
 * right after CONTINUAR or a page refresh/3DS redirect return (§17):
 * the browser never decides for itself whether a payment happened.
 *
 * Fase 3B.1 §1/§20 — once authorized, this no longer stops at a dev-only
 * barrier: it immediately calls confirmRealCheckout (real-checkout-payment.ts),
 * which drives Stripe TEST capture + local finalization to CONFIRMED
 * (capture.ts), then shows "Reserva confirmada" with a link to Mi Viaje.
 * TICKET_HOTEL/TICKET_HOTEL_FLIGHT (not fulfillable yet) surface as an
 * explicit blocked message instead — never silently stuck, never a fake
 * "confirmada".
 */

let stripePromise: Promise<StripeJs | null> | null = null;
function getStripePromise(publishableKey: string): Promise<StripeJs | null> {
  if (!stripePromise) stripePromise = loadStripe(publishableKey);
  return stripePromise;
}

type Stage = "checking" | "starting" | "form" | "authorized" | "confirmed" | "error";

function PaymentForm({ accessToken, onResolved }: { accessToken: string; onResolved: (stage: Stage, message?: string) => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);

    const returnUrl = new URL(window.location.href);
    returnUrl.searchParams.set("attempt", accessToken);

    // redirect: "if_required" — card payments normally resolve in-page
    // (including a 3DS challenge, which Stripe.js hosts inline); only a
    // genuinely redirect-based method would leave the page, and this
    // build restricts payment methods to `card` only (§3), so that path
    // is not expected in practice — return_url is still supplied for
    // correctness if Stripe ever needs it.
    const { error: confirmError } = await stripe.confirmPayment({ elements, confirmParams: { return_url: returnUrl.toString() }, redirect: "if_required" });

    if (confirmError) {
      // §10 — a declined card or validation error is never treated as a
      // fatal outcome for the whole checkout attempt: the SAME
      // PaymentIntent/Payment Element stays usable for a retry.
      setError(confirmError.message ?? "El pago no se ha podido completar. Puedes intentarlo de nuevo.");
      setSubmitting(false);
      return;
    }

    // §17 — never trust the client-side confirmPayment result alone as
    // proof of authorization: ask the server for the authoritative state.
    const status = await getPaymentAuthorizationStatus(accessToken);
    if (status.stage === "authorized") {
      onResolved("authorized");
    } else if (status.stage === "authorizing") {
      setSubmitting(false);
      setError(null);
    } else {
      onResolved("error", "El pago no se pudo verificar. Actualiza la página para comprobar el estado.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      {error && <p className="text-sm text-red-700">{error}</p>}
      <Button type="submit" disabled={!stripe || !elements || submitting}>
        {submitting ? "Procesando pago..." : "Pagar"}
      </Button>
    </form>
  );
}

export function PaymentAuthorizationPanel({ accessToken, totalLabel }: { accessToken: string; totalLabel: string }) {
  const [stage, setStage] = useState<Stage>("checking");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [publishableKey, setPublishableKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [bookingInfo, setBookingInfo] = useState<{ accessToken: string; reference: string } | null>(null);
  // React dev-mode StrictMode intentionally double-invokes this effect
  // (mount -> cleanup -> mount again, synchronously, before any `await`
  // inside `begin()` below has a chance to resume). Unlike a pure
  // render, `begin()` calls REAL server actions (startPaymentAuthorization
  // can create a Stripe PaymentIntent), so it must actually run only
  // once per accessToken — `startedForToken` guarantees that. `mountedRef`
  // is a SEPARATE concern: it's reset to true at the top of every effect
  // invocation (including StrictMode's second, "real" one) and only
  // cleared on an actual unmount, so the ONE in-flight begin() call from
  // the first invocation still correctly resumes and updates state once
  // the second invocation confirms the component is still mounted —
  // never permanently stuck because a dev-mode-only intermediate cleanup
  // fired first.
  const startedForToken = useRef<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    async function begin() {
      const status = await getPaymentAuthorizationStatus(accessToken);
      if (!mountedRef.current) return;

      if (status.stage === "confirmed") {
        // §11 — the browser may have closed before ever seeing this;
        // reconstructed straight from the DB, no side effects.
        setBookingInfo({ accessToken: status.bookingAccessToken, reference: status.reference });
        setStage("confirmed");
        return;
      }
      if (status.stage === "blocked") {
        setStage("error");
        setMessage(status.message);
        return;
      }
      if (status.stage === "authorized") {
        // Triggers the confirm effect below — never a static dead end.
        setStage("authorized");
        return;
      }
      if (status.stage !== "ready" && status.stage !== "authorizing") {
        setStage("error");
        setMessage("Este intento de compra ya no está disponible para pagar.");
        return;
      }

      setStage("starting");
      const result = await startPaymentAuthorization(accessToken);
      if (!mountedRef.current) return;
      if (!result.ok) {
        setStage("error");
        setMessage(result.error);
        return;
      }
      if (result.status === "already_authorized") {
        setStage("authorized");
        return;
      }
      setClientSecret(result.clientSecret);
      setPublishableKey(result.publishableKey);
      setStage("form");
    }

    if (startedForToken.current !== accessToken) {
      startedForToken.current = accessToken;
      void begin();
    }

    return () => {
      mountedRef.current = false;
    };
  }, [accessToken]);

  const stripePromiseMemo = useMemo(() => (publishableKey ? getStripePromise(publishableKey) : null), [publishableKey]);

  // Fase 3B.1 §1/§11/§12 — the single trigger for capture+finalization:
  // fires whenever `stage` becomes "authorized", whether that came from
  // `begin()` above (mount-time resume — §11's refresh scenario) or from
  // PaymentForm's onResolved("authorized") right after a fresh card
  // confirmation. `confirmStartedForToken` guards it exactly like
  // `startedForToken` guards `begin()` above — StrictMode's dev-mode
  // double-invoke must still only ever call confirmRealCheckout once per
  // accessToken (it is NOT re-safe to call twice concurrently for
  // wholly unrelated reasons — it IS idempotent, per capture.ts's own
  // doc comment — but there is no reason to double the network round
  // trip either).
  const confirmStartedForToken = useRef<string | null>(null);
  useEffect(() => {
    if (stage !== "authorized") return;

    async function confirm() {
      const result = await confirmRealCheckout(accessToken);
      if (!mountedRef.current) return;
      if (!result.ok) {
        setStage("error");
        setMessage(result.error);
        return;
      }
      if (result.stage === "confirmed") {
        setBookingInfo({ accessToken: result.bookingAccessToken, reference: result.reference });
        setStage("confirmed");
        return;
      }
      // "processing" — capture/finalization is in a safe-to-retry
      // ambiguous state (§4/§13): never silent, and never guessed at as
      // success or failure.
      setStage("error");
      setMessage("Estamos verificando tu pago con Stripe. Recarga esta página en unos segundos para comprobar el estado.");
    }

    if (confirmStartedForToken.current !== accessToken) {
      confirmStartedForToken.current = accessToken;
      void confirm();
    }
  }, [stage, accessToken]);

  // Defense in depth: `begin()` above should never call setStage("form")
  // without both clientSecret and publishableKey already set (the server
  // action itself now refuses to return "action_required" without a
  // usable publishable key — see payment.ts's requireUsablePublishableKey).
  // If that ever regresses anyway, this never goes silent: the render
  // fallback below always shows an explicit error instead of null, and
  // this effect logs which piece was missing — booleans only, never the
  // actual key/secret values — so it's safe to leave in the browser
  // console for diagnosis.
  useEffect(() => {
    if (stage !== "form") return;
    if (clientSecret && publishableKey && stripePromiseMemo) return;
    console.error("[PaymentAuthorizationPanel] reached \"form\" stage without everything needed to render it", {
      hasClientSecret: Boolean(clientSecret),
      hasPublishableKey: Boolean(publishableKey),
      publishableKeyHasValidPrefix: Boolean(publishableKey?.startsWith("pk_test_")),
      hasStripePromise: Boolean(stripePromiseMemo),
    });
  }, [stage, clientSecret, publishableKey, stripePromiseMemo]);

  if (stage === "checking" || stage === "starting") {
    return <p className="text-sm text-carbon/70">Preparando el pago...</p>;
  }

  if (stage === "authorized") {
    // Transient — confirmRealCheckout is already in flight (see the
    // effect above) and will move this to "confirmed" or "error". Never
    // a static "pago autorizado" dead end: capture+finalization now
    // follow automatically.
    return <p className="text-sm text-carbon/70">Procesando reserva...</p>;
  }

  if (stage === "confirmed" && bookingInfo) {
    return (
      <div data-testid="booking-confirmed" className="border border-carbon/20 bg-ivory p-4 text-sm">
        <p className="font-semibold">Reserva confirmada.</p>
        <p className="mb-3 text-carbon/70">Referencia {bookingInfo.reference} · pagado con Stripe TEST.</p>
        <a href={`/mi-viaje/${bookingInfo.accessToken}`} className="inline-block underline">
          Ir a Mi Viaje
        </a>
      </div>
    );
  }

  if (stage === "error") {
    return <p className="text-sm text-red-700">{message}</p>;
  }

  if (stage === "form" && clientSecret && publishableKey && stripePromiseMemo) {
    return (
      <div data-testid="payment-form" className="space-y-2">
        <p className="text-sm text-carbon/70">Total: {totalLabel}</p>
        <Elements stripe={stripePromiseMemo} options={{ clientSecret }}>
          <PaymentForm accessToken={accessToken} onResolved={(s, m) => { setStage(s); if (m) setMessage(m); }} />
        </Elements>
      </div>
    );
  }

  // Reached only if `stage` is "form" but clientSecret/publishableKey/
  // stripePromiseMemo aren't all set yet (the effect above catches this
  // one render later and formally transitions to "error"), or any other
  // unexpected Stage value — never render nothing after "Preparando el
  // pago...".
  return <p className="text-sm text-red-700">{message ?? "No se pudo preparar el formulario de pago. Recarga la página o contacta con soporte si el problema persiste."}</p>;
}
