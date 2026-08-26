import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";
import { getAppMode } from "@/lib/env";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Vercel Preview support for APP_MODE=demo only — see docs/DEPLOYMENT.md.
 *
 * A Vercel deployment's filesystem is read-only except /tmp, so SQLite
 * (our local/demo datasource) can't write to the deployed project files.
 * On cold start we copy the pre-migrated, pre-seeded SQLite file built by
 * vercel.json's buildCommand (prisma/demo-seed.db) into /tmp and connect
 * there instead. This is NOT real persistence: writes only last for the
 * lifetime of that serverless instance, and a fresh instance starts back
 * at the seeded state. That matches what demo mode already promises
 * everywhere else in the app — nothing about production behavior changes.
 *
 * Production deployments (APP_MODE=production) never take this path and
 * use DATABASE_URL exactly as configured (e.g. Postgres), unchanged.
 */
function resolveDemoDatabaseUrl(): string | null {
  if (!process.env.VERCEL || getAppMode() !== "demo") return null;

  const tmpPath = "/tmp/copa-de-ferias-demo.db";
  if (!fs.existsSync(tmpPath)) {
    const bundled = path.join(process.cwd(), "prisma", "demo-seed.db");
    if (!fs.existsSync(bundled)) return null;
    fs.copyFileSync(bundled, tmpPath);
  }
  return `file:${tmpPath}`;
}

const demoUrl = resolveDemoDatabaseUrl();

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient(demoUrl ? { datasources: { db: { url: demoUrl } } } : undefined);

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
