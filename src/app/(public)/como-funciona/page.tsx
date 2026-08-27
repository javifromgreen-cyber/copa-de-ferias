import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { ButtonLink } from "@/components/ui/Button";
import { StadiumIcon, TicketIcon, ClipboardIcon, ChatIcon, PlaneIcon } from "@/components/icons";
import type { ComponentType, SVGProps } from "react";

export const metadata: Metadata = {
  title: "Cómo funciona",
  description: "Cómo funcionan los viajes de Copa de Ferias: selección del partido, reserva, datos, WhatsApp y viaje.",
};

const STEPS: { title: string; body: string; icon?: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  {
    title: "1. Copa de Ferias selecciona un viaje",
    body: "Elegimos previamente el partido, la ciudad y el estadio. No es un configurador: el producto ya viene montado.",
    icon: StadiumIcon,
  },
  {
    title: "2. Publicamos fechas, precio y plazas",
    body: "Cada viaje muestra sus fechas, el precio por persona y el número de plazas disponibles.",
  },
  {
    title: "3. Reservas y pagas",
    body: "El viaje se paga íntegro en el momento de reservar, incluyendo los datos y la habitación de cada viajero. Sin depósitos ni pagos aplazados por nuestra parte, aunque puedes financiarlo con Klarna o PayPal si te interesa.",
    icon: TicketIcon,
  },
  {
    title: "4. Completas datos adicionales",
    body: "Ya con la reserva cerrada, vas completando en \"Mi Viaje\" la documentación adicional que haga falta (DNI/pasaporte, contacto de emergencia…).",
    icon: ClipboardIcon,
  },
  {
    title: "5. Recibes información poco a poco",
    body: "Documentación, información práctica y planning definitivo, según se acerca la fecha del viaje.",
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
  { title: "Venir solo o acompañado", body: "La mayoría de gente viaja sola. También puedes venir en pareja o en grupo — el precio es por persona." },
  { title: "Origen", body: "Cada viaje tiene unas ciudades de salida configuradas. En esta primera versión no es posible incorporarse directamente en destino." },
  { title: "Pago", body: "Tarjeta, wallets, Bizum y Klarna vía Stripe, o PayPal (incluyendo Pay Later cuando esté disponible)." },
  { title: "Mínimo de viajeros", body: "Cada viaje necesita un número mínimo de participantes para operar. Si no se alcanza, se cancela con reembolso íntegro." },
  { title: "Cambios", body: "Un cambio de horario dentro de las mismas fechas se actualiza en el planning. Un cambio importante se te comunica con las opciones disponibles." },
  { title: "Documentación", body: "La vas completando progresivamente en \"Mi Viaje\": DNI o pasaporte, contacto de emergencia y el resto de datos que pida el viaje." },
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
