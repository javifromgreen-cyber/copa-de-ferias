import { PassportIcon } from "@/components/icons";
import { TravelerContactCard } from "./TravelerContactCard";
import type { AtuAireMiViajeView } from "@/lib/mi-viaje/buildAtuAireView";

/**
 * §13/§14: traveler data was already collected at checkout, so this is a
 * read view by default — never an open "complete your data" form for a
 * booking that already has everything it needs.
 */
export function TravelersSection({ view, accessToken }: { view: AtuAireMiViajeView; accessToken: string }) {
  return (
    <details id="viajeros" open className="scroll-mt-6 border-b border-carbon/15 py-8">
      <summary className="mb-4 flex cursor-pointer list-none items-center gap-2 text-lg font-display uppercase">
        <PassportIcon className="h-5 w-5 shrink-0" />
        Viajeros
      </summary>
      <div className="space-y-3">
        {view.travelers.map((t) => (
          <TravelerContactCard key={t.id} accessToken={accessToken} traveler={t} />
        ))}
      </div>
    </details>
  );
}
