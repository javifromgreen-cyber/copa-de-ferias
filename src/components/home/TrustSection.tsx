import { Container } from "@/components/ui/Container";
import { TrackedLink } from "@/components/analytics/TrackedLink";
import type { Brand } from "@/lib/brand";

/**
 * Prepared for real legal/trust data. Deliberately shows placeholders
 * instead of inventing a company name, tax ID, licence number or
 * insurance — fill these in from Admin > Configuración before going live.
 * See docs/LEGAL_CHECKLIST.md.
 */
export function TrustSection({ brand }: { brand: Brand }) {
  const items = [
    { label: "Razón social", value: brand.legalName },
    { label: "Registro / licencia", value: brand.legalLicense },
    { label: "Seguro de responsabilidad civil", value: brand.insuranceInfo },
    { label: "Contacto", value: brand.contactEmail },
  ];

  return (
    <section className="border-t border-carbon/10 py-16">
      <Container>
        <p className="font-display mb-6 text-xs tracking-[0.25em] text-cement uppercase">Confianza</p>
        <div className="grid gap-6 text-sm sm:grid-cols-2 lg:grid-cols-4">
          {items.map((item) => (
            <div key={item.label}>
              <p className="mb-1 text-xs tracking-wide text-carbon/50 uppercase">{item.label}</p>
              <p className="text-carbon/80">
                {item.value || <span className="text-carbon/40 italic">Pendiente de completar</span>}
              </p>
            </div>
          ))}
        </div>

        {brand.reviewsVisible && brand.reviewsUrl ? (
          <div className="mt-8">
            <TrackedLink href={brand.reviewsUrl} event="review_clicked" className="text-sm underline">
              Ver reseñas en {brand.reviewsProvider === "google" ? "Google" : "Trustpilot"}
            </TrackedLink>
          </div>
        ) : null}
      </Container>
    </section>
  );
}
