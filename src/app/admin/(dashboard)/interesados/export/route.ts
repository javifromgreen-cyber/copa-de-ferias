import { prisma } from "@/lib/db";
import { toCsv, csvResponse } from "@/lib/csv";

export async function GET() {
  const leads = await prisma.lead.findMany({ orderBy: { createdAt: "desc" }, include: { trip: true } });

  const headers = ["tipo", "viaje", "nombre", "email", "ciudad", "consentimiento", "fecha"];
  const rows = leads.map((lead) => [
    lead.type,
    lead.trip ? lead.trip.name : "General",
    lead.name,
    lead.email,
    lead.city,
    lead.consent ? "si" : "no",
    lead.createdAt.toISOString(),
  ]);

  return csvResponse("interesados.csv", toCsv(headers, rows));
}
