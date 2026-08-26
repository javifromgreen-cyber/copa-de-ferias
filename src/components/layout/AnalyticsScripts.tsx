"use client";

import Script from "next/script";
import { useEffect, useState } from "react";
import type { Brand } from "@/lib/brand";

const CONSENT_KEY = "cdf_cookie_consent_marketing";

/**
 * Loads GA4 / Meta Pixel / TikTok Pixel only when: an ID is configured AND
 * the visitor has given marketing consent (see CookieConsent). No PII is
 * ever passed to these scripts — see src/lib/analytics/events.ts.
 */
export function AnalyticsScripts({ brand }: { brand: Brand }) {
  const [consented, setConsented] = useState(false);

  useEffect(() => {
    // One-time, client-only read of localStorage — SSR can't know consent
    // state, so a second render after mount is unavoidable here.
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setConsented(window.localStorage.getItem(CONSENT_KEY) === "true");
    } catch {
      setConsented(false);
    }
  }, []);

  if (!consented) return null;

  return (
    <>
      {brand.ga4Id ? (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${brand.ga4Id}`} strategy="afterInteractive" />
          <Script id="ga4-init" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${brand.ga4Id}');
              window.gtag = gtag;`}
          </Script>
        </>
      ) : null}

      {brand.metaPixelId ? (
        <Script id="meta-pixel-init" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
            n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
            document,'script','https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '${brand.metaPixelId}');
            fbq('track', 'PageView');`}
        </Script>
      ) : null}

      {brand.tiktokPixelId ? (
        <Script id="tiktok-pixel-init" strategy="afterInteractive">
          {`!function (w, d, t) {
            w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=i,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};var o=document.createElement("script");o.type="text/javascript",o.async=!0,o.src=i+"?sdkid="+e+"&lib="+t;var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};
            ttq.load('${brand.tiktokPixelId}');
            ttq.page();
          }(window, document, 'ttq');`}
        </Script>
      ) : null}
    </>
  );
}
