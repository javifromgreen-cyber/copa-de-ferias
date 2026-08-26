import { prisma } from "@/lib/db";
import { toCsv, csvResponse } from "@/lib/csv";

export async function GET() {
  const travelers = await prisma.traveler.findMany({
    orderBy: { createdAt: "desc" },
    include: { booking: { include: { trip: true } } },
  });

  const headers = [
    "reserva",
    "viaje",
    "nombre",
    "apellidos",
    "nacimiento",
    "nacionalidad",
    "sexo",
    "tipo_documento",
    "numero_documento",
    "caducidad_documento",
    "pais_emisor",
    "telefono",
    "contacto_emergencia",
    "direccion",
    "origen",
    "habitacion",
    "companero_habitacion",
    "pasaporte_cdf",
  ];

  const rows = travelers.map((t) => [
    t.booking.reference,
    t.booking.trip.name,
    t.firstName,
    t.lastName,
    t.birthDate ? t.birthDate.toISOString().slice(0, 10) : "",
    t.nationality,
    t.sex,
    t.docType,
    t.docNumber,
    t.docExpiry ? t.docExpiry.toISOString().slice(0, 10) : "",
    t.docCountry,
    t.phone,
    t.emergencyContact,
    t.address,
    t.booking.originCity,
    t.roomPreference,
    t.roomPartnerName,
    t.booking.passportStatus,
  ]);

  return csvResponse("viajeros.csv", toCsv(headers, rows));
}
