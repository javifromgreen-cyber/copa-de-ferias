import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { Logo } from "@/components/brand/Logo";
import { AdminLoginForm } from "@/components/admin/AdminLoginForm";

export const metadata: Metadata = { title: "Admin — Acceso", robots: { index: false, follow: false } };

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <Container className="flex min-h-[70vh] max-w-sm flex-col items-center justify-center py-16 text-center">
      <Logo className="mb-4 h-10 w-10 text-carbon" />
      <h1 className="font-display mb-6 text-2xl uppercase">Panel de administración</h1>
      <AdminLoginForm next={next} />
    </Container>
  );
}
