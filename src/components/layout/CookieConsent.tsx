"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import Link from "next/link";

const STORAGE_KEY = "cdf_cookie_consent_marketing";
const SEEN_KEY = "cdf_cookie_consent_seen";

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // One-time, client-only read of localStorage to decide whether to show
    // the banner — there is no way to know this during SSR, so a second
    // render after mount is unavoidable here.
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (!window.localStorage.getItem(SEEN_KEY)) setVisible(true);
    } catch {
      // localStorage unavailable — skip the banner rather than block the page.
    }
  }, []);

  function decide(acceptMarketing: boolean) {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(acceptMarketing));
      window.localStorage.setItem(SEEN_KEY, "true");
    } catch {
      // ignore
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-carbon/10 bg-ivory p-4 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] sm:p-6">
      <div className="mx-auto flex max-w-4xl flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-carbon/80">
          Usamos cookies necesarias para que la web funcione y, si nos das permiso, cookies de analítica y marketing.
          Más info en <Link href="/cookies" className="underline">nuestra política de cookies</Link>.
        </p>
        <div className="flex shrink-0 gap-2">
          <Button variant="secondary" className="px-4 py-2 text-xs" onClick={() => decide(false)}>
            Solo necesarias
          </Button>
          <Button className="px-4 py-2 text-xs" onClick={() => decide(true)}>
            Aceptar
          </Button>
        </div>
      </div>
    </div>
  );
}
