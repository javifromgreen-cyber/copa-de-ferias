import type { Metadata } from "next";
import { LegalPageLayout } from "@/components/legal/LegalPageLayout";
import { getBrand } from "@/lib/brand";

export const revalidate = 60;

export const metadata: Metadata = { title: "Condiciones" };

export default async function CondicionesPage() {
  const brand = await getBrand();

  return (
    <LegalPageLayout title="Condiciones generales">
      <section>
        <h2 className="font-display text-lg text-carbon uppercase">1. El viaje</h2>
        <p>
          Cada viaje de {brand.name} es un producto cerrado: partido, transporte, alojamiento, entrada y actividades
          especificadas en la ficha correspondiente. Las condiciones concretas de cada viaje (precio, plazas,
          política de cancelación) se muestran en su ficha antes de reservar.
        </p>
      </section>

      <section>
        <h2 className="font-display text-lg text-carbon uppercase">2. Edad y reserva</h2>
        <p>
          Debes tener 18 años cumplidos para reservar y viajar. El viaje se paga íntegramente en el momento de la
          reserva.
        </p>
      </section>

      <section>
        <h2 className="font-display text-lg text-carbon uppercase">3. Mínimo de viajeros</h2>
        <p>
          Cada viaje requiere un número mínimo de participantes, indicado en su ficha, para poder operar. Si no se
          alcanza antes de la fecha límite correspondiente, {brand.name} cancelará el viaje y reembolsará el importe
          íntegro a todos los viajeros afectados.
        </p>
      </section>

      <section>
        <h2 className="font-display text-lg text-carbon uppercase">4. Cancelaciones y cambios</h2>
        <p>
          La política de cancelación de cada viaje se detalla en su ficha. Los cambios de viajero se solicitan desde
          &ldquo;Mi Viaje&rdquo; y se resuelven caso por caso. En caso de un cambio importante en el viaje (fecha, estadio,
          condiciones esenciales), te comunicaremos las opciones disponibles antes de tomar ninguna decisión.
        </p>
      </section>

      <section>
        <h2 className="font-display text-lg text-carbon uppercase">5. Seguro</h2>
        <p>
          Cuando el viaje incluye seguro de asistencia, sus condiciones concretas se detallan en la ficha. La
          existencia de este seguro no sustituye ninguna obligación legal del organizador.
        </p>
      </section>

      <section>
        <h2 className="font-display text-lg text-carbon uppercase">6. Documentación</h2>
        <p>
          Cada viajero es responsable de disponer de la documentación necesaria para viajar (DNI, pasaporte,
          visados, cuando corresponda). {brand.name} indicará los requisitos conocidos, pero no se hace responsable
          de la denegación de embarque o entrada por documentación insuficiente.
        </p>
      </section>

    </LegalPageLayout>
  );
}
