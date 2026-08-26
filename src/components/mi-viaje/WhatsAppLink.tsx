"use client";

import { track } from "@/lib/analytics/events";

export function WhatsAppLink({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      onClick={() => track("whatsapp_clicked")}
      className="inline-block rounded-sm bg-carbon px-6 py-3 text-sm font-semibold tracking-wide text-ivory uppercase"
    >
      Unirme al grupo
    </a>
  );
}
