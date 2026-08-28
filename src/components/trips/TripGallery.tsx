"use client";

import { useState } from "react";
import { TripPhoto, type PhotoTone } from "@/components/trips/TripPhoto";

// Gallery-left ficha layout (§18/§19): a big main photo + thumbnails, "ver
// todas las fotos" once more exist, mobile carousel. There's no per-trip
// photo set in the data model yet — every tile is the same procedural
// TripPhoto treatment (deterministic from heroImageKey), just a different
// `variant` (a different palette/angle from the *same* key), which is
// exactly what `variant` was built for. Never an external/hardcoded URL.
const THUMBNAILS = 4;
const LIGHTBOX_TILES = 8;

export function TripGallery({
  heroImageKey,
  tone,
  label,
}: {
  heroImageKey: string;
  tone: PhotoTone;
  label?: string;
}) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const tiles = Array.from({ length: LIGHTBOX_TILES }, (_, i) => i);

  return (
    <div>
      {/* Desktop / tablet: main + thumbnail grid */}
      <div className="hidden gap-2 sm:grid sm:grid-cols-[2fr_1fr]">
        <button type="button" onClick={() => setLightboxIndex(0)} aria-label="Ampliar foto principal del partido" className="block cursor-zoom-in">
          <TripPhoto heroImageKey={heroImageKey} tone={tone} variant={0} label={label} className="aspect-[4/3] w-full rounded-sm" />
        </button>
        <div className="grid grid-cols-2 gap-2">
          {tiles.slice(1, 1 + THUMBNAILS).map((v, i) => {
            const isLast = i === THUMBNAILS - 1;
            return (
              <button
                key={v}
                type="button"
                onClick={() => setLightboxIndex(v)}
                aria-label={isLast ? "Ver todas las fotos del partido" : `Ver foto ${v + 1} del partido`}
                className="relative block cursor-zoom-in"
              >
                <TripPhoto heroImageKey={heroImageKey} tone={tone} variant={v} className="aspect-square w-full rounded-sm" />
                {isLast ? (
                  <span aria-hidden className="font-display absolute inset-0 flex items-center justify-center rounded-sm bg-carbon/55 text-center text-xs tracking-wide text-ivory uppercase">
                    Ver todas
                    <br />
                    las fotos
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* Mobile: swipeable carousel */}
      <div className="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 sm:hidden">
        {tiles.slice(0, THUMBNAILS + 1).map((v) => (
          <button key={v} type="button" onClick={() => setLightboxIndex(v)} aria-label={v === 0 ? "Ampliar foto principal del partido" : `Ver foto ${v + 1} del partido`} className="block w-[85%] shrink-0 snap-center">
            <TripPhoto heroImageKey={heroImageKey} tone={tone} variant={v} label={v === 0 ? label : undefined} className="aspect-[4/3] w-full rounded-sm" />
          </button>
        ))}
      </div>

      {lightboxIndex !== null ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Galería de fotos del partido"
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-carbon/95 p-4"
          onClick={() => setLightboxIndex(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxIndex(null)}
            aria-label="Cerrar galería"
            className="absolute top-4 right-4 flex h-10 w-10 items-center justify-center rounded-full border border-ivory/40 text-xl text-ivory"
          >
            ×
          </button>

          <TripPhoto
            heroImageKey={heroImageKey}
            tone={tone}
            variant={lightboxIndex}
            className="aspect-[4/3] w-full max-w-2xl rounded-sm"
          />

          <div className="flex items-center gap-4 text-ivory">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setLightboxIndex((i) => (i === null ? 0 : (i - 1 + tiles.length) % tiles.length));
              }}
              aria-label="Foto anterior"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-ivory/40"
            >
              ‹
            </button>
            <span className="text-xs tracking-wide">
              {lightboxIndex + 1} / {tiles.length}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setLightboxIndex((i) => (i === null ? 0 : (i + 1) % tiles.length));
              }}
              aria-label="Foto siguiente"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-ivory/40"
            >
              ›
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
