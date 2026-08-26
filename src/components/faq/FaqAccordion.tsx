"use client";

import { useState } from "react";

export type FaqItem = { id: string; question: string; answer: string };

export function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [openId, setOpenId] = useState<string | null>(items[0]?.id ?? null);

  return (
    <div className="divide-y divide-carbon/10 border-y border-carbon/10">
      {items.map((item) => {
        const open = openId === item.id;
        return (
          <div key={item.id}>
            <button
              type="button"
              onClick={() => setOpenId(open ? null : item.id)}
              aria-expanded={open}
              className="flex w-full items-center justify-between gap-4 py-4 text-left"
            >
              <span className="font-medium text-carbon">{item.question}</span>
              <span className="shrink-0 text-xl text-carbon/40" aria-hidden>
                {open ? "−" : "+"}
              </span>
            </button>
            {open ? <p className="pb-4 text-sm text-carbon/70">{item.answer}</p> : null}
          </div>
        );
      })}
    </div>
  );
}
