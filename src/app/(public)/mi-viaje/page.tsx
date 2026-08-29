import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { MiViajeLookupForm } from "@/components/mi-viaje/MiViajeLookupForm";
import { prisma } from "@/lib/db";
import { MI_VIAJE_COOKIE_NAME } from "@/lib/mi-viaje/cookies";

// Must re-check the cookie/booking on every visit — never cache a
// redirect decision that depends on live, per-visitor state.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Mi Viaje" };

export default async function MiViajeLookupPage() {
  // §4: if this device already has a remembered, still-valid authorized
  // booking, skip straight to it — but only after re-verifying the token
  // still resolves to a real booking (a stale/deleted-booking cookie must
  // never dead-end the visitor, it just falls through to the form below).
  const cookieStore = await cookies();
  const rememberedToken = cookieStore.get(MI_VIAJE_COOKIE_NAME)?.value;
  if (rememberedToken) {
    const booking = await prisma.booking.findUnique({ where: { accessToken: rememberedToken }, select: { id: true } });
    if (booking) redirect(`/mi-viaje/${rememberedToken}`);
  }

  return (
    <Container className="max-w-md py-16 sm:py-24">
      <h1 className="font-display mb-3 text-3xl uppercase">Accede a tu viaje</h1>
      <p className="mb-8 text-carbon/70">Introduce los datos de tu reserva.</p>
      <MiViajeLookupForm />
    </Container>
  );
}
