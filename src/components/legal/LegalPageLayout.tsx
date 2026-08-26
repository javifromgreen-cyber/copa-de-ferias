import { Container } from "@/components/ui/Container";

export function LegalPageLayout({
  title,
  updatedNote,
  children,
}: {
  title: string;
  updatedNote?: string;
  children: React.ReactNode;
}) {
  return (
    <Container className="max-w-3xl py-16 sm:py-20">
      <h1 className="font-display mb-4 text-3xl uppercase sm:text-4xl">{title}</h1>
      <div className="mb-10 rounded-sm border border-stamp/40 bg-stamp/10 p-4 text-sm text-stamp">
        Documento de referencia para la fase de desarrollo. Debe ser revisado por un profesional legal antes de
        operar comercialmente — ver docs/LEGAL_CHECKLIST.md.
      </div>
      <div className="prose-legal space-y-6 text-sm leading-relaxed text-carbon/80">{children}</div>
      {updatedNote ? <p className="mt-10 text-xs text-carbon/40">{updatedNote}</p> : null}
    </Container>
  );
}

export function Placeholder({ value, fallback = "[Pendiente de completar]" }: { value: string; fallback?: string }) {
  return <span className={value ? "" : "text-carbon/40 italic"}>{value || fallback}</span>;
}
