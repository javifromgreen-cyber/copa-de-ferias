import Link from "next/link";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost";

const base =
  "inline-flex items-center justify-center gap-2 rounded-sm px-6 py-3 text-sm font-semibold tracking-wide uppercase transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-carbon disabled:opacity-50 disabled:pointer-events-none";

const variants: Record<Variant, string> = {
  primary: "bg-carbon text-ivory hover:bg-carbon-soft",
  secondary: "bg-transparent text-carbon border border-carbon hover:bg-carbon hover:text-ivory",
  ghost: "bg-transparent text-carbon hover:underline underline-offset-4",
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
