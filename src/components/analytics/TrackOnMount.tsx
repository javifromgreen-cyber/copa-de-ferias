"use client";

import { useEffect } from "react";
import { track, type AnalyticsEventName, type AnalyticsEventPayload } from "@/lib/analytics/events";

export function TrackOnMount({ event, payload }: { event: AnalyticsEventName; payload?: AnalyticsEventPayload }) {
  useEffect(() => {
    track(event, payload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event]);
  return null;
}
