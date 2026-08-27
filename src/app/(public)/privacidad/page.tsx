import type { Metadata } from "next";
import { LegalPageLayout } from "@/components/legal/LegalPageLayout";
import { getBrand } from "@/lib/brand";

export const revalidate = 60;

export const metadata: Metadata = { title: "Privacidad" };

export default async function PrivacidadPage() {
  const brand = await getBrand();

  return (
    <LegalPageLayout title="Política de privacidad">
      <section>
        <h2 className="font-display text-lg text-carbon uppercase">1. Responsable del tratamiento</h2>
        <p>
          {brand.legalName ? `${brand.legalName} (${brand.name})` : brand.name}, con contacto en {brand.contactEmail}.
        </p>
      </section>

      <section>
        <h2 className="font-display text-lg text-carbon uppercase">2. Datos que tratamos</h2>
        <ul className="list-inside list-disc space-y-1">
          <li>Datos de contacto (nombre, email, teléfono, ciudad) cuando dejas tus datos en un formulario &ldquo;Avísame&rdquo; o &ldquo;Entérate antes que nadie&rdquo;.</li>
          <li>Datos de reserva y de cada viajero, cuando completas una reserva o tu área &ldquo;Mi Viaje&rdquo;: nombre, apellidos, fecha de nacimiento, documento de identidad, contacto de emergencia y dirección postal.</li>
          <li>Datos de pago, procesados directamente por nuestros proveedores de pago (Stripe, PayPal) — nunca almacenamos el número completo de tu tarjeta.</li>
          <li>Datos de navegación con fines analíticos, únicamente si has dado tu consentimiento en el aviso de cookies.</li>
        </ul>
      </section>

      <section>
        <h2 className="font-display text-lg text-carbon uppercase">3. Finalidad</h2>
        <p>
          Gestionar tu reserva, comunicarte información sobre tu viaje, responder a tus consultas, y — solo con tu
          consentimiento explícito — avisarte de futuros viajes o medir el uso del sitio.
        </p>
      </section>

      <section>
        <h2 className="font-display text-lg text-carbon uppercase">4. Conservación y terceros</h2>
        <p>
          Conservamos tus datos mientras exista una relación contractual o legal que lo justifique. Compartimos
          datos con proveedores estrictamente necesarios para operar el viaje (transporte, alojamiento, seguro,
          pago), nunca con fines distintos a los descritos aquí.
        </p>
      </section>

      <section>
        <h2 className="font-display text-lg text-carbon uppercase">5. Tus derechos</h2>
        <p>
          Puedes ejercer tus derechos de acceso, rectificación, supresión, oposición y portabilidad escribiendo a{" "}
          {brand.contactEmail}.
        </p>
      </section>
    </LegalPageLayout>
  );
}
