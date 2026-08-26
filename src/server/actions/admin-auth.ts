"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminSessionToken, ADMIN_COOKIE_NAME, ADMIN_COOKIE_MAX_AGE } from "@/lib/auth/admin";
import { getAdminPassword } from "@/lib/env";

export async function adminLogin(password: string, next?: string): Promise<{ ok: false; error: string } | never> {
  const expected = getAdminPassword();
  if (!expected || password !== expected) {
    return { ok: false, error: "Contraseña incorrecta" };
  }

  const token = await createAdminSessionToken();
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ADMIN_COOKIE_MAX_AGE,
  });

  redirect(next && next.startsWith("/admin") ? next : "/admin");
}

export async function adminLogout(): Promise<never> {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_COOKIE_NAME);
  redirect("/admin/login");
}
