import type { Metadata } from "next";
import { CompetitionForm } from "@/components/admin/CompetitionForm";

export const metadata: Metadata = { title: "Admin — Nueva competición" };

export default function NewCompetitionPage() {
  return (
    <div>
      <h1 className="font-display mb-6 text-2xl uppercase">Nueva competición</h1>
      <CompetitionForm initial={{ name: "", region: "EUROPE", country: "", competitionType: "DOMESTIC_LEAGUE" }} />
    </div>
  );
}
