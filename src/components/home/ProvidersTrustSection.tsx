import { Container } from "@/components/ui/Container";
import { TicketIcon, DocumentIcon, CheckIcon } from "@/components/icons";

// Deliberately generic — never names a specific provider (§14/§43): the
// commercial relationships behind each match aren't public yet.
const ITEMS = [
  { title: "Proveedores oficiales", body: "Las entradas se gestionan a través de proveedores de ticketing deportivo con acceso oficial a cada partido.", icon: TicketIcon },
  { title: "Partners especializados", body: "Hotel y vuelo se contratan con partners especializados en viajes de fútbol, no con reventa informal.", icon: DocumentIcon },
  { title: "Reserva verificada", body: "Cada reserva pasa por canales verificados: sabes qué estás comprando antes de pagar.", icon: CheckIcon },
];

export function ProvidersTrustSection() {
  return (
    <section className="py-16 sm:py-20">
      <Container>
        <p className="font-display mb-3 text-xs tracking-[0.25em] text-cement uppercase">Confianza</p>
        <h2 className="font-display mb-10 max-w-xl text-3xl uppercase sm:text-4xl">Con quién trabajamos</h2>
        <div className="grid gap-8 sm:grid-cols-3">
          {ITEMS.map((item) => (
            <div key={item.title}>
              <item.icon className="mb-3 h-7 w-7 text-cement" />
              <h3 className="font-display mb-2 text-lg uppercase">{item.title}</h3>
              <p className="text-sm text-carbon/70">{item.body}</p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
