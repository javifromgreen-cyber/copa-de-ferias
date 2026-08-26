"use client";

import { cloneElement, isValidElement, useId } from "react";

/**
 * Wraps a single form control and associates it with its label via
 * htmlFor/id, generated once per field. Centralizing this means every
 * admin form gets correctly labelled inputs without threading ids through
 * dozens of call sites by hand.
 */
export function Field({ label, children }: { label: string; children: React.ReactElement }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs tracking-wide text-carbon/60 uppercase">
        {label}
      </label>
      {isValidElement(children) ? cloneElement(children, { id } as Record<string, unknown>) : children}
    </div>
  );
}
