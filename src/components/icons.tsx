/**
 * Copa de Ferias icon set — minimal, geometric, sharp-cornered silhouettes
 * in the same visual language as the logo (no rounded modern line icons).
 * Single-color (currentColor), no strokes, built from a few rects/polygons
 * so they read at small sizes. Use sparingly — only where an icon genuinely
 * helps scan a section, never as decoration.
 */
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { title?: string };

function IconBase({ children, title, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden={title ? undefined : true} role={title ? "img" : undefined} {...props}>
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

/** Habitaciones */
export function BedIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="3" y="10" width="6" height="4" />
      <rect x="9" y="12" width="12" height="2" />
      <rect x="2" y="14" width="20" height="2" />
      <rect x="2" y="16" width="2" height="4" />
      <rect x="20" y="16" width="2" height="4" />
    </IconBase>
  );
}

/** Hotel — stepped tower, echoes the logo's tiered form */
export function BuildingIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="9" y="2" width="6" height="4" />
      <rect x="6" y="6" width="12" height="4" />
      <rect x="3" y="10" width="18" height="10" />
    </IconBase>
  );
}

/** Transporte */
export function PlaneIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="11" y="2" width="2" height="15" />
      <polygon points="2,11 11,8.5 11,12.5" />
      <polygon points="22,11 13,8.5 13,12.5" />
      <polygon points="9,21 12,17 15,21" />
    </IconBase>
  );
}

/** Partido y entrada */
export function TicketIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <polygon points="2,6 22,6 22,10 20,12 22,14 22,18 2,18 2,14 4,12 2,10" />
    </IconBase>
  );
}

/** Experiencia futbolística — a small version of the logo's stepped bowl */
export function StadiumIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M2,10 L2,14 L6,14 L6,18 L10,18 L10,20 L14,20 L14,18 L18,18 L18,14 L22,14 L22,10 Z" />
    </IconBase>
  );
}

/** Seguro */
export function ShieldIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <polygon points="12,2 20,5 20,12 12,22 4,12 4,5" />
    </IconBase>
  );
}

/** Incluido */
export function CheckIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <polygon points="9,17 3,11 5,9 9,13 19,3 21,5" />
    </IconBase>
  );
}

/** No incluido */
export function CrossIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <polygon points="4,6 6,4 12,10 18,4 20,6 14,12 20,18 18,20 12,14 6,20 4,18 10,12" />
    </IconBase>
  );
}

/** Checklist / requisitos */
export function ClipboardIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="5" y="4" width="14" height="18" />
      <rect x="9" y="2" width="6" height="4" />
    </IconBase>
  );
}

/** Gestionar mi reserva */
export function SlidersIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="2" y="5" width="20" height="2" />
      <rect x="14" y="3" width="4" height="6" />
      <rect x="2" y="11" width="20" height="2" />
      <rect x="6" y="9" width="4" height="6" />
      <rect x="2" y="17" width="20" height="2" />
      <rect x="14" y="15" width="4" height="6" />
    </IconBase>
  );
}

/** Información general / cómo funciona */
export function InfoIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="10" y="10" width="4" height="10" />
      <rect x="10" y="3" width="4" height="4" />
    </IconBase>
  );
}

/** WhatsApp / grupo — simple speech-bubble silhouette, kept geometric */
export function ChatIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M3,3 H21 V16 H10 L5,20 V16 H3 Z" />
    </IconBase>
  );
}
