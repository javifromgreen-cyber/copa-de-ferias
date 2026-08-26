import type { Metadata } from "next";
import { LegalPageLayout } from "@/components/legal/LegalPageLayout";

export const metadata: Metadata = { title: "Cookies" };

export default function CookiesPage() {
  return (
    <LegalPageLayout title="Política de cookies">
      <section>
        <h2 className="font-display text-lg text-carbon uppercase">1. Qué cookies usamos</h2>
        <ul className="list-inside list-disc space-y-1">
          <li><strong>Necesarias</strong>: imprescindibles para el funcionamiento del sitio (por ejemplo, recordar tu decisión sobre cookies). Siempre activas.</li>
          <li><strong>Analítica</strong>: nos ayudan a entender cómo se usa el sitio (Google Analytics). Solo se cargan si aceptas.</li>
          <li><strong>Marketing</strong>: Meta Pixel y TikTok Pixel, usados para medir la efectividad de campañas. Solo se cargan si aceptas.</li>
        </ul>
      </section>

      <section>
        <h2 className="font-display text-lg text-carbon uppercase">2. Cómo gestionar tu consentimiento</h2>
        <p>
          Puedes aceptar o rechazar las cookies no necesarias desde el aviso que aparece la primera vez que visitas
          el sitio. Borrando los datos de este sitio en tu navegador, el aviso volverá a aparecer.
        </p>
      </section>

      <section>
        <h2 className="font-display text-lg text-carbon uppercase">3. Ningún dato personal a pixels</h2>
        <p>
          No enviamos nombres, emails, teléfonos ni ningún otro dato personal directamente identificable a las
          herramientas de analítica o marketing.
        </p>
      </section>
    </LegalPageLayout>
  );
}
