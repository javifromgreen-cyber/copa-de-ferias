import type { PackageType } from "@prisma/client";

export function packageRequiresHotel(packageType: PackageType): boolean {
  return packageType === "TICKET_HOTEL" || packageType === "TICKET_HOTEL_FLIGHT";
}

export function packageRequiresFlight(packageType: PackageType): boolean {
  return packageType === "TICKET_HOTEL_FLIGHT";
}

export const PACKAGE_TYPE_COPY: Record<PackageType, { label: string; description: string }> = {
  TICKET_ONLY: { label: "Entrada", description: "Solo la entrada para el partido." },
  TICKET_HOTEL: { label: "Entrada + Hotel", description: "Entrada y alojamiento." },
  TICKET_HOTEL_FLIGHT: { label: "Entrada + Hotel + Vuelo", description: "Entrada, alojamiento y vuelo." },
};
