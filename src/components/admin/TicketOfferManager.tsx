"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/admin/FormField";
import { saveTicketOffer, deleteTicketOffer, type TicketOfferFormInput } from "@/server/actions/admin-ticket-offers";
import { formatCurrency } from "@/lib/utils";

const inputClass = "w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm";

export type TicketOfferRow = {
  id: string;
  provider: string;
  category: string;
  sector: string;
  costNet: number;
  currency: string;
  stock: number;
  maxQuantity: number | null;
  active: boolean;
  seatingTogetherGuaranteed: boolean;
  deliveryType: string;
  deliveryNotes: string;
  restrictions: string;
  internalNotes: string;
  validUntil: string | null;
};

function blankOffer(eventId: string): TicketOfferFormInput {
  return {
    eventId,
    provider: "manual",
    category: "",
    sector: "",
    costNet: 0,
    currency: "EUR",
    stock: 0,
    maxQuantity: null,
    active: true,
    seatingTogetherGuaranteed: false,
    deliveryType: "",
    deliveryNotes: "",
    restrictions: "",
    internalNotes: "",
    validUntil: "",
  };
}

function OfferForm({ initial, onDone }: { initial: TicketOfferFormInput; onDone: () => void }) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function set<K extends keyof TicketOfferFormInput>(key: K, value: TicketOfferFormInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    startTransition(async () => {
      const result = await saveTicketOffer(form);
      if (result.ok) {
        router.refresh();
        onDone();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-sm border border-carbon/15 bg-ivory-dark/40 p-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Proveedor">
          <input value={form.provider} onChange={(e) => set("provider", e.target.value)} className={inputClass} />
        </Field>
        <Field label="Categoría">
          <input value={form.category} onChange={(e) => set("category", e.target.value)} className={inputClass} required />
        </Field>
        <Field label="Sector">
          <input value={form.sector} onChange={(e) => set("sector", e.target.value)} className={inputClass} />
        </Field>
        <Field label="Precio coste">
          <input type="number" step="0.01" value={form.costNet} onChange={(e) => set("costNet", Number(e.target.value))} className={inputClass} />
        </Field>
        <Field label="Moneda">
          <input value={form.currency} onChange={(e) => set("currency", e.target.value)} className={inputClass} />
        </Field>
        <Field label="Disponibilidad (stock)">
          <input type="number" value={form.stock} onChange={(e) => set("stock", Number(e.target.value))} className={inputClass} />
        </Field>
        <Field label="Cantidad máxima por reserva (opcional)">
          <input
            type="number"
            value={form.maxQuantity ?? ""}
            onChange={(e) => set("maxQuantity", e.target.value === "" ? null : Number(e.target.value))}
            className={inputClass}
          />
        </Field>
        <Field label="Tipo de entrega">
          <input value={form.deliveryType} onChange={(e) => set("deliveryType", e.target.value)} placeholder="digital / física / taquilla" className={inputClass} />
        </Field>
        <Field label="Válida hasta (opcional)">
          <input type="date" value={form.validUntil} onChange={(e) => set("validUntil", e.target.value)} className={inputClass} />
        </Field>
      </div>
      <Field label="Restricciones / condiciones">
        <textarea value={form.restrictions} onChange={(e) => set("restrictions", e.target.value)} rows={2} className={inputClass} />
      </Field>
      <Field label="Notas internas (no visibles al cliente)">
        <textarea value={form.internalNotes} onChange={(e) => set("internalNotes", e.target.value)} rows={2} className={inputClass} />
      </Field>
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} />
          Activa
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.seatingTogetherGuaranteed} onChange={(e) => set("seatingTogetherGuaranteed", e.target.checked)} />
          Asientos juntos garantizados
        </label>
      </div>
      {error ? <p className="text-sm text-stamp">{error}</p> : null}
      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar oferta"}
        </Button>
        <button type="button" onClick={onDone} className="text-sm underline">
          Cancelar
        </button>
      </div>
    </form>
  );
}

export function TicketOfferManager({ eventId, offers }: { eventId: string; offers: TicketOfferRow[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-3">
      {offers.length === 0 ? (
        <p className="text-sm text-carbon/60">Todavía no hay ofertas de entradas para este evento.</p>
      ) : (
        <div className="overflow-x-auto rounded-sm border border-carbon/15 bg-white">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-carbon/10 text-xs tracking-wide text-carbon/50 uppercase">
              <tr>
                <th className="px-3 py-2">Categoría</th>
                <th className="px-3 py-2">Proveedor</th>
                <th className="px-3 py-2">Coste</th>
                <th className="px-3 py-2">Stock</th>
                <th className="px-3 py-2">Activa</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {offers.map((offer) => (
                <tr key={offer.id} className="border-b border-carbon/5 last:border-0">
                  <td className="px-3 py-2">
                    {offer.category}
                    {offer.sector ? ` — ${offer.sector}` : ""}
                  </td>
                  <td className="px-3 py-2">{offer.provider}</td>
                  <td className="px-3 py-2">{formatCurrency(offer.costNet, offer.currency)}</td>
                  <td className="px-3 py-2">{offer.stock}</td>
                  <td className="px-3 py-2">{offer.active ? "Sí" : "No"}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-3 text-xs">
                      <button type="button" className="underline" onClick={() => setEditingId(offer.id)}>
                        Editar
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        className="text-stamp underline"
                        onClick={() => {
                          if (confirm("¿Eliminar esta oferta de entrada?")) {
                            startTransition(async () => {
                              await deleteTicketOffer(offer.id);
                              router.refresh();
                            });
                          }
                        }}
                      >
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {offers.map((offer) =>
        editingId === offer.id ? (
          <OfferForm
            key={offer.id}
            initial={{ ...offer, id: offer.id, eventId, validUntil: offer.validUntil ? offer.validUntil.slice(0, 10) : "" }}
            onDone={() => setEditingId(null)}
          />
        ) : null,
      )}

      {editingId === "new" ? (
        <OfferForm initial={blankOffer(eventId)} onDone={() => setEditingId(null)} />
      ) : (
        <button type="button" onClick={() => setEditingId("new")} className="text-sm underline">
          + Nueva oferta de entrada
        </button>
      )}
    </div>
  );
}
