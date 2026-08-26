import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { TripForm } from "@/components/admin/TripForm";
import { BLANK_TRIP_FORM } from "@/lib/admin/trip-form-mapping";

export const metadata: Metadata = { title: "Admin — Nuevo viaje" };

export default async function NewTripPage() {
  const maxNumber = await prisma.trip.aggregate({ _max: { number: true } });

  return (
    <div>
      <h1 className="font-display mb-6 text-2xl uppercase">Nuevo viaje</h1>
      <TripForm initial={{ ...BLANK_TRIP_FORM, number: (maxNumber._max.number ?? 0) + 1 }} />
    </div>
  );
}
