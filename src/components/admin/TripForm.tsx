"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/admin/FormField";
import { saveTrip, type TripFormInput } from "@/server/actions/admin-trips";
import { TRAVELER_FIELD_KEYS, TRAVELER_FIELD_LABELS, parseRequiredFields } from "@/lib/checkout/travelerFields";
import { ALL_PACKAGE_TYPES, PACKAGE_TYPE_LABELS } from "@/lib/pricing/packageTypes";
import { computeOrganizationFee, type OrganizationFeeGlobalConfig } from "@/lib/pricing/organizationFee";
import { formatCurrency } from "@/lib/utils";

const STATUS_OPTIONS = ["draft", "upcoming", "open", "sold_out", "completed", "archived"] as const;
const SCHEDULE_OPTIONS = ["time_provisional", "confirmed"] as const;
const TRAVEL_MODE_OPTIONS = ["GROUP_CDF", "A_TU_AIRE"] as const;
const PREVIEW_PARTY_SIZES = [1, 4, 8] as const;

function toDateInput(value: string) {
  return value ? value.slice(0, 10) : "";
}

const inputClass = "w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm";

function Section({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="rounded-sm border border-carbon/15 bg-white">
      <summary className="cursor-pointer px-4 py-3 font-medium text-carbon">{title}</summary>
      <div className="space-y-4 border-t border-carbon/10 p-4">{children}</div>
    </details>
  );
}

function TextListEditor({ items, onChange, placeholder }: { items: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex gap-2">
          <input
            value={item}
            placeholder={placeholder}
            onChange={(e) => onChange(items.map((it, idx) => (idx === i ? e.target.value : it)))}
            className={inputClass}
          />
          <button type="button" onClick={() => onChange(items.filter((_, idx) => idx !== i))} className="px-2 text-carbon/50">
            ×
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...items, ""])} className="text-xs underline">
        + Añadir
      </button>
    </div>
  );
}

/**
 * Read-only preview of the organization fee this product would actually
 * charge, computed live with the real engine (computeOrganizationFee) as
 * the admin edits overrides — never a second pricing algorithm.
 */
