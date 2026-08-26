"use client";

import { track, type AnalyticsEventName } from "@/lib/analytics/events";

export function TrackedLink({
  href,
  event,
  className,
  children,
}: {
  href: string;
  event: AnalyticsEventName;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <a href={href} target="_blank" rel="noreferrer" onClick={() => track(event)} className={className}>
      {children}
    </a>
  );
}
