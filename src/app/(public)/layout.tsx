import { getBrand } from "@/lib/brand";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { CookieConsent } from "@/components/layout/CookieConsent";
import { AnalyticsScripts } from "@/components/layout/AnalyticsScripts";

// Brand config (name, claim, socials, legal) is admin-editable and shows
// in the header/footer on every public page — revalidate periodically
// rather than baking a build-time snapshot into static HTML.
export const revalidate = 60;

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const brand = await getBrand();

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-sm focus:bg-carbon focus:px-4 focus:py-2 focus:text-ivory"
      >
        Saltar al contenido
      </a>
      <Header brand={brand} />
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <Footer brand={brand} />
      <CookieConsent />
      <AnalyticsScripts brand={brand} />
    </>
  );
}
