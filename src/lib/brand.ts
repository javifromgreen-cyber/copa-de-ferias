import { prisma } from "@/lib/db";

/**
 * Central brand identity. Everything here is stored in BrandConfig and
 * editable from Admin > Configuración — no page should hardcode "Copa de
 * Ferias" text directly; import this instead, so the name can change later
 * without touching dozens of files.
 */
export type Brand = {
  name: string;
  shortName: string;
  claim: string;
  contactEmail: string;
  instagramUrl: string;
  facebookUrl: string;
  tiktokUrl: string;
  legalName: string;
  legalTaxId: string;
  legalAddress: string;
  legalLicense: string;
  insuranceInfo: string;
  reviewsProvider: string;
  reviewsUrl: string;
  reviewsVisible: boolean;
  ga4Id: string;
  metaPixelId: string;
  tiktokPixelId: string;
  notifyEmailEnabled: boolean;
};

export const DEFAULT_BRAND: Brand = {
  name: "Copa de Ferias",
  shortName: "CDF",
  claim: "Fútbol que merece el viaje.",
  contactEmail: "hola@copadeferias.com",
  instagramUrl: "",
  facebookUrl: "",
  tiktokUrl: "",
  legalName: "",
  legalTaxId: "",
  legalAddress: "",
  legalLicense: "",
  insuranceInfo: "",
  reviewsProvider: "none",
  reviewsUrl: "",
  reviewsVisible: false,
  ga4Id: "",
  metaPixelId: "",
  tiktokPixelId: "",
  notifyEmailEnabled: false,
};

export async function getBrand(): Promise<Brand> {
  try {
    const config = await prisma.brandConfig.findUnique({ where: { id: "default" } });
    if (!config) return DEFAULT_BRAND;
    return config;
  } catch {
    return DEFAULT_BRAND;
  }
}
