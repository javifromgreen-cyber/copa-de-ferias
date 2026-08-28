import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { ButtonLink } from "@/components/ui/Button";
import { StadiumIcon, TicketIcon, ClipboardIcon, ChatIcon, PlaneIcon, CalendarIcon, DocumentIcon } from "@/components/icons";
import type { ComponentType, SVGProps } from "react";

export const metadata: Metadata = {
  title: "Cómo funciona",
  description: "Cómo funcionan los viajes de Copa de Ferias: selección del partido, reserva, datos, WhatsApp y viaje.",
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
    title: "5. Recibes información poco a poco",
    body: "Documentación, información práctica y planning definitivo, según se acerca la fecha del viaje.",
    icon: ClipboardIcon,
  },
  {
    title: "6. Te unes al grupo de WhatsApp",
    body: "Unos 15 días antes se activa el grupo del viaje para que os vayáis conociendo antes de salir.",
    icon: ChatIcon,
  },
  {
    title: "7. Viajas y te encuentras con el grupo",
    body: "En destino, el coordinador y el host local se encargan de que todo funcione. Tú solo tienes que disfrutar del partido.",
    icon: PlaneIcon,
  },
];

const DETAILS = [
  { title: "Habitaciones", body: "Doble compartida por defecto. Durante la reserva eliges quién comparte con quién; si te quedas sin pareja, puedes compartir con otro participante de tu mismo sexo o pagar el suplemento de individual." },
  { title: "Venir solo o acompañado", body: "Puedes apuntarte por tu cuenta, venir en pareja o reservar varias plazas con amigos. Al llegar formaréis parte del mismo grupo. El precio es por persona." },
  { title: "Origen", body: "Cada viaje tiene unas ciudades de salida configuradas. En esta primera versión no es posible incorporarse directamente en destino." },
  { title: "Pago", body: "Tarjeta, wallets y Bizum vía Stripe. Durante el pago pueden aparecer opciones de pago aplazado de Klarna o PayPal, según disponibilidad." },
  { title: "Mínimo de viajeros", body: "Cada viaje necesita un número mínimo de participantes para operar. Si no se alcanza, se cancela con reembolso íntegro." },
  { title: "Cambios", body: "Un cambio de horario dentro de las mismas fechas se actualiza en el planning. Un cambio importante se te comunica con las opciones disponibles." },
  { title: "Documentación", body: "Los datos que tu viaje necesita (DNI o pasaporte, entre otros) se piden en el checkout, antes de pagar. Si hace falta algo más, te lo pedimos desde \"Mi Viaje\"." },
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

      <h2 className="font-display mb-6 text-2xl uppercase">Lo que más se pregunta</h2>
      <div className="mb-12 grid gap-8 sm:grid-cols-2">
        {DETAILS.map((d) => (
          <div key={d.title}>
            <p className="mb-1 font-medium text-carbon">{d.title}</p>
            <p className="text-sm text-carbon/70">{d.body}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <ButtonLink href="/viajes">Ver viajes</ButtonLink>
        <ButtonLink href="/faq" variant="secondary">
          Ver FAQ completa
        </ButtonLink>
      </div>
    </Container>
  );
}
