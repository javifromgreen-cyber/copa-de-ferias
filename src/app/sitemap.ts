import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";
import { getSiteUrl } from "@/lib/env";
import { PUBLIC_LISTING_EXCLUDED_SLUGS } from "@/lib/trips/queries";

export const revalidate = 60;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl();
  const trips = (await prisma.trip.findMany({ where: { published: true }, select: { slug: true, updatedAt: true } })).filter(
    (t) => !PUBLIC_LISTING_EXCLUDED_SLUGS.has(t.slug),
  );

  const staticRoutes = ["", "/viajes", "/comunidad", "/como-funciona", "/faq", "/aviso-legal", "/privacidad", "/cookies", "/condiciones"].map(
    (path) => ({ url: `${siteUrl}${path}`, lastModified: new Date() })
  );

  const tripRoutes = trips.map((trip) => ({
    url: `${siteUrl}/viajes/${trip.slug}`,
    lastModified: trip.updatedAt,
  }));

  return [...staticRoutes, ...tripRoutes];
}
