-- CreateEnum
CREATE TYPE "WebhookClaimStatus" AS ENUM ('processing', 'completed', 'failed');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CheckoutAttemptEventType" ADD VALUE 'payment_capture_started';
ALTER TYPE "CheckoutAttemptEventType" ADD VALUE 'payment_captured';
ALTER TYPE "CheckoutAttemptEventType" ADD VALUE 'payment_capture_failed';
ALTER TYPE "CheckoutAttemptEventType" ADD VALUE 'payment_capture_ambiguous';
ALTER TYPE "CheckoutAttemptEventType" ADD VALUE 'fulfillment_barrier_blocked';

-- CreateTable
CREATE TABLE "WebhookEventClaim" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'stripe',
    "status" "WebhookClaimStatus" NOT NULL DEFAULT 'processing',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookEventClaim_pkey" PRIMARY KEY ("id")
);
