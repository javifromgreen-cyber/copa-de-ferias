import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * PostgreSQL everywhere — local dev, tests, and every Vercel deployment
 * (Preview and Production) connect to real Postgres via DATABASE_URL
 * (pooled runtime connection). There is no SQLite fallback: APP_MODE
 * decides business/product behavior (which providers are live, whether
 * payments/emails can go out for real — see src/lib/env.ts), never which
 * database engine this connects to. See docs/DEPLOYMENT.md.
 */
export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
