import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ships prisma/demo-seed.db (built by vercel.json's buildCommand) inside
  // every serverless function bundle, so a Vercel Preview Deployment in
  // APP_MODE=demo has a copy to read at runtime — see src/lib/db.ts and
  // docs/DEPLOYMENT.md. No-op locally and in any build where that file
  // doesn't exist.
  outputFileTracingIncludes: {
    "/**": ["./prisma/demo-seed.db"],
  },
};

export default nextConfig;
