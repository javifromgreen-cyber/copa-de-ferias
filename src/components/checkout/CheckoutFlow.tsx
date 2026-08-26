"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { createBooking } from "@/server/actions/booking";
import { formatCurrency } from "@/lib/utils";
import { track } from "@/lib/analytics/events";

type TravelerForm = {
  firstName: string;
  lastName: string;
  roomPreference: "share_with_group" | "share_same_sex" | "single";
};

type TripInfo = {
  id: string;
  slug: string;
  name: string;
  price: number;
  currency: string;
  singleSupplement: number;
  spotsLeft: number;
  isDemo: boolean;
  origins: string[];
};

const ROOM_OPTIONS: { value: TravelerForm["roomPreference"]; label: string; hint: string }[] = [
  {
    value: "share_with_group",
    label: "Comparto con alguien de mi reserva",
    hint: "Viajo con alguien de mi grupo y queremos compartir habitación.",
  },
  {
    value: "share_same_sex",
    label: "Me da igual compartir",
    hint: "Comparto con otro participante de mi mismo sexo.",
  },
  { value: "single", label: "Habitación individual", hint: "Suplemento aparte." },
];

const STEP_LABELS = ["Viajeros", "Datos de cada viajero", "Comprador", "Pago"];

export function CheckoutFlow({ trip, isSimulation }: { trip: TripInfo; isSimulation: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [count, setCount] = useState(1);
  const [travelers, setTravelers] = useState<TravelerForm[]>([
    { firstName: "", lastName: "", roomPreference: "share_with_group" },
  ]);
  const [buyer, setBuyer] = useState({
    buyerFirstName: "",
    buyerLastName: "",
    buyerEmail: "",
    buyerPhone: "",
    originCity: trip.origins[0] ?? "",
    billingAddress: "",
  });
  const [paymentMethod, setPaymentMethod] = useState<"card" | "bizum" | "klarna" | "paypal">("card");
  const [acceptedConditions, setAcceptedConditions] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const maxCount = Math.min(trip.spotsLeft, 10);

  const singleRooms = travelers.filter((t) => t.roomPreference === "single").length;
  const total = trip.price * count + trip.singleSupplement * singleRooms;

  function setTravelerCount(next: number) {
    setCount(next);
    setTravelers((prev) => {
      const arr = [...prev];
      while (arr.length < next) arr.push({ firstName: "", lastName: "", roomPreference: "share_with_group" });
      return arr.slice(0, next);
    });
  }

  function updateTraveler(index: number, patch: Partial<TravelerForm>) {
    setTravelers((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  }

  const canGoStep1 = count >= 1 && count <= maxCount;
  const canGoStep2 = travelers.every((t) => t.firstName.trim() && t.lastName.trim());
  const canGoStep3 =
    buyer.buyerFirstName.trim() &&
    buyer.buyerLastName.trim() &&
    /.+@.+\..+/.test(buyer.buyerEmail) &&
    buyer.buyerPhone.trim().length >= 6 &&
    buyer.originCity.trim();

  const stepValid = useMemo(() => {
    if (step === 0) return canGoStep1;
    if (step === 1) return canGoStep2;
    if (step === 2) return canGoStep3;
    return acceptedConditions;
  }, [step, canGoStep1, canGoStep2, canGoStep3, acceptedConditions]);

  function next() {
    if (step === 0) track("booking_start", { tripId: trip.id, travelers: count });
    setStep((s) => Math.min(s + 1, STEP_LABELS.length - 1));
  }
  function back() {
    setStep((s) => Math.max(s - 1, 0));
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError("");
    track("checkout_view", { tripId: trip.id });
    track("payment_method_selected", { tripId: trip.id, method: paymentMethod });

    const result = await createBooking({
      tripId: trip.id,
      originCity: buyer.originCity,
      buyerFirstName: buyer.buyerFirstName,
      buyerLastName: buyer.buyerLastName,
      buyerEmail: buyer.buyerEmail,
      buyerPhone: buyer.buyerPhone,
      billingAddress: buyer.billingAddress,
      travelers,
      acceptedConditions: true,
      paymentMethod,
    });

    if (result.ok) {
      track("booking_completed", { tripId: trip.id });
      router.push(`/confirmacion/${result.reference}?token=${result.accessToken}`);
    } else {
      track("booking_failed", { tripId: trip.id });
      setError(result.error);
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
      <div>
        <ol className="mb-8 flex flex-wrap gap-x-6 gap-y-2 text-xs tracking-wide uppercase">
          {STEP_LABELS.map((label, i) => (
            <li key={label} className={i === step ? "font-semibold text-carbon" : "text-carbon/40"}>
              {i + 1}. {label}
            </li>
          ))}
        </ol>

        {step === 0 ? (
          <section>
            <h2 className="font-display mb-4 text-xl uppercase">¿Cuántos viajeros sois?</h2>
            <p className="mb-4 text-sm text-carbon/60">Quedan {trip.spotsLeft} plazas disponibles.</p>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => setTravelerCount(Math.max(1, count - 1))}
                className="h-10 w-10 rounded-sm border border-carbon/30 text-lg"
                aria-label="Restar viajero"
              >
                −
              </button>
              <span className="w-8 text-center text-lg font-medium">{count}</span>
              <button
                type="button"
                onClick={() => setTravelerCount(Math.min(maxCount, count + 1))}
                className="h-10 w-10 rounded-sm border border-carbon/30 text-lg"
                aria-label="Sumar viajero"
              >
                +
              </button>
            </div>
          </section>
        ) : null}

        {step === 1 ? (
          <section className="space-y-8">
            <h2 className="font-display text-xl uppercase">Datos de cada viajero</h2>
            {travelers.map((t, i) => (
              <fieldset key={i} className="rounded-sm border border-carbon/15 p-4">
                <legend className="px-1 text-sm font-medium">Viajero {i + 1}</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-xs tracking-wide uppercase">Nombre</span>
                    <input
                      value={t.firstName}
                      onChange={(e) => updateTraveler(i, { firstName: e.target.value })}
                      className="w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm"
                      required
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs tracking-wide uppercase">Apellidos</span>
                    <input
                      value={t.lastName}
                      onChange={(e) => updateTraveler(i, { lastName: e.target.value })}
                      className="w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm"
                      required
                    />
                  </label>
                </div>
                <div className="mt-3">
                  <p className="mb-2 text-xs tracking-wide uppercase">Habitación</p>
                  <div className="space-y-2">
                    {ROOM_OPTIONS.map((opt) => (
                      <label key={opt.value} className="flex items-start gap-2 text-sm">
                        <input
                          type="radio"
                          name={`room-${i}`}
                          checked={t.roomPreference === opt.value}
                          onChange={() => updateTraveler(i, { roomPreference: opt.value })}
                          className="mt-1"
                        />
                        <span>
                          <span className="font-medium">{opt.label}</span>
                          {opt.value === "single" ? (
                            <span className="text-carbon/50"> (+{formatCurrency(trip.singleSupplement, trip.currency)})</span>
                          ) : null}
                          <span className="block text-xs text-carbon/50">{opt.hint}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </fieldset>
            ))}
          </section>
        ) : null}

        {step === 2 ? (
          <section className="space-y-4">
            <h2 className="font-display text-xl uppercase">Datos del comprador</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs tracking-wide uppercase">Nombre</span>
                <input
                  value={buyer.buyerFirstName}
                  onChange={(e) => setBuyer((b) => ({ ...b, buyerFirstName: e.target.value }))}
                  className="w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs tracking-wide uppercase">Apellidos</span>
                <input
                  value={buyer.buyerLastName}
                  onChange={(e) => setBuyer((b) => ({ ...b, buyerLastName: e.target.value }))}
                  className="w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs tracking-wide uppercase">Email</span>
                <input
                  type="email"
                  value={buyer.buyerEmail}
                  onChange={(e) => setBuyer((b) => ({ ...b, buyerEmail: e.target.value }))}
                  className="w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs tracking-wide uppercase">Teléfono</span>
                <input
                  value={buyer.buyerPhone}
                  onChange={(e) => setBuyer((b) => ({ ...b, buyerPhone: e.target.value }))}
                  className="w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs tracking-wide uppercase">Ciudad de salida</span>
                {trip.origins.length > 0 ? (
                  <select
                    value={buyer.originCity}
                    onChange={(e) => setBuyer((b) => ({ ...b, originCity: e.target.value }))}
                    className="w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm"
                  >
                    {trip.origins.map((city) => (
                      <option key={city} value={city}>
                        {city}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={buyer.originCity}
                    onChange={(e) => setBuyer((b) => ({ ...b, originCity: e.target.value }))}
                    className="w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm"
                  />
                )}
              </label>
              <label className="block">
                <span className="mb-1 block text-xs tracking-wide uppercase">Dirección de facturación (opcional)</span>
                <input
                  value={buyer.billingAddress}
                  onChange={(e) => setBuyer((b) => ({ ...b, billingAddress: e.target.value }))}
                  className="w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm"
                />
              </label>
            </div>
          </section>
        ) : null}

        {step === 3 ? (
          <section className="space-y-5">
            <h2 className="font-display text-xl uppercase">Pago</h2>
            {isSimulation ? (
              <p className="rounded-sm border border-stamp/40 bg-stamp/10 p-3 text-sm text-stamp">
                Modo demo: esto es una simulación. No se realizará ningún cargo real.
              </p>
            ) : null}

            <div className="space-y-2">
              {[
                { value: "card" as const, label: "Tarjeta" },
                { value: "bizum" as const, label: "Bizum" },
                { value: "klarna" as const, label: "Klarna" },
                { value: "paypal" as const, label: "PayPal" },
              ].map((opt) => (
                <label key={opt.value} className="flex items-center gap-2 rounded-sm border border-carbon/15 p-3 text-sm">
                  <input
                    type="radio"
                    name="payment"
                    checked={paymentMethod === opt.value}
                    onChange={() => setPaymentMethod(opt.value)}
                  />
                  {opt.label}
                </label>
              ))}
            </div>

            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={acceptedConditions}
                onChange={(e) => setAcceptedConditions(e.target.checked)}
                className="mt-1"
              />
              <span>
                He leído y acepto las{" "}
                <a href="/condiciones" target="_blank" rel="noreferrer" className="underline">
                  condiciones del viaje
                </a>
                .
              </span>
            </label>

            {error ? <p className="text-sm text-stamp">{error}</p> : null}
          </section>
        ) : null}

        <div className="mt-8 flex gap-3">
          {step > 0 ? (
            <Button variant="secondary" onClick={back} disabled={submitting}>
              Atrás
            </Button>
          ) : null}
          {step < STEP_LABELS.length - 1 ? (
            <Button onClick={next} disabled={!stepValid}>
              Continuar
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={!stepValid || submitting}>
              {submitting ? "Procesando…" : isSimulation ? "Simular pago" : "Pagar ahora"}
            </Button>
          )}
        </div>
      </div>

      <aside className="h-fit rounded-sm border border-carbon/15 p-6">
        <h3 className="font-display mb-4 text-sm tracking-widest uppercase">Resumen</h3>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt>
              {count} × {formatCurrency(trip.price, trip.currency)}
            </dt>
            <dd>{formatCurrency(trip.price * count, trip.currency)}</dd>
          </div>
          {singleRooms > 0 ? (
            <div className="flex justify-between">
              <dt>
                {singleRooms} × suplemento individual
              </dt>
              <dd>{formatCurrency(trip.singleSupplement * singleRooms, trip.currency)}</dd>
            </div>
          ) : null}
        </dl>
        <div className="mt-4 flex justify-between border-t border-carbon/15 pt-4 text-base font-semibold">
          <span>Total</span>
          <span>{formatCurrency(total, trip.currency)}</span>
        </div>
      </aside>
    </div>
  );
}
