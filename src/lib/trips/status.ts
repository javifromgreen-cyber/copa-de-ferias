import type { Trip, TripStatus } from "@prisma/client";

/**
 * Public-facing label for each internal trip status. Deliberately has no
 * "guaranteed departure" badge anywhere — see build spec §17.
 */
export function publicStatusLabel(status: TripStatus): string {
  switch (status) {
    case "upcoming":
      return "Próximamente";
    case "open":
      return "Abierto";
    case "sold_out":
      return "Agotado";
    case "completed":
      return "Realizado";
    case "draft":
    case "archived":
      return "";
  }
}

/** Whether a trip shows up as a card on /viajes and (if homeFeatured) on home. */
export function isPubliclyListed(trip: Pick<Trip, "status">): boolean {
  return ["upcoming", "open", "sold_out", "completed"].includes(trip.status);
}

/** Whether /viajes/[slug] should render, vs. only a "notify me" card. */
export function hasPublicTripPage(trip: Pick<Trip, "published">): boolean {
  return trip.published;
}

export function spotsLeft(trip: Pick<Trip, "maxSpots" | "soldSpots">): number {
  return Math.max(0, trip.maxSpots - trip.soldSpots);
}

export function isSoldOut(trip: Pick<Trip, "maxSpots" | "soldSpots">): boolean {
  return spotsLeft(trip) <= 0;
}

export function effectiveStatus(trip: Pick<Trip, "status" | "maxSpots" | "soldSpots">): TripStatus {
  if (trip.status === "open" && isSoldOut(trip)) return "sold_out";
  return trip.status;
}
