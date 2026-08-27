import type { PackageType } from "@prisma/client";

export const PACKAGE_TYPE_LABELS: Record<PackageType, string> = {
  TICKET_ONLY: "Solo entrada",
  TICKET_HOTEL: "Entrada + hotel",
  TICKET_HOTEL_FLIGHT: "Entrada + hotel + vuelo",
};

export const ALL_PACKAGE_TYPES: PackageType[] = ["TICKET_ONLY", "TICKET_HOTEL", "TICKET_HOTEL_FLIGHT"];

/** Same comma-separated-CSV pattern as parseRequiredFields — see src/lib/checkout/travelerFields.ts. */
export function parseAvailablePackageTypes(csv: string): PackageType[] {
  const known = new Set<string>(ALL_PACKAGE_TYPES);
  return csv
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is PackageType => known.has(s));
}
