export type AtuAireBuyerFormState = { buyerFirstName: string; buyerLastName: string; buyerEmail: string; buyerPhone: string };

export const EMPTY_BUYER: AtuAireBuyerFormState = { buyerFirstName: "", buyerLastName: "", buyerEmail: "", buyerPhone: "" };

/**
 * The only thing still missing before A_TU_AIRE can create a real booking
 * once the quote is revalidated (§6) — who's paying. Everything else
 * (party size, tickets, hotel, flight) already lives in the selection.
 */
export function BuyerStep({ value, onChange }: { value: AtuAireBuyerFormState; onChange: (next: AtuAireBuyerFormState) => void }) {
  return (
    <section aria-labelledby="buyer-heading" className="rounded-sm border border-carbon/15 bg-white p-5">
      <h2 id="buyer-heading" className="mb-3 text-lg font-semibold">
        Tus datos de contacto
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs tracking-wide uppercase">Nombre</span>
          <input
            value={value.buyerFirstName}
            onChange={(e) => onChange({ ...value, buyerFirstName: e.target.value })}
            className="w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs tracking-wide uppercase">Apellidos</span>
          <input
            value={value.buyerLastName}
            onChange={(e) => onChange({ ...value, buyerLastName: e.target.value })}
            className="w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs tracking-wide uppercase">Email</span>
          <input
            type="email"
            value={value.buyerEmail}
            onChange={(e) => onChange({ ...value, buyerEmail: e.target.value })}
            className="w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs tracking-wide uppercase">Teléfono</span>
          <input
            value={value.buyerPhone}
            onChange={(e) => onChange({ ...value, buyerPhone: e.target.value })}
            className="w-full rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm"
          />
        </label>
      </div>
    </section>
  );
}

export function isBuyerFormComplete(buyer: AtuAireBuyerFormState): boolean {
  return (
    buyer.buyerFirstName.trim().length > 0 &&
    buyer.buyerLastName.trim().length > 0 &&
    buyer.buyerPhone.trim().length > 0 &&
    /.+@.+\..+/.test(buyer.buyerEmail)
  );
}
