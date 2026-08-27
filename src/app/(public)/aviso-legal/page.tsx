import type { Metadata } from "next";
import { LegalPageLayout } from "@/components/legal/LegalPageLayout";
import { getBrand } from "@/lib/brand";

export const revalidate = 60;

export const metadata: Metadata = { title: "Aviso legal" };

export default async function AvisoLegalPage() {
  const brand = await getBrand();

  return (
    <LegalPageLayout title="Aviso legal">
      <section>
        <h2 className="font-display text-lg text-carbon uppercase">1. Titular</h2>
        <p>
          Este sitio web es operado, provisionalmente, bajo el nombre comercial <strong>{brand.name}</strong>.
        </p>
        <ul className="list-inside list-disc space-y-1">
          {brand.legalName ? <li>Razón social: {brand.legalName}</li> : null}
          {brand.legalTaxId ? <li>NIF/CIF: {brand.legalTaxId}</li> : null}
          {brand.legalAddress ? <li>Domicilio social: {brand.legalAddress}</li> : null}
          {brand.legalLicense ? <li>Registro / licencia de agencia de viajes: {brand.legalLicense}</li> : null}
          <li>Contacto: {brand.contactEmail}</li>
        </ul>
      </section>

      <section>
        <h2 className="font-display text-lg text-carbon uppercase">2. Objeto</h2>
        <p>
          {brand.name} organiza viajes cerrados de fútbol para grupos reducidos, combinando transporte, alojamiento,
          entrada al partido y actividades complementarias, según se describe en cada ficha de viaje.
        </p>
      </section>

      <section>
        <h2 className="font-display text-lg text-carbon uppercase">3. Propiedad intelectual</h2>
        <p>
          Los contenidos de este sitio (textos, marca, símbolo) son propiedad de {brand.name} o se utilizan bajo la
          licencia correspondiente. {brand.name} no reclama ninguna relación, afiliación ni licencia con UEFA, FIFA
          ni con los clubes de fútbol mencionados en el sitio; los nombres de clubes y competiciones se citan a
          título meramente informativo.
        </p>
      </section>

      <section>
        <h2 className="font-display text-lg text-carbon uppercase">4. Legislación aplicable</h2>
        <p>Este sitio se rige por la legislación española y, en lo que corresponda, la normativa europea de viajes combinados.</p>
      </section>
    </LegalPageLayout>
  );
}