function FeePreview({ form, globalFeeConfig }: { form: TripFormInput; globalFeeConfig: OrganizationFeeGlobalConfig }) {
  // A_TU_AIRE always supports the three modalities (§1) — this preview no
  // longer reads the vestigial per-trip availablePackageTypes field.
  const packageTypes = ALL_PACKAGE_TYPES;

  const overrides = {
    orgFeeTicketOnlyOverride: form.orgFeeTicketOnlyOverride,
    orgFeeHotelTiersOverride: form.orgFeeHotelTiersOverride,
    orgFeeHotelFlightTiersOverride: form.orgFeeHotelFlightTiersOverride,
    additionalMatchFeeOverride: form.additionalMatchFeeOverride,
  };

  return (
    <div className="mt-4 overflow-x-auto rounded-sm border border-carbon/10">
      <table className="w-full min-w-[420px] text-left text-xs">
        <thead className="border-b border-carbon/10 text-carbon/50 uppercase">
          <tr>
            <th className="px-3 py-2">Modalidad</th>
            {PREVIEW_PARTY_SIZES.map((n) => (
              <th key={n} className="px-3 py-2">
                {n} viajero{n > 1 ? "s" : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {packageTypes.map((pt) => (
            <tr key={pt} className="border-b border-carbon/5 last:border-0">
              <td className="px-3 py-2">{PACKAGE_TYPE_LABELS[pt]}</td>
              {PREVIEW_PARTY_SIZES.map((partySize) => {
                if (partySize > form.maxPartySize) {
                  return (
                    <td key={partySize} className="px-3 py-2 text-carbon/30">
                      —
                    </td>
                  );
                }
                try {
                  const fee = computeOrganizationFee({ packageType: pt, partySize, matchCount: 1, global: globalFeeConfig, overrides });
                  return (
                    <td key={partySize} className="px-3 py-2">
                      {formatCurrency(fee.total)}
                    </td>
                  );
                } catch {
                  return (
                    <td key={partySize} className="px-3 py-2 text-stamp">
                      JSON inválido
                    </td>
                  );
                }
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-3 py-2 text-[11px] text-carbon/50">
        Solo el fee de organización (nuestro margen), sin coste de entrada/hotel/vuelo — nunca se muestra así al cliente.
      </p>
    </div>
  );
}

export function TripForm({ initial, globalFeeConfig }: { initial: TripFormInput; globalFeeConfig: OrganizationFeeGlobalConfig }) {
  const router = useRouter();
  const [form, setForm] = useState<TripFormInput>(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [error, setError] = useState("");

  function set<K extends keyof TripFormInput>(key: K, value: TripFormInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setError("");
    const result = await saveTrip(form);
    if (result.ok) {
      router.push(`/admin/viajes/${result.id}`);
      router.refresh();
      setStatus("idle");
    } else {
      setError(result.error);
      setStatus("error");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pb-24">
      <Section title="Básico" defaultOpen>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Número">
            <input type="number" value={form.number} onChange={(e) => set("number", Number(e.target.value))} className={inputClass} />
          </Field>
          <Field label="Slug">
            <input value={form.slug} onChange={(e) => set("slug", e.target.value)} className={inputClass} />
          </Field>
          <Field label="Clave de foto (heroImageKey)">
            <input value={form.heroImageKey} onChange={(e) => set("heroImageKey", e.target.value)} className={inputClass} />
          </Field>
          <Field label="Nombre">
            <input value={form.name} onChange={(e) => set("name", e.target.value)} className={inputClass} />
          </Field>
          <Field label="Subtítulo">
            <input value={form.subtitle} onChange={(e) => set("subtitle", e.target.value)} className={inputClass} />
          </Field>
          <Field label="Ciudad">
            <input value={form.city} onChange={(e) => set("city", e.target.value)} className={inputClass} />
          </Field>
          <Field label="País">
            <input value={form.country} onChange={(e) => set("country", e.target.value)} className={inputClass} />
          </Field>
          <Field label="Equipo local">
            <input value={form.homeTeam} onChange={(e) => set("homeTeam", e.target.value)} className={inputClass} />
          </Field>
          <Field label="Equipo visitante">
            <input value={form.awayTeam} onChange={(e) => set("awayTeam", e.target.value)} className={inputClass} />
          </Field>
          <Field label="Estadio">
            <input value={form.stadium} onChange={(e) => set("stadium", e.target.value)} className={inputClass} />
          </Field>
          <Field label="Fecha del partido">
            <input
              type="date"
              value={toDateInput(form.matchDate)}
              onChange={(e) => set("matchDate", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Duración (días)">
            <input type="number" value={form.durationDays} onChange={(e) => set("durationDays", Number(e.target.value))} className={inputClass} />
          </Field>
          <Field label="Duración (noches)">
            <input type="number" value={form.durationNights} onChange={(e) => set("durationNights", Number(e.target.value))} className={inputClass} />
          </Field>
        </div>
      </Section>

      <Section title="Estado y publicación" defaultOpen>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Estado">
            <select value={form.status} onChange={(e) => set("status", e.target.value as TripFormInput["status"])} className={inputClass}>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Horario">
            <select value={form.scheduleStatus} onChange={(e) => set("scheduleStatus", e.target.value as TripFormInput["scheduleStatus"])} className={inputClass}>
              {SCHEDULE_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Orden en listados">
            <input type="number" value={form.order} onChange={(e) => set("order", Number(e.target.value))} className={inputClass} />
          </Field>
        </div>
        <div className="flex flex-wrap gap-6 pt-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.published} onChange={(e) => set("published", e.target.checked)} />
            Tiene ficha pública (published)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.homeFeatured} onChange={(e) => set("homeFeatured", e.target.checked)} />
            Destacado en Home
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.isDemo} onChange={(e) => set("isDemo", e.target.checked)} />
            Marcado como DEMO (nunca cobra en real)
          </label>
        </div>
      </Section>

      <Section title="Precio y plazas">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Precio">
            <input type="number" value={form.price} onChange={(e) => set("price", Number(e.target.value))} className={inputClass} />
          </Field>
          <Field label="Moneda">
            <input value={form.currency} onChange={(e) => set("currency", e.target.value)} className={inputClass} />
          </Field>
          <Field label="Suplemento individual">
            <input type="number" value={form.singleSupplement} onChange={(e) => set("singleSupplement", Number(e.target.value))} className={inputClass} />
          </Field>
          <Field label="Plazas máximas">
            <input type="number" value={form.maxSpots} onChange={(e) => set("maxSpots", Number(e.target.value))} className={inputClass} />
          </Field>
          <Field label="Mínimo operativo">
            <input type="number" value={form.minSpots} onChange={(e) => set("minSpots", Number(e.target.value))} className={inputClass} />
          </Field>
          <Field label="Fecha límite del mínimo">
            <input type="date" value={toDateInput(form.minDeadlineDate)} onChange={(e) => set("minDeadlineDate", e.target.value)} className={inputClass} />
          </Field>
        </div>
      </Section>

      <Section title="Producto A TU AIRE">
        <p className="text-xs text-carbon/60">
          Configura qué puede comprar el usuario. GRUPO CDF ignora esta sección: sigue usando el precio y las plazas de
          arriba tal cual.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Modalidad">
            <select value={form.travelMode} onChange={(e) => set("travelMode", e.target.value as TripFormInput["travelMode"])} className={inputClass}>
              {TRAVEL_MODE_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m === "A_TU_AIRE" ? "A TU AIRE" : "GRUPO CDF"}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Viajeros máximos por reserva">
            <input
              type="number"
              min={1}
              max={10}
              value={form.maxPartySize}
              onChange={(e) => set("maxPartySize", Number(e.target.value))}
              className={inputClass}
            />
          </Field>
        </div>

        {form.travelMode === "A_TU_AIRE" ? (
          <>
            <div>
              <p className="mb-2 text-xs tracking-wide text-carbon/60 uppercase">Modalidades</p>
              <p className="text-sm text-carbon/70">
                Todo producto A TU AIRE ofrece siempre las tres modalidades (Entrada, Entrada + Hotel, Entrada + Hotel
                + Vuelo) — ya no se configuran por viaje. La disponibilidad real de hotel/vuelo depende del
                inventario y de las fechas del partido, nunca de una lista fija por producto.
              </p>
            </div>

            <div className="border-t border-carbon/10 pt-4">
              <p className="mb-2 text-xs tracking-wide text-carbon/60 uppercase">
                Override de organization fee (vacío = usar la configuración global)
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Fee solo entrada (€/viajero)">
                  <input
                    type="number"
                    value={form.orgFeeTicketOnlyOverride ?? ""}
                    onChange={(e) => set("orgFeeTicketOnlyOverride", e.target.value === "" ? null : Number(e.target.value))}
                    className={inputClass}
                  />
                </Field>
                <Field label="Fee adicional por partido extra (€/viajero)">
                  <input
                    type="number"
                    value={form.additionalMatchFeeOverride ?? ""}
                    onChange={(e) => set("additionalMatchFeeOverride", e.target.value === "" ? null : Number(e.target.value))}
                    className={inputClass}
                  />
                </Field>
                <Field label="Tramos entrada + hotel (JSON, opcional)">
                  <textarea
                    value={form.orgFeeHotelTiersOverride}
                    onChange={(e) => set("orgFeeHotelTiersOverride", e.target.value)}
                    rows={2}
                    placeholder='[{"minParty":1,"maxParty":2,"feePerTraveler":99}, ...]'
                    className={inputClass}
                  />
                </Field>
                <Field label="Tramos entrada + hotel + vuelo (JSON, opcional)">
                  <textarea
                    value={form.orgFeeHotelFlightTiersOverride}
                    onChange={(e) => set("orgFeeHotelFlightTiersOverride", e.target.value)}
                    rows={2}
                    placeholder='[{"minParty":1,"maxParty":2,"feePerTraveler":159}, ...]'
                    className={inputClass}
                  />
                </Field>
              </div>
              <FeePreview form={form} globalFeeConfig={globalFeeConfig} />
            </div>
          </>
        ) : null}
      </Section>

      <Section title="Datos de viajero requeridos en checkout">
        <p className="text-xs text-carbon/60">
          Se piden a cada viajero antes de pagar, no después en &ldquo;Mi Viaje&rdquo;. Marca solo los que este viaje
          realmente necesita.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {TRAVELER_FIELD_KEYS.map((key) => {
            const selected = parseRequiredFields(form.requiredTravelerFields).includes(key);
            return (
              <label key={key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={(e) => {
                    const current = parseRequiredFields(form.requiredTravelerFields);
                    const next = e.target.checked ? [...current, key] : current.filter((k) => k !== key);
                    set("requiredTravelerFields", next.join(","));
                  }}
                />
                {TRAVELER_FIELD_LABELS[key]}
              </label>
            );
          })}
        </div>
        <div className="border-t border-carbon/10 pt-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.requiresShippingAddress}
              onChange={(e) => set("requiresShippingAddress", e.target.checked)}
            />
            Requiere dirección de envío del comprador (p. ej. para el pack físico)
          </label>
          <p className="mt-1 text-xs text-carbon/60">
            Una única dirección por reserva, no por viajero — se pide en el paso &ldquo;Comprador&rdquo; del checkout.
          </p>
        </div>
      </Section>

      <Section title="Contenido editorial">
        <Field label="Descripción">
          <textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={3} className={inputClass} />
        </Field>
        <Field label="Por qué vamos">
          <textarea value={form.whyWeGo} onChange={(e) => set("whyWeGo", e.target.value)} rows={4} className={inputClass} />
        </Field>
        <Field label="Cultura local">
          <textarea value={form.localCulture} onChange={(e) => set("localCulture", e.target.value)} rows={3} className={inputClass} />
        </Field>
      </Section>

      <Section title="Transporte">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Salida (texto)">
            <input value={form.departureText} onChange={(e) => set("departureText", e.target.value)} className={inputClass} />
          </Field>
          <Field label="Regreso (texto)">
            <input value={form.returnText} onChange={(e) => set("returnText", e.target.value)} className={inputClass} />
          </Field>
        </div>
      </Section>

      <Section title="Hotel">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Estrellas">
            <input type="number" min={1} max={5} value={form.hotelStars} onChange={(e) => set("hotelStars", Number(e.target.value))} className={inputClass} />
          </Field>
          <Field label="Zona">
            <input value={form.hotelZone} onChange={(e) => set("hotelZone", e.target.value)} className={inputClass} />
          </Field>
          <Field label="Céntrico">
            <select value={form.hotelCentric ? "si" : "no"} onChange={(e) => set("hotelCentric", e.target.value === "si")} className={inputClass}>
              <option value="si">Sí</option>
              <option value="no">No</option>
            </select>
          </Field>
        </div>
        <Field label="Descripción del hotel">
          <textarea value={form.hotelDescription} onChange={(e) => set("hotelDescription", e.target.value)} rows={2} className={inputClass} />
        </Field>
      </Section>

      <Section title="Partido / entrada">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Categoría de entrada">
            <input value={form.ticketCategory} onChange={(e) => set("ticketCategory", e.target.value)} className={inputClass} />
          </Field>
          <Field label="Sector">
            <input value={form.ticketSector} onChange={(e) => set("ticketSector", e.target.value)} className={inputClass} />
          </Field>
        </div>
        <Field label="Seating / notas de ubicación">
          <textarea value={form.ticketSeating} onChange={(e) => set("ticketSeating", e.target.value)} rows={2} className={inputClass} />
        </Field>
      </Section>

      <Section title="Seguro">
        <Field label="Descripción del seguro">
          <textarea value={form.insuranceDescription} onChange={(e) => set("insuranceDescription", e.target.value)} rows={2} className={inputClass} />
        </Field>
      </Section>

      <Section title="Personas">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Coordinador">
            <input value={form.coordinatorName} onChange={(e) => set("coordinatorName", e.target.value)} className={inputClass} />
          </Field>
          <Field label="Host local">
            <input value={form.hostName} onChange={(e) => set("hostName", e.target.value)} className={inputClass} />
          </Field>
        </div>
      </Section>

      <Section title="Orígenes (ciudades de salida)">
        <TextListEditor items={form.origins} onChange={(v) => set("origins", v)} placeholder="Barcelona" />
      </Section>

      <Section title="Planning">
        <div className="space-y-4">
          {form.planningDays.map((day, i) => (
            <div key={i} className="grid gap-2 rounded-sm border border-carbon/10 p-3 sm:grid-cols-[140px_1fr_auto]">
              <input
                value={day.title}
                placeholder="Viernes"
                onChange={(e) => set("planningDays", form.planningDays.map((d, idx) => (idx === i ? { ...d, title: e.target.value } : d)))}
                className={inputClass}
              />
              <textarea
                value={day.description}
                placeholder="Descripción del día"
                rows={2}
                onChange={(e) => set("planningDays", form.planningDays.map((d, idx) => (idx === i ? { ...d, description: e.target.value } : d)))}
                className={inputClass}
              />
              <button type="button" onClick={() => set("planningDays", form.planningDays.filter((_, idx) => idx !== i))} className="text-carbon/50">
                ×
              </button>
            </div>
          ))}
          <button type="button" onClick={() => set("planningDays", [...form.planningDays, { title: "", description: "", icon: "" }])} className="text-xs underline">
            + Añadir día
          </button>
        </div>
      </Section>

      <Section title="Experiencia futbolística (actividades)">
        <div className="space-y-4">
          {form.activities.map((a, i) => (
            <div key={i} className="grid gap-2 rounded-sm border border-carbon/10 p-3 sm:grid-cols-[1fr_1fr_auto]">
              <input
                value={a.title}
                placeholder="Título"
                onChange={(e) => set("activities", form.activities.map((it, idx) => (idx === i ? { ...it, title: e.target.value } : it)))}
                className={inputClass}
              />
              <input
                value={a.description}
                placeholder="Descripción"
                onChange={(e) => set("activities", form.activities.map((it, idx) => (idx === i ? { ...it, description: e.target.value } : it)))}
                className={inputClass}
              />
              <button type="button" onClick={() => set("activities", form.activities.filter((_, idx) => idx !== i))} className="text-carbon/50">
                ×
              </button>
            </div>
          ))}
          <button type="button" onClick={() => set("activities", [...form.activities, { title: "", description: "" }])} className="text-xs underline">
            + Añadir actividad
          </button>
        </div>
      </Section>

      <Section title="Incluido / no incluido">
        <div className="space-y-4">
          {form.inclusions.map((inc, i) => (
            <div key={i} className="grid grid-cols-[1fr_auto_auto] items-center gap-2">
              <input
                value={inc.text}
                onChange={(e) => set("inclusions", form.inclusions.map((it, idx) => (idx === i ? { ...it, text: e.target.value } : it)))}
                className={inputClass}
              />
              <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={inc.included}
                  onChange={(e) => set("inclusions", form.inclusions.map((it, idx) => (idx === i ? { ...it, included: e.target.checked } : it)))}
                />
                Incluido
              </label>
              <button type="button" onClick={() => set("inclusions", form.inclusions.filter((_, idx) => idx !== i))} className="text-carbon/50">
                ×
              </button>
            </div>
          ))}
          <button type="button" onClick={() => set("inclusions", [...form.inclusions, { text: "", included: true }])} className="text-xs underline">
            + Añadir línea
          </button>
        </div>
      </Section>

      <Section title="Checklist / requisitos">
        <TextListEditor items={form.requirements} onChange={(v) => set("requirements", v)} placeholder="DNI o pasaporte en vigor" />
      </Section>

      <Section title="FAQ del viaje">
        <div className="space-y-4">
          {form.faqs.map((f, i) => (
            <div key={i} className="grid gap-2 rounded-sm border border-carbon/10 p-3 sm:grid-cols-[1fr_1fr_auto]">
              <input
                value={f.question}
                placeholder="Pregunta"
                onChange={(e) => set("faqs", form.faqs.map((it, idx) => (idx === i ? { ...it, question: e.target.value } : it)))}
                className={inputClass}
              />
              <input
                value={f.answer}
                placeholder="Respuesta"
                onChange={(e) => set("faqs", form.faqs.map((it, idx) => (idx === i ? { ...it, answer: e.target.value } : it)))}
                className={inputClass}
              />
              <button type="button" onClick={() => set("faqs", form.faqs.filter((_, idx) => idx !== i))} className="text-carbon/50">
                ×
              </button>
            </div>
          ))}
          <button type="button" onClick={() => set("faqs", [...form.faqs, { question: "", answer: "" }])} className="text-xs underline">
            + Añadir pregunta
          </button>
        </div>
      </Section>

      <Section title="WhatsApp">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="URL del grupo">
            <input value={form.whatsappUrl} onChange={(e) => set("whatsappUrl", e.target.value)} className={inputClass} />
          </Field>
          <Field label="Disponible a partir de">
            <input type="date" value={toDateInput(form.whatsappAvailableAt)} onChange={(e) => set("whatsappAvailableAt", e.target.value)} className={inputClass} />
          </Field>
        </div>
      </Section>

      <Section title="Condiciones">
        <Field label="Política de cancelación">
          <textarea value={form.cancellationPolicy} onChange={(e) => set("cancellationPolicy", e.target.value)} rows={3} className={inputClass} />
        </Field>
        <Field label="Condiciones importantes">
          <textarea value={form.importantConditions} onChange={(e) => set("importantConditions", e.target.value)} rows={3} className={inputClass} />
        </Field>
      </Section>

      <Section title="SEO">
        <Field label="SEO title">
          <input value={form.seoTitle} onChange={(e) => set("seoTitle", e.target.value)} className={inputClass} />
        </Field>
        <Field label="SEO description">
          <textarea value={form.seoDescription} onChange={(e) => set("seoDescription", e.target.value)} rows={2} className={inputClass} />
        </Field>
      </Section>

      {error ? <p className="text-sm text-stamp">{error}</p> : null}

      <div className="sticky bottom-0 flex gap-3 border-t border-carbon/10 bg-ivory-dark/95 p-4">
        <Button type="submit" disabled={status === "saving"}>
          {status === "saving" ? "Guardando…" : "Guardar viaje"}
        </Button>
      </div>
    </form>
  );
}
