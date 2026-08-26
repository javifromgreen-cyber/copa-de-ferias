import { prisma } from "@/lib/db";
import { toCsv, csvResponse } from "@/lib/csv";

export async function GET() {
  const bookings = await prisma.booking.findMany({ orderBy: { createdAt: "desc" }, include: { trip: true } });

  const headers = [
    "referencia",
    "viaje",
    "comprador_nombre",
    "comprador_apellidos",
    "comprador_email",
    "comprador_telefono",
    "origen",
    "viajeros",
    "total",
    "moneda",
    "proveedor_pago",
    "estado_pago",
    "estado_reserva",
    "fecha",
  ];

  const rows = bookings.map((b) => [
    b.reference,
    b.trip.name,
    b.buyerFirstName,
    b.buyerLastName,
    b.buyerEmail,
    b.buyerPhone,
    b.originCity,
    b.travelersCount,
    b.totalPrice,
    b.currency,
    b.paymentProvider,
    b.paymentStatus,
    b.bookingStatus,
    b.createdAt.toISOString(),
  ]);

  return csvResponse("reservas.csv", toCsv(headers, rows));
}
