"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { LeadModal } from "@/components/trips/LeadModal";

export function WaitlistCta({ tripId, tripName }: { tripId: string; tripName: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button className="w-full" onClick={() => setOpen(true)}>
        Apuntarme a la lista de espera
      </Button>
      <LeadModal open={open} onClose={() => setOpen(false)} tripId={tripId} tripName={tripName} type="waitlist" />
    </>
  );
}
