import Link from "next/link";
import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { formatCurrency } from "@/lib/utils";
import { TicketOfferQuickToggle } from "@/components/admin/TicketOfferQuickToggle";

export const metadata: Metadata = { title: "Admin — Entradas" };

const selectClass = "rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm";

export default async function AdminTicketOffersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; competitionId?: string; provider?: string; status?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const competitionId = sp.competitionId ?? "";
  const provider = sp.provider ?? "";
  const status = sp.status ?? "";

  const where: Prisma.TicketOfferWhereInput = {};
  if (competitionId) where.event = { competitionId };
  if (provider) where.provider = provider;
  if (status === "active") where.active = true;
  if (status === "inactive") where.active = false;
  if (q) {
    where.OR = [
      { event: { homeTeam: { contains: q } } },
      { event: { awayTeam: { contains: q } } },
      { category: { contains: q } },
      { sector: { contains: q } },
    ];
  }

  const [offers, competitions, providers] = await Promise.all([
    prisma.ticketOffer.findMany({
      where,
      include: { event: { include: { competition: true, trip: true } } },
      orderBy: [{ event: { matchDate: "asc" } }, { createdAt: "asc" }],
    }),
    prisma.competition.findMany({ orderBy: { name: "asc" } }),
    prisma.ticketOffer.findMany({ distinct: ["provider"], select: { provider: true }, orderBy: { provider: "asc" } }),
  ]);

  const hasFilters = q || competitionId || provider || status;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl uppercase">Entradas</h1>
        <p className="text-sm text-carbon/60">{offers.length} oferta(s)</p>
      </div>
      <p className="mb-4 text-sm text-carbon/60">
        Todas las ofertas de entradas, de todos los partidos. Para editar o crear una nueva, abre el evento correspondiente.
      </p>

      <form method="get" className="mb-4 flex flex-wrap items-end gap-3 rounded-sm border border-carbon/15 bg-white p-4">
        <div>
          <label htmlFor="f-q" className="mb-1 block text-xs tracking-wide text-carbon/60 uppercase">
            Buscar
          </label>
          <input
            id="f-q"
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Equipo, categoría, sector…"
            className="w-56 rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="f-competitionId" className="mb-1 block text-xs tracking-wide text-carbon/60 uppercase">
            Competición
          </label>
          <select id="f-competitionId" name="competitionId" defaultValue={competitionId} className={selectClass}>
            <option value="">Todas</option>
            {competitions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="f-provider" className="mb-1 block text-xs tracking-wide text-carbon/60 uppercase">
            Proveedor
          </label>
          <select id="f-provider" name="provider" defaultValue={provider} className={selectClass}>
            <option value="">Todos</option>
            {providers.map((p) => (
              <option key={p.provider} value={p.provider}>
                {p.provider}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="f-status" className="mb-1 block text-xs tracking-wide text-carbon/60 uppercase">
            Estado
          </label>
          <select id="f-status" name="status" defaultValue={status} className={selectClass}>
            <option value="">Todos</option>
            <option value="active">Activas</option>
            <option value="inactive">Inactivas</option>
          </select>
        </div>
        <button type="submit" className="rounded-sm bg-carbon px-4 py-2 text-sm font-semibold text-ivory">
          Filtrar
        </button>
        {hasFilters ? (
          <Link href="/admin/entradas" className="text-xs underline">
            Limpiar filtros
          </Link>
        ) : null}
      </form>

      <div className="overflow-x-auto rounded-sm border border-carbon/15 bg-white">
        <table className="w-full min-w-[1000px] text-left text-sm">
          <thead className="border-b border-carbon/10 text-xs tracking-wide text-carbon/50 uppercase">
            <tr>
              <th className="px-4 py-3">Partido</th>
              <th className="px-4 py-3">Competición</th>
              <th className="px-4 py-3">Categoría / sector</th>
              <th className="px-4 py-3">Proveedor</th>
              <th className="px-4 py-3">Coste</th>
              <th className="px-4 py-3">Stock</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {offers.map((offer) => (
              <tr key={offer.id} className="border-b border-carbon/5 last:border-0">
                <td className="px-4 py-3">
                  {offer.event.homeTeam} vs {offer.event.awayTeam}
                  <br />
                  <span className="text-xs text-carbon/50">{offer.event.matchDate.toLocaleDateString("es-ES")}</span>
                </td>
                <td className="px-4 py-3">{offer.event.competition?.name ?? "— sin clasificar —"}</td>
                <td className="px-4 py-3">
                  {offer.category}
                  {offer.sector ? ` — ${offer.sector}` : ""}
                </td>
                <td className="px-4 py-3">{offer.provider}</td>
                <td className="px-4 py-3">{formatCurrency(offer.costNet, offer.currency)}</td>
                <td className="px-4 py-3">{offer.stock}</td>
                <td className="px-4 py-3">
                  <TicketOfferQuickToggle id={offer.id} active={offer.active} />
                </td>
                <td className="px-4 py-3">
                  <Link href={`/admin/eventos/${offer.eventId}`} className="text-xs underline">
                    Editar
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {offers.length === 0 ? <p className="mt-6 text-carbon/60">No hay ofertas de entradas que coincidan con estos filtros.</p> : null}
    </div>
  );
}
