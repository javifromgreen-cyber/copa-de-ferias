import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { ButtonLink } from "@/components/ui/Button";
import { StadiumIcon, TicketIcon, ClipboardIcon, CalendarIcon, DocumentIcon } from "@/components/icons";
import type { ComponentType, SVGProps } from "react";

export const metadata: Metadata = {
  title: "Cómo funciona",
  description: "Cómo funciona reservar con Copa de Ferias: selección del partido, reserva, datos y seguimiento desde Mi Viaje.",
};

const STEPS: { title: string; body: string; icon?: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  {
    title: "1. Copa de Ferias selecciona un viaje",
    body: "Elegimos previamente el partido, la ciudad y el plan. Cuando publicamos un viaje, ya sabemos dónde vamos y qué vamos a vivir.",
    icon: StadiumIcon,
  },
  {
    title: "2. Publicamos fechas y precio",
    body: "Cada viaje muestra sus fechas y el precio por persona.",
    icon: CalendarIcon,
  },
  {
    title: "3. Reservas y pagas",
    body: "El viaje se paga íntegro en el momento de reservar, con los datos y la habitación de cada viajero ya resueltos. Sin depósitos ni pagos aplazados por nuestra parte; durante el pago podrán aparecer opciones de pago aplazado de PayPal o Klarna cuando estén disponibles para tu compra.",
    icon: TicketIcon,
  },
  {
    title: "4. Organizáis viajeros y habitaciones",
    body: "Antes de pagar completáis los datos necesarios de cada viajero y organizáis las habitaciones. Si más adelante necesitamos algún dato adicional, te lo pediremos desde \"Mi Viaje\".",
    icon: DocumentIcon,
  },
  {
    title: "5. Sigues todo desde \"Mi Viaje\"",
    body: "Ahí consultas la información de tu reserva. Cualquier actualización, cambio, información práctica o dato adicional que haga falta según se acerque la fecha del partido se gestiona desde ese mismo espacio.",
    icon: ClipboardIcon,
  },
];

export default function ComoFuncionaPage() {
  return (
    <Container className="max-w-3xl py-16 sm:py-20">
      <p className="font-display mb-3 text-xs tracking-[0.25em] text-cement uppercase">Cómo funciona</p>
      <h1 className="font-display mb-10 text-3xl uppercase sm:text-4xl">De la idea al partido</h1>

      <ol className="mb-16 space-y-8">
        {STEPS.map((step) => (
          <li key={step.title} className="flex gap-4">
            {step.icon ? <step.icon className="mt-1 h-6 w-6 shrink-0 text-cement" /> : <span className="w-6 shrink-0" />}
            <div>
              <h2 className="font-display mb-1 text-lg uppercase">{step.title}</h2>
              <p className="text-carbon/75">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap gap-3">
        <ButtonLink href="/viajes">Ver viajes</ButtonLink>
        <ButtonLink href="/faq" variant="secondary">
          Ver FAQ completa
        </ButtonLink>
      </div>
    </Container>
  );
}
