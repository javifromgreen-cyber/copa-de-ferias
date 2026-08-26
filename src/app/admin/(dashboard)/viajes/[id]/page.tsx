import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { TripForm } from "@/components/admin/TripForm";
import { tripToFormInput } from "@/lib/admin/trip-form-mapping";

export const metadata: Metadata = { title: "Admin — Editar viaje" };

export default async function EditTripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const trip = await prisma.trip.findUnique({
    where: { id },
    include: {
      origins: { orderBy: { order: "asc" } },
      planningDays: { orderBy: { order: "asc" } },
      activities: { orderBy: { order: "asc" } },
      inclusions: { orderBy: { order: "asc" } },
      requirements: { orderBy: { order: "asc" } },
      faqs: { orderBy: { order: "asc" } },
    },
  });
  if (!trip) notFound();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl uppercase">
          Editar — {trip.name} #{String(trip.number).padStart(3, "0")}
        </h1>
        {trip.published ? (
          <Link href={`/viajes/${trip.slug}`} target="_blank" className="text-sm underline">
            Ver ficha pública ↗
          </Link>
        ) : null}
      </div>
      <p className="mb-6 text-sm text-carbon/60">
        Plazas vendidas: {trip.soldSpots} (se actualizan automáticamente con las reservas).
      </p>
      <TripForm initial={tripToFormInput(trip)} />
    </div>
  );
}
