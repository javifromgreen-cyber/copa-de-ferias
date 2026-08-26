"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { adminLogout } from "@/server/actions/admin-auth";
import { Logo } from "@/components/brand/Logo";

const LINKS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/viajes", label: "Viajes" },
  { href: "/admin/reservas", label: "Reservas" },
  { href: "/admin/viajeros", label: "Viajeros" },
  { href: "/admin/interesados", label: "Interesados" },
  { href: "/admin/emails", label: "Emails" },
  { href: "/admin/configuracion", label: "Configuración" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <header className="border-b border-carbon/10 bg-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <Logo className="h-6 w-6 text-carbon" />
          <span className="font-display text-sm tracking-widest uppercase">Admin</span>
        </div>
        <nav className="flex flex-wrap gap-1 text-sm">
          {LINKS.map((link) => {
            const active = link.href === "/admin" ? pathname === "/admin" : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-sm px-3 py-1.5 ${active ? "bg-carbon text-ivory" : "text-carbon/70 hover:bg-ivory-dark"}`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <form action={adminLogout}>
          <button type="submit" className="text-xs text-carbon/50 underline hover:text-carbon">
            Salir
          </button>
        </form>
      </div>
    </header>
  );
}
