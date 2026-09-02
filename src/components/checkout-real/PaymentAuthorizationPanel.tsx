"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { loadStripe, type Stripe as StripeJs } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/Button";
import { startPaymentAuthorization, getPaymentAuthorizationStatus } from "@/server/actions/real-checkout-payment";

/**
 * Fase 3A §9/§10/§18/§19 — the real Stripe TEST Payment Element,
 * replacing ReadyToPaySummary's old disabled placeholder button. This is
 * the ONLY place in the app that ever touches the Stripe.js SDK; it
 * never receives or handles a raw card number/CVC itself — Stripe's own
 * iframe-hosted Payment Element does, and only client_secret (fetched
 * once via the accessToken-gated startPaymentAuthorization server
 * action) ever reaches this component.
 *
 * On mount it ALWAYS asks the server what stage this attempt is
 * actually in (getPaymentAuthorizationStatus) before deciding what to
 * render — the same entry point whether this is the very first mount
 * right after CONTINUAR or a page refresh/3DS redirect return (§17):
 * the browser never decides for itself whether a payment happened.
 *
 * §19 — once authorized, this shows ONLY a dev-only barrier message
 * ("pago autorizado en Stripe TEST, la reserva de proveedores sigue
 * desactivada en esta fase") — never "reserva confirmada", never a
 * Booking/Mi Viaje reference, because neither exists yet in this phase.
 */

let stripePromise: Promise<StripeJs | null> | null = null;
function getStripePromise(publishableKey: string): Promise<StripeJs | null> {
  if (!stripePromise) stripePromise = loadStripe(publishableKey);
  return stripePromise;
}

type Stage = "checking" | "starting" | "form" | "submitting" | "authorized" | "error";

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

      if (status.stage === "authorized") {
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

  if (stage === "checking" || stage === "starting") {
    return <p className="text-sm text-carbon/70">Preparando el pago...</p>;
  }

  if (stage === "authorized") {
    // §19 — dev-only barrier copy. Never "reserva confirmada" — no
    // Booking/fulfillment exists in this phase.
    return (
      <div data-testid="payment-authorized" className="border border-carbon/20 bg-ivory p-4 text-sm">
        <p className="font-semibold">Pago autorizado correctamente en Stripe TEST.</p>
        <p className="text-carbon/70">La reserva de proveedores todavía está desactivada en esta fase.</p>
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

  return null;
}
