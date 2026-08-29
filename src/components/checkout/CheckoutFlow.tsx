"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { createBooking } from "@/server/actions/booking";
import { formatCurrency } from "@/lib/utils";
import { track } from "@/lib/analytics/events";
import {
  defaultRoomAssignment,
  resizeRoomAssignment,
  isRoomAssignmentComplete,
  countSingleRooms,
  resolveTravelerRooms,
  computeRooms,
  type RoomChoice,
} from "@/lib/checkout/rooms";
import { TRAVELER_FIELD_LABELS } from "@/lib/checkout/travelerFields";
import { COUNTRIES } from "@/lib/checkout-atu-aire/countries";
import { RoomAssignmentStep } from "@/components/checkout/RoomAssignmentStep";
import { ReviewStep } from "@/components/checkout/ReviewStep";

type TravelerFull = {
  firstName: string;
  lastName: string;
  originCity: string;
  birthDate: string;
  nationality: string;
  docType: "dni" | "passport" | "";
  docNumber: string;
  docExpiry: string;
  docCountry: string;
  sex: string;
  phone: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
};

function emptyTraveler(defaultOrigin: string): TravelerFull {
  return {
    firstName: "",
    lastName: "",
    originCity: defaultOrigin,
    birthDate: "",
    nationality: "",
    docType: "",
    docNumber: "",
    docExpiry: "",
    docCountry: "",
    sex: "",
    phone: "",
    emergencyContactName: "",
    emergencyContactPhone: "",
  };
}

type TripInfo = {
  id: string;
  slug: string;
  name: string;
  subtitle: string;
  price: number;
  currency: string;
  singleSupplement: number;
  spotsLeft: number;
  isDemo: boolean;
  origins: string[];
  requiredTravelerFields: string[];
  requiresShippingAddress: boolean;
  hotelStars: number;
  ticketCategory: string;
  hasInsurance: boolean;
};

const STEP_LABELS = ["Viajeros", "Datos de cada viajero", "Habitaciones", "Comprador", "Revisión", "Pago"];

