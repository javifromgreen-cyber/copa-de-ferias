import Link from "next/link";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "inverse";

const base =
  "inline-flex items-center justify-center gap-2 rounded-sm px-6 py-3 text-sm font-semibold tracking-wide uppercase transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 disabled:pointer-events-none";

// Each variant is a single self-contained color set, outline included.
// Never combine a variant with an ad-hoc bg-*/text-*/outline-* override in
// `className` — Tailwind resolves same-specificity utility conflicts by
// stylesheet order, not by class-string order, so an override can
// silently lose to the variant's own color and leave text unreadable
// against its background (this is exactly what happened to the Hero and
// newsletter CTAs before this variant existed). Use `variant="inverse"`
// for a light button on a dark section instead.
const variants: Record<Variant, string> = {
  primary: "bg-carbon text-ivory hover:bg-carbon-soft focus-visible:outline-carbon",
  secondary:
    "bg-transparent text-carbon border border-carbon hover:bg-carbon hover:text-ivory focus-visible:outline-carbon",
  ghost: "bg-transparent text-carbon hover:underline underline-offset-4 focus-visible:outline-carbon",
  inverse: "bg-ivory text-carbon hover:bg-ivory-dark focus-visible:outline-ivory",
};

export function Button({
  variant = "primary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button className={cn(base, variants[variant], className)} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  className,
  href,
  ...props
}: React.ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link href={href} className={cn(base, variants[variant], className)} {...props} />;
}
