import { Container } from "@/components/ui/Container";
import { MiViajeHeader } from "./MiViajeHeader";
import { MiViajeNav } from "./MiViajeNav";
import { NecessaryActionsSection } from "./NecessaryActionsSection";
import { TicketsSection } from "./TicketsSection";
import { TravelersSection } from "./TravelersSection";
import { HotelSection } from "./HotelSection";
import { FlightsSection } from "./FlightsSection";
import { DocumentationSection } from "./DocumentationSection";
import { UpdatesSection } from "./UpdatesSection";
import { PaymentSection } from "./PaymentSection";
import { HelpSection } from "./HelpSection";
import type { AtuAireMiViajeView } from "@/lib/mi-viaje/buildAtuAireView";

/**
 * Mi Viaje for an A_TU_AIRE booking (§1-52 of this block's spec) — one
 * well-organized page, not a generic SaaS dashboard: every block reflects
 * what was actually contracted, nothing invented, nothing re-asked. GROUP_CDF
 * bookings keep rendering the older, unrelated page (see [token]/page.tsx).
 */
export function MiViajeAtuAire({ view, accessToken, contactEmail }: { view: AtuAireMiViajeView; accessToken: string; contactEmail: string }) {
  const navItems = [
    ...(view.necessaryActions.length > 0 ? [{ id: "acciones-necesarias", label: "Acciones necesarias" }] : []),
    { id: "entradas", label: "Entradas" },
    { id: "viajeros", label: "Viajeros" },
    ...(view.hotel ? [{ id: "hotel", label: "Hotel" }] : []),
    ...(view.flights ? [{ id: "vuelos", label: "Vuelos" }] : []),
    ...(view.documents.length > 0 ? [{ id: "documentacion", label: "Documentos" }] : []),
    { id: "actualizaciones", label: "Actualizaciones" },
    { id: "pago", label: "Pago" },
    { id: "ayuda", label: "Ayuda" },
  ];

  return (
    <Container className="max-w-4xl py-10 sm:py-14">
      <MiViajeHeader view={view} />
      <NecessaryActionsSection view={view} />
      <div className="grid gap-8 lg:grid-cols-[160px_1fr]">
        <MiViajeNav items={navItems} />
        <div>
          <TicketsSection view={view} />
          <TravelersSection view={view} accessToken={accessToken} />
          <HotelSection view={view} />
          <FlightsSection view={view} />
          <DocumentationSection view={view} />
          <UpdatesSection view={view} />
          <PaymentSection view={view} />
          <HelpSection reference={view.reference} contactEmail={contactEmail} />
        </div>
      </div>
    </Container>
  );
}
