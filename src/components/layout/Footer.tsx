import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { Container } from "@/components/ui/Container";
import type { Brand } from "@/lib/brand";

export function Footer({ brand }: { brand: Brand }) {
  const socials = [
    { label: "Instagram", url: brand.instagramUrl },
    { label: "Facebook", url: brand.facebookUrl },
    { label: "TikTok", url: brand.tiktokUrl },
  ].filter((s) => s.url);

  return (
    <footer className="mt-24 border-t border-carbon/10 bg-carbon text-ivory">
      <Container className="grid gap-10 py-14 sm:grid-cols-2 md:grid-cols-4">
        <div className="sm:col-span-2 md:col-span-1">
          <div className="mb-3 flex items-center gap-2">
            <Logo className="h-9 w-9" />
            <span className="font-display text-sm tracking-[0.2em] uppercase">{brand.name}</span>
          </div>
          <p className="text-sm text-ivory/70">{brand.claim}</p>
        </div>

        <div>
          <h3 className="font-display mb-3 text-xs tracking-[0.2em] text-ivory/50 uppercase">Copa de Ferias</h3>
          <ul className="space-y-2 text-sm">
            <li><Link href="/viajes" className="text-ivory/80 hover:text-ivory">Partidos</Link></li>
            <li><Link href="/competiciones" className="text-ivory/80 hover:text-ivory">Competiciones</Link></li>
            <li><Link href="/como-funciona" className="text-ivory/80 hover:text-ivory">Cómo funciona</Link></li>
            <li><Link href="/faq" className="text-ivory/80 hover:text-ivory">FAQ</Link></li>
          </ul>
        </div>

        <div>
          <h3 className="font-display mb-3 text-xs tracking-[0.2em] text-ivory/50 uppercase">Contacto</h3>
          <ul className="space-y-2 text-sm">
            <li>
              <a href={`mailto:${brand.contactEmail}`} className="text-ivory/80 hover:text-ivory">
                {brand.contactEmail}
              </a>
            </li>
            {socials.map((s) => (
              <li key={s.label}>
                <a href={s.url} target="_blank" rel="noreferrer" className="text-ivory/80 hover:text-ivory">
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="font-display mb-3 text-xs tracking-[0.2em] text-ivory/50 uppercase">Legal</h3>
          <ul className="space-y-2 text-sm">
            <li><Link href="/aviso-legal" className="text-ivory/80 hover:text-ivory">Aviso legal</Link></li>
            <li><Link href="/privacidad" className="text-ivory/80 hover:text-ivory">Privacidad</Link></li>
            <li><Link href="/cookies" className="text-ivory/80 hover:text-ivory">Cookies</Link></li>
            <li><Link href="/condiciones" className="text-ivory/80 hover:text-ivory">Condiciones</Link></li>
          </ul>
        </div>
      </Container>

      <div className="border-t border-ivory/10 py-6">
        <Container>
          <p className="text-xs text-ivory/50">
            © {new Date().getFullYear()} {brand.name}.
          </p>
        </Container>
      </div>
    </footer>
  );
}
