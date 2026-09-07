-- AlterTable
ALTER TABLE "CheckoutAttempt" ADD COLUMN     "hotelBookSnapshot" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "hotelClientReference" TEXT NOT NULL DEFAULT '';
