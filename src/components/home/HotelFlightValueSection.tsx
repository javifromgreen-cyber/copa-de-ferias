import { Container } from "@/components/ui/Container";
import { SuitcaseIcon, PlaneIcon, CalendarIcon, CheckIcon } from "@/components/icons";

// "Precios competitivos", never "el mejor precio" / "más barato que
// Booking o Skyscanner" — unprovable superlatives are off-limits (§15).
// This section is the reasons-to-book-with-us list; "Reserva verificada"
// moved in from ProvidersTrustSection (a trust reason, not a provider
// fact) and "Todo en un pago" was replaced — the real value isn't the
// single payment, it's not having to manually check that hotel/flight
// actually fit the match.
const ITEMS = [
  {
    title: "Sin cuadrar nada a mano",
    body: "Comprobamos que el hotel y el vuelo encajan con el partido y te mostramos solo las opciones compatibles. Reúnes entrada, hotel y vuelo en el mismo proceso, sin ir comparando horarios de una web a otra.",
    icon: SuitcaseIcon,
  },
  { title: "Precios competitivos", body: "Trabajamos con proveedores principales del sector para ofrecerte precios competitivos en hotel y vuelo.", icon: PlaneIcon },
  { title: "Pensado para el partido", body: "Coordinamos horarios de vuelo y ubicación del hotel en función del estadio, no al revés.", icon: CalendarIcon },
  { title: "Reserva verificada", body: "Cada reserva pasa por canales verificados: sabes qué estás comprando antes de pagar.", icon: CheckIcon },
];

export function HotelFlightValueSection() {
  return (
    <section className="border-y border-carbon/10 bg-ivory-dark/40 py-16 sm:py-20">
      <Container>
        <p className="font-display mb-3 text-xs tracking-[0.25em] text-cement uppercase">Hotel y vuelo</p>
        <h2 className="font-display mb-10 max-w-xl text-3xl uppercase sm:text-4xl">¿Por qué reservarlos con nosotros?</h2>
        <div className="grid gap-8 sm:grid-cols-2">
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
