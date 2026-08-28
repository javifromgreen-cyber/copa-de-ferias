import { Container } from "@/components/ui/Container";
import { ButtonLink } from "@/components/ui/Button";
import { TicketIcon, StadiumIcon, CheckIcon } from "@/components/icons";

// Home-only teaser (§12) — the full step-by-step lives on /como-funciona.
const STEPS = [
  { n: "01", title: "Elige tu partido", body: "Busca por equipo, ciudad o competición y entra en la ficha del partido que te interesa.", icon: StadiumIcon },
  { n: "02", title: "Elige cómo lo vives", body: "Solo entrada, entrada + hotel, o entrada + hotel + vuelo. Tú decides el plan.", icon: TicketIcon },
  { n: "03", title: "Reserva y listo", body: "Un único pago al reservar. A partir de ahí lo vas siguiendo todo desde \"Mi Viaje\".", icon: CheckIcon },
];

export function HowItWorksSection() {
  return (
    <section className="border-y border-carbon/10 bg-ivory-dark/40 py-20 sm:py-24">
      <Container>
        <p className="font-display mb-3 text-xs tracking-[0.25em] text-cement uppercase">Cómo funciona</p>
        <h2 className="font-display mb-12 max-w-xl text-3xl uppercase sm:text-4xl">De la ficha del partido a la grada, en tres pasos</h2>
        <div className="mb-10 grid gap-8 sm:grid-cols-3">
          {STEPS.map((step) => (
            <div key={step.n}>
              <step.icon className="mb-3 h-7 w-7 text-cement" />
              <p className="font-display mb-2 text-2xl text-cement">{step.n}</p>
              <h3 className="font-display mb-2 text-lg uppercase">{step.title}</h3>
              <p className="text-sm text-carbon/70">{step.body}</p>
            </div>
          ))}
        </div>
        <ButtonLink href="/como-funciona" variant="ghost">
          Ver cómo funciona en detalle
        </ButtonLink>
      </Container>
    </section>
  );
}
