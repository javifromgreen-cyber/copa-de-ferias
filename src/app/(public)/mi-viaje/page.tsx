import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { MiViajeLookupForm } from "@/components/mi-viaje/MiViajeLookupForm";

export const metadata: Metadata = { title: "Mi Viaje" };

export default function MiViajeLookupPage() {
  return (
    <Container className="max-w-md py-16 sm:py-24">
      <h1 className="font-display mb-3 text-3xl uppercase">Mi Viaje</h1>
      <p className="mb-8 text-carbon/70">
        Accede con el número de reserva que te enviamos por email y el email con el que reservaste.
      </p>
      <MiViajeLookupForm />
    </Container>
  );
}
