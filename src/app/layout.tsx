import type { Metadata } from "next";
import { Oswald, Inter } from "next/font/google";
import "./globals.css";
import { getBrand } from "@/lib/brand";
import { getSiteUrl } from "@/lib/env";

const oswald = Oswald({
  variable: "--font-oswald",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrand();
  const siteUrl = getSiteUrl();
  return {
    metadataBase: new URL(siteUrl),
    title: { default: `${brand.name} — ${brand.claim}`, template: `%s | ${brand.name}` },
    description:
      "Viajes de fútbol cerrados para grupos pequeños. Seleccionamos el partido, montamos el viaje. Tú reservas tu plaza.",
    openGraph: {
      type: "website",
      siteName: brand.name,
      locale: "es_ES",
    },
    twitter: { card: "summary_large_image" },
  };
}

// Only the document shell lives here. Public chrome (header/footer/cookie
// banner) is added by src/app/(public)/layout.tsx so that /admin — which
// has its own layout — never inherits the marketing site's navigation.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${oswald.variable} ${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
