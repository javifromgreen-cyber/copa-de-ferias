import { SignJWT, jwtVerify } from "jose";
import { getAdminSessionSecret } from "@/lib/env";

const COOKIE_NAME = "cdf_admin_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 12; // 12h

function secretKey() {
  return new TextEncoder().encode(getAdminSessionSecret());
}

export async function createAdminSessionToken(): Promise<string> {
  return new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(secretKey());
}

export async function verifyAdminSessionToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return payload.role === "admin";
  } catch {
    return false;
  }
}

export const ADMIN_COOKIE_NAME = COOKIE_NAME;
export const ADMIN_COOKIE_MAX_AGE = SESSION_DURATION_SECONDS;
