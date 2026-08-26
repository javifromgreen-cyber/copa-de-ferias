"use client";

import Link from "next/link";
import { useState } from "react";
import { Logo } from "@/components/brand/Logo";
import { ButtonLink } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import type { Brand } from "@/lib/brand";

const NAV = [
  { href: "/", label: "Inicio" },
  { href: "/viajes", label: "Viajes" },
  { href: "/comunidad", label: "Comunidad" },
  { href: "/como-funciona", label: "Cómo funciona" },
  { href: "/faq", label: "FAQ" },
];

export function Header({ brand }: { brand: Brand }) {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-carbon/10 bg-ivory/95 backdrop-blur">
      <Container className="flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2" onClick={() => setOpen(false)}>
          <Logo className="h-8 w-8 text-carbon" />
          <span className="font-display text-sm tracking-[0.2em] uppercase">{brand.name}</span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm font-medium tracking-wide text-carbon/80 transition-colors hover:text-carbon"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden md:block">
          <ButtonLink href="/viajes" className="px-5 py-2.5 text-xs">
            Ver viajes
          </ButtonLink>
        </div>

        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center md:hidden"
          aria-label={open ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="sr-only">Menú</span>
          <div className="flex flex-col gap-1.5">
            <span className={`h-0.5 w-6 bg-carbon transition-transform ${open ? "translate-y-2 rotate-45" : ""}`} />
            <span className={`h-0.5 w-6 bg-carbon transition-opacity ${open ? "opacity-0" : ""}`} />
            <span className={`h-0.5 w-6 bg-carbon transition-transform ${open ? "-translate-y-2 -rotate-45" : ""}`} />
          </div>
        </button>
      </Container>

      {open ? (
        <div className="border-t border-carbon/10 bg-ivory md:hidden">
          <Container className="flex flex-col gap-1 py-4">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-sm px-2 py-3 text-base font-medium text-carbon hover:bg-ivory-dark"
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            ))}
            <ButtonLink href="/viajes" className="mt-2 justify-center" onClick={() => setOpen(false)}>
              Ver viajes
            </ButtonLink>
          </Container>
        </div>
      ) : null}
    </header>
  );
}
