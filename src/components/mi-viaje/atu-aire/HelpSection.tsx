import { ButtonLink } from "@/components/ui/Button";

/**
 * §28: only the real support channel (email) — no WhatsApp group, host or
 * coordinator promises, none of which exist for A_TU_AIRE.
 */
export function HelpSection({ reference, contactEmail }: { reference: string; contactEmail: string }) {
  return (
    <section id="ayuda" className="scroll-mt-6 py-8">
      <h2 className="font-display mb-2 text-lg uppercase">¿Necesitas ayuda?</h2>
      <p className="mb-4 text-sm text-carbon/70">Si necesitas ayuda con tu reserva, contacta con Copa de Ferias indicando tu referencia.</p>
      <ButtonLink href={`mailto:${contactEmail}?subject=${encodeURIComponent(`Reserva ${reference}`)}`} variant="secondary">
        Contactar
      </ButtonLink>
    </section>
  );
}
