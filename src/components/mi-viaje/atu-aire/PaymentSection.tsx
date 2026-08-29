import { WalletIcon } from "@/components/icons";
import { formatCurrency } from "@/lib/utils";
import type { AtuAireMiViajeView } from "@/lib/mi-viaje/buildAtuAireView";

/**
 * §26/§27: total paid and status only — never the fee/margin/cost
 * breakdown behind that total, matching the same rule already enforced in
 * checkout's own summary (no "Gastos de gestión" or similar here either).
 */
export function PaymentSection({ view }: { view: AtuAireMiViajeView }) {
  return (
    <details id="pago" open className="scroll-mt-6 border-b border-carbon/15 py-8">
      <summary className="mb-4 flex cursor-pointer list-none items-center gap-2 text-lg font-display uppercase">
        <WalletIcon className="h-5 w-5 shrink-0" />
        Pago
      </summary>
      <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-carbon/50 uppercase">Total</dt>
          <dd className="font-display text-xl">{formatCurrency(view.payment.total, view.payment.currency)}</dd>
        </div>
        <div>
          <dt className="text-xs text-carbon/50 uppercase">Estado</dt>
          <dd className="font-medium">{view.payment.statusLabel}</dd>
        </div>
        <div>
          <dt className="text-xs text-carbon/50 uppercase">Fecha de pago</dt>
          <dd>{view.payment.paidAtLabel}</dd>
        </div>
        <div>
          <dt className="text-xs text-carbon/50 uppercase">Método</dt>
          <dd>{view.payment.methodLabel}</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-carbon/50">Referencia de reserva: {view.reference}</p>
    </details>
  );
}
