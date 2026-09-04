
-- AlterTable
ALTER TABLE "CheckoutAttempt" ADD COLUMN "latestSafePaymentAt" DATETIME;

-- CreateTable
CREATE TABLE "CheckoutAttemptTraveler" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "checkoutAttemptId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "birthDate" DATETIME,
    "title" TEXT NOT NULL DEFAULT '',
    "gender" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "nationality" TEXT NOT NULL DEFAULT '',
    "docType" TEXT NOT NULL DEFAULT '',
    "docNumber" TEXT NOT NULL DEFAULT '',
    "docExpiry" DATETIME,
    "docCountry" TEXT NOT NULL DEFAULT '',
    "emergencyContactName" TEXT NOT NULL DEFAULT '',
    "emergencyContactPhone" TEXT NOT NULL DEFAULT '',
    "originAirport" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CheckoutAttemptTraveler_checkoutAttemptId_fkey" FOREIGN KEY ("checkoutAttemptId") REFERENCES "CheckoutAttempt" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "CheckoutAttemptTraveler_checkoutAttemptId_order_key" ON "CheckoutAttemptTraveler"("checkoutAttemptId", "order");

