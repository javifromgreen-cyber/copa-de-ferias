import { Container } from "@/components/ui/Container";

const STEPS = [
  { n: "01", title: "Elegimos el partido", body: "Seleccionamos previamente los partidos, estadios y ciudades que creemos que merecen el viaje." },
  { n: "02", title: "Montamos el viaje", body: "Cerramos transporte, hotel, entrada, transfers y experiencias. Un producto ya resuelto, no un configurador." },
  { n: "03", title: "Reservas tu plaza", body: "Ves el viaje que hemos montado y decides si te apuntas. Pago único al reservar." },
  { n: "04", title: "Viajamos", body: "Te encuentras en destino con el grupo, el host local y el coordinador. Solo queda disfrutar del partido." },
];

export function HowItWorksSection() {
  return (
    <section className="border-y border-carbon/10 bg-ivory-dark/40 py-20 sm:py-24">
      <Container>
        <p className="font-display mb-3 text-xs tracking-[0.25em] text-cement uppercase">Cómo funciona</p>
        <h2 className="font-display mb-12 max-w-xl text-3xl uppercase sm:text-4xl">
          No configuras nada. Nosotros ya lo hemos montado.
        </h2>
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step) => (
            <div key={step.n}>
              <p className="font-display mb-3 text-3xl text-cement">{step.n}</p>
              <h3 className="font-display mb-2 text-lg uppercase">{step.title}</h3>
              <p className="text-sm text-carbon/70">{step.body}</p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
