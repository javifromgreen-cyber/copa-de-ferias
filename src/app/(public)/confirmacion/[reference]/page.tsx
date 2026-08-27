import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { ButtonLink } from "@/components/ui/Button";
import { prisma } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/utils";
import { isDemoMode } from "@/lib/env";

// Must show the booking that was just created, never a cached page.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Reserva confirmada" };

export default async function ConfirmationPage({
  params,
  searchParams,
}: {
  params: Promise<{ reference: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { reference } = await params;
  const { token } = await searchParams;

  const booking = await prisma.booking.findUnique({
    where: { reference },
    include: { trip: true, travelers: true },
  });

  if (!booking || !token || booking.accessToken !== token) notFound();

  const isSimulation = isDemoMode() || booking.trip.isDemo;
  const origins = [...new Set(booking.travelers.map((t) => t.originCity).filter(Boolean))];
  const originLabel = origins.length > 0 ? origins.join(" · ") : booking.originCity;

  return (
    <Container className="max-w-2xl py-16 text-center sm:py-24">
      <p className="font-display mb-3 text-xs tracking-[0.25em] text-cement uppercase">Reserva confirmada</p>
      <h1 className="font-display mb-4 text-3xl uppercase sm:text-4xl">Ya estás dentro</h1>
      <p className="mb-8 text-carbon/70">
        Tu plaza para <strong>{booking.trip.name} — {booking.trip.subtitle}</strong> está confirmada. Referencia{" "}
        <strong>{booking.reference}</strong>.
      </p>

      {isSimulation ? (
        <p className="mb-8 rounded-sm border border-stamp/40 bg-stamp/10 p-4 text-sm text-stamp">
          Esto es una simulación de reserva (modo demo). No se ha realizado ningún cargo real.
        </p>
      ) : null}

      <div className="mb-10 rounded-sm border border-carbon/15 p-6 text-left text-sm">
        <dl className="space-y-2">
          <div className="flex justify-between">
            <dt className="text-carbon/50">Viajeros</dt>
            <dd>{booking.travelersCount}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-carbon/50">{origins.length > 1 ? "Orígenes" : "Origen"}</dt>
            <dd>{originLabel}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-carbon/50">Fecha del partido</dt>
            <dd>{formatDate(booking.trip.matchDate)}</dd>
          </div>
          <div className="flex justify-between border-t border-carbon/10 pt-2 font-semibold">
            <dt>Total pagado</dt>
            <dd>{formatCurrency(booking.totalPrice, booking.currency)}</dd>
          </div>
        </dl>
      </div>

      <p className="mb-2 text-sm text-carbon/60">
        Hemos enviado la confirmación a {booking.buyerEmail}
        {isSimulation ? " (simulado — en modo demo no se envían emails reales, consulta el log en Admin)." : "."}
      </p>
      <p className="mb-8 text-sm text-carbon/60">
        Te iremos enviando la información del viaje a medida que se acerque la fecha.
      </p>

      <ButtonLink href={`/mi-viaje/${booking.accessToken}`}>Ir a Mi Viaje</ButtonLink>
    </Container>
  );
}