export function CheckoutFlow({ trip, isSimulation }: { trip: TripInfo; isSimulation: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [count, setCount] = useState(1);
  const [travelers, setTravelers] = useState<TravelerFull[]>([emptyTraveler(trip.origins[0] ?? "")]);
  const [roomOf, setRoomOf] = useState<RoomChoice[]>(defaultRoomAssignment(1));
  const [buyer, setBuyer] = useState({
    buyerFirstName: "",
    buyerLastName: "",
    buyerEmail: "",
    buyerPhone: "",
    billingAddress: "",
  });
  const [buyerIsTraveler, setBuyerIsTraveler] = useState(false);
  const [buyerTravelerIndex, setBuyerTravelerIndex] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<"card" | "bizum" | "klarna" | "paypal">("card");
  const [acceptedConditions, setAcceptedConditions] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const maxCount = Math.min(trip.spotsLeft, 10);

  const resolvedTravelers = useMemo(() => resolveTravelerRooms(travelers, roomOf), [travelers, roomOf]);
  const singleRooms = countSingleRooms(roomOf);
  const baseSubtotal = trip.price * count;
  const supplementSubtotal = trip.singleSupplement * singleRooms;
  const total = baseSubtotal + supplementSubtotal;

  function setTravelerCount(next: number) {
    setCount(next);
    setTravelers((prev) => {
      const arr = [...prev];
      while (arr.length < next) arr.push(emptyTraveler(trip.origins[0] ?? ""));
      return arr.slice(0, next);
    });
    setRoomOf((prev) => resizeRoomAssignment(prev, next));
  }

  function updateTraveler(index: number, patch: Partial<TravelerFull>) {
    setTravelers((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  }

  function toggleBuyerIsTraveler(checked: boolean) {
    setBuyerIsTraveler(checked);
    const t = travelers[buyerTravelerIndex] ?? travelers[0];
    if (checked && t) {
      setBuyer((b) => ({ ...b, buyerFirstName: t.firstName, buyerLastName: t.lastName }));
    }
  }

  function selectBuyerTraveler(index: number) {
    setBuyerTravelerIndex(index);
    const t = travelers[index];
    if (t) setBuyer((b) => ({ ...b, buyerFirstName: t.firstName, buyerLastName: t.lastName }));
  }

  const canGoStep1 = count >= 1 && count <= maxCount;
  const canGoStep2 = travelers.every((t) => {
    if (!t.firstName.trim() || !t.lastName.trim()) return false;
    if (trip.origins.length > 0 && !t.originCity.trim()) return false;
    return trip.requiredTravelerFields.every((key) => {
      if (key === "emergencyContact") return t.emergencyContactName.trim() && t.emergencyContactPhone.trim();
      return Boolean(t[key as keyof TravelerFull]);
    });
  });
  const canGoStep3 =
    isRoomAssignmentComplete(roomOf) &&
    roomOf.every((r, i) => r !== "share_same_sex" || travelers[i].sex.trim());
  const canGoStep4 =
    buyer.buyerFirstName.trim() &&
    buyer.buyerLastName.trim() &&
    /.+@.+\..+/.test(buyer.buyerEmail) &&
    buyer.buyerPhone.trim().length >= 6 &&
    (!trip.requiresShippingAddress || buyer.billingAddress.trim());

  const stepValid = useMemo(() => {
    if (step === 0) return canGoStep1;
    if (step === 1) return canGoStep2;
    if (step === 2) return canGoStep3;
    if (step === 3) return canGoStep4;
    if (step === 4) return true;
    return acceptedConditions;
  }, [step, canGoStep1, canGoStep2, canGoStep3, canGoStep4, acceptedConditions]);

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
      buyerFirstName: buyer.buyerFirstName,
      buyerLastName: buyer.buyerLastName,
      buyerEmail: buyer.buyerEmail,
      buyerPhone: buyer.buyerPhone,
      billingAddress: buyer.billingAddress,
      travelers: resolvedTravelers,
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

  const originCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of travelers) {
      if (!t.originCity.trim()) continue;
      counts.set(t.originCity, (counts.get(t.originCity) ?? 0) + 1);
    }
    return [...counts.entries()];
  }, [travelers]);

  const { pairs: roomPairs, unpaired: roomUnpaired } = computeRooms(roomOf);
  const roomsPendingCount = roomUnpaired.filter((i) => roomOf[i] === null).length;
  const roomsGroupShareCount = roomUnpaired.filter((i) => roomOf[i] === "share_same_sex").length;

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
            <h2 className="font-display mb-2 text-xl uppercase">¿Cuántos viajáis?</h2>
            <p className="mb-4 text-sm text-carbon/60">Puedes reservar tu plaza y las de tus acompañantes en una sola compra.</p>
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
          <section className="space-y-4">
            <div>
              <h2 className="font-display text-xl uppercase">Datos de cada viajero</h2>
              <p className="mt-1 text-sm text-carbon/60">
                Los datos que necesitamos para este viaje se piden ahora, antes de pagar — así tu reserva queda
                cerrada de una vez. Los campos marcados con * son obligatorios para este viaje.
              </p>
            </div>
            {travelers.map((t, i) => {
              const req = (key: string) => trip.requiredTravelerFields.includes(key);
              const hasDocGroup = req("docType") || req("docNumber") || req("docExpiry") || req("docCountry");
              const hasContactGroup = req("phone") || req("emergencyContact");
              return (
                <fieldset key={i} className="space-y-5 rounded-sm border border-carbon/15 p-4">
                  <legend className="px-1 text-sm font-medium">Viajero {i + 1}</legend>

                  <div>
                    <p className="mb-2 text-xs font-medium tracking-wide text-carbon/50 uppercase">Datos personales</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className="mb-1 block text-xs tracking-wide uppercase">Nombre *</span>
                        <input
                          value={t.firstName}
                          onChange={(e) => updateTraveler(i, { firstName: e.target.value })}
                          className="w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm"
                          required
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs tracking-wide uppercase">Apellidos *</span>
                        <input
                          value={t.lastName}
                          onChange={(e) => updateTraveler(i, { lastName: e.target.value })}
                          className="w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm"
                          required
                        />
                      </label>
                      {req("birthDate") ? (
                        <label className="block">
                          <span className="mb-1 block text-xs tracking-wide uppercase">
                            {TRAVELER_FIELD_LABELS.birthDate} *
                          </span>
                          <input
                            type="date"
                            value={t.birthDate}
                            onChange={(e) => updateTraveler(i, { birthDate: e.target.value })}
                            className="w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm"
                          />
                        </label>
                      ) : null}
                      {req("nationality") ? (
                        <label className="block">
                          <span className="mb-1 block text-xs tracking-wide uppercase">
                            {TRAVELER_FIELD_LABELS.nationality} *
                          </span>
                          <select
                            value={t.nationality}
                            onChange={(e) => updateTraveler(i, { nationality: e.target.value })}
                            className="w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm"
                          >
                            <option value="">Selecciona</option>
                            {COUNTRIES.map((c) => (
                              <option key={c.code} value={c.name}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-medium tracking-wide text-carbon/50 uppercase">Viaje</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className="mb-1 block text-xs tracking-wide uppercase">
                          Ciudad de salida{trip.origins.length > 0 ? " *" : ""}
                        </span>
                        {trip.origins.length > 0 ? (
                          <select
                            value={t.originCity}
                            onChange={(e) => updateTraveler(i, { originCity: e.target.value })}
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
                            value={t.originCity}
                            onChange={(e) => updateTraveler(i, { originCity: e.target.value })}
                            className="w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm"
                          />
                        )}
                      </label>
                    </div>
                  </div>

                  {hasDocGroup ? (
                    <div>
                      <p className="mb-2 text-xs font-medium tracking-wide text-carbon/50 uppercase">Documentación</p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {req("docType") ? (
                          <label className="block">
                            <span className="mb-1 block text-xs tracking-wide uppercase">
                              {TRAVELER_FIELD_LABELS.docType} *
                            </span>
                            <select
                              value={t.docType}
                              onChange={(e) => updateTraveler(i, { docType: e.target.value as TravelerFull["docType"] })}
                              className="w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm"
                            >
                              <option value="">Selecciona</option>
                              <option value="dni">DNI</option>
                              <option value="passport">Pasaporte</option>
                            </select>
                          </label>
                        ) : null}
                        {req("docNumber") ? (
                          <label className="block">
                            <span className="mb-1 block text-xs tracking-wide uppercase">
                              {TRAVELER_FIELD_LABELS.docNumber} *
                            </span>
                            <input
                              value={t.docNumber}
                              onChange={(e) => updateTraveler(i, { docNumber: e.target.value })}
                              className="w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm"
                            />
                          </label>
                        ) : null}
                        {req("docExpiry") ? (
                          <label className="block">
                            <span className="mb-1 block text-xs tracking-wide uppercase">
                              {TRAVELER_FIELD_LABELS.docExpiry} *
                            </span>
                            <input
                              type="date"
                              value={t.docExpiry}
                              onChange={(e) => updateTraveler(i, { docExpiry: e.target.value })}
                              className="w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm"
                            />
                          </label>
                        ) : null}
                        {req("docCountry") ? (
                          <label className="block">
                            <span className="mb-1 block text-xs tracking-wide uppercase">
                              {TRAVELER_FIELD_LABELS.docCountry} *
                            </span>
                            <input
                              value={t.docCountry}
                              onChange={(e) => updateTraveler(i, { docCountry: e.target.value })}
                              className="w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm"
                            />
                          </label>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {hasContactGroup ? (
                    <div>
                      <p className="mb-2 text-xs font-medium tracking-wide text-carbon/50 uppercase">Contacto</p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {req("phone") ? (
                          <label className="block">
                            <span className="mb-1 block text-xs tracking-wide uppercase">
                              {TRAVELER_FIELD_LABELS.phone} *
                            </span>
                            <input
                              value={t.phone}
                              onChange={(e) => updateTraveler(i, { phone: e.target.value })}
                              className="w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm"
                            />
                          </label>
                        ) : null}
                        {req("emergencyContact") ? (
                          <>
                            <label className="block">
                              <span className="mb-1 block text-xs tracking-wide uppercase">
                                Contacto de emergencia — nombre *
                              </span>
                              <input
                                value={t.emergencyContactName}
                                onChange={(e) => updateTraveler(i, { emergencyContactName: e.target.value })}
                                className="w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm"
                              />
                            </label>
                            <label className="block">
                              <span className="mb-1 block text-xs tracking-wide uppercase">
                                Contacto de emergencia — teléfono *
                              </span>
                              <input
                                value={t.emergencyContactPhone}
                                onChange={(e) => updateTraveler(i, { emergencyContactPhone: e.target.value })}
                                className="w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm"
                              />
                            </label>
                          </>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </fieldset>
              );
            })}
          </section>
        ) : null}

        {step === 2 ? (
          <RoomAssignmentStep
            travelers={travelers}
            roomOf={roomOf}
            onChange={setRoomOf}
            onSexChange={(i, sex) => updateTraveler(i, { sex })}
            singleSupplement={trip.singleSupplement}
            currency={trip.currency}
          />
        ) : null}

        {step === 3 ? (
          <section className="space-y-4">
            <h2 className="font-display text-xl uppercase">Datos del comprador</h2>

            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={buyerIsTraveler}
                onChange={(e) => toggleBuyerIsTraveler(e.target.checked)}
                className="mt-1"
              />
              Soy uno de los viajeros
            </label>

            {buyerIsTraveler && count > 1 ? (
              <label className="block max-w-xs">
                <span className="mb-1 block text-xs tracking-wide uppercase">¿Cuál eres?</span>
                <select
                  value={buyerTravelerIndex}
                  onChange={(e) => selectBuyerTraveler(Number(e.target.value))}
                  className="w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm"
                >
                  {travelers.map((t, i) => (
                    <option key={i} value={i}>
                      {`${t.firstName} ${t.lastName}`.trim() || `Viajero ${i + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs tracking-wide uppercase">Nombre</span>
                <input
                  value={buyer.buyerFirstName}
                  disabled={buyerIsTraveler}
                  onChange={(e) => setBuyer((b) => ({ ...b, buyerFirstName: e.target.value }))}
                  className="w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm disabled:bg-ivory-dark disabled:text-carbon/60"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs tracking-wide uppercase">Apellidos</span>
                <input
                  value={buyer.buyerLastName}
                  disabled={buyerIsTraveler}
                  onChange={(e) => setBuyer((b) => ({ ...b, buyerLastName: e.target.value }))}
                  className="w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm disabled:bg-ivory-dark disabled:text-carbon/60"
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
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-xs tracking-wide uppercase">
                  Dirección de envío{trip.requiresShippingAddress ? " *" : " (opcional)"}
                </span>
                {trip.requiresShippingAddress ? (
                  <p className="mb-1 text-xs text-carbon/50">La necesitamos para enviarte tu Pasaporte CDF y la pegatina del viaje.</p>
                ) : null}
                <input
                  value={buyer.billingAddress}
                  onChange={(e) => setBuyer((b) => ({ ...b, billingAddress: e.target.value }))}
                  className="w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm"
                />
              </label>
            </div>
          </section>
        ) : null}

        {step === 4 ? (
          <ReviewStep
            tripName={trip.name}
            tripSubtitle={trip.subtitle}
            hotelStars={trip.hotelStars}
            ticketCategory={trip.ticketCategory}
            hasInsurance={trip.hasInsurance}
            price={trip.price}
            singleSupplement={trip.singleSupplement}
            currency={trip.currency}
            travelers={travelers}
            roomOf={roomOf}
            singleRooms={singleRooms}
            total={total}
          />
        ) : null}

        {step === 5 ? (
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
              {step === 4 ? "Continuar al pago" : "Continuar"}
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
        <p className="mb-1 text-xs text-carbon/50 uppercase">{trip.name}</p>
        <p className="mb-4 text-sm text-carbon/70">
          Viajeros: {count}
        </p>

        {step >= 1 && originCounts.length > 0 ? (
          <div className="mb-4 space-y-1 text-sm text-carbon/70">
            <p className="text-xs text-carbon/50 uppercase">Orígenes</p>
            {originCounts.map(([city, n]) => (
              <p key={city}>
                {city} × {n}
              </p>
            ))}
          </div>
        ) : null}

        {step >= 2 ? (
          <div className="mb-4 space-y-1 text-sm text-carbon/70">
            <p className="text-xs text-carbon/50 uppercase">Habitaciones</p>
            {roomPairs.length > 0 ? <p>{roomPairs.length} doble{roomPairs.length === 1 ? "" : "s"}</p> : null}
            {singleRooms > 0 ? <p>{singleRooms} individual{singleRooms === 1 ? "" : "es"}</p> : null}
            {roomsGroupShareCount > 0 ? <p>{roomsGroupShareCount} por asignar (grupo)</p> : null}
            {roomsPendingCount > 0 ? <p>{roomsPendingCount} pendiente{roomsPendingCount === 1 ? "" : "s"}</p> : null}
          </div>
        ) : null}

        <dl className="space-y-2 border-t border-carbon/15 pt-4 text-sm">
          <div className="flex justify-between">
            <dt>
              {count} × {formatCurrency(trip.price, trip.currency)}
            </dt>
            <dd>{formatCurrency(baseSubtotal, trip.currency)}</dd>
          </div>
          {singleRooms > 0 ? (
            <div className="flex justify-between">
              <dt>{singleRooms} × suplemento individual</dt>
              <dd>{formatCurrency(supplementSubtotal, trip.currency)}</dd>
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
