-- CreateTable
CREATE TABLE "FlightSearchSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "partySize" INTEGER NOT NULL,
    "originIata" TEXT NOT NULL,
    "destinationIata" TEXT NOT NULL,
    "outboundDate" TEXT NOT NULL,
    "returnDate" TEXT NOT NULL,
    "offerRequestId" TEXT NOT NULL,
    "passengerIds" TEXT NOT NULL,
    "offersJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CheckoutAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "packageType" TEXT NOT NULL,
    "partySize" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "ticketStatus" TEXT NOT NULL DEFAULT 'not_started',
    "hotelStatus" TEXT,
    "flightStatus" TEXT,
    "paymentStatus" TEXT NOT NULL DEFAULT 'not_started',
    "finalQuoteSnapshot" TEXT NOT NULL DEFAULT '',
    "buyerFirstName" TEXT NOT NULL DEFAULT '',
    "buyerLastName" TEXT NOT NULL DEFAULT '',
    "buyerEmail" TEXT NOT NULL DEFAULT '',
    "buyerPhone" TEXT NOT NULL DEFAULT '',
    "buyerOriginCity" TEXT NOT NULL DEFAULT '',
    "buyerBillingAddress" TEXT NOT NULL DEFAULT '',
    "travelOriginCountry" TEXT NOT NULL DEFAULT '',
    "paymentProviderChoice" TEXT NOT NULL DEFAULT 'demo',
    "accessToken" TEXT NOT NULL DEFAULT '',
    "bookingId" TEXT,
    "paymentProviderReference" TEXT NOT NULL DEFAULT '',
    "hotelProviderReference" TEXT NOT NULL DEFAULT '',
    "flightProviderReference" TEXT NOT NULL DEFAULT '',
    "failureCode" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "expiresAt" DATETIME,
    "latestSafePaymentAt" DATETIME,
    CONSTRAINT "CheckoutAttempt_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CheckoutAttempt_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_CheckoutAttempt" ("accessToken", "bookingId", "buyerBillingAddress", "buyerEmail", "buyerFirstName", "buyerLastName", "buyerOriginCity", "buyerPhone", "createdAt", "expiresAt", "failureCode", "finalQuoteSnapshot", "flightProviderReference", "flightStatus", "hotelProviderReference", "hotelStatus", "id", "latestSafePaymentAt", "packageType", "partySize", "paymentProviderChoice", "paymentProviderReference", "paymentStatus", "status", "ticketStatus", "tripId", "updatedAt") SELECT "accessToken", "bookingId", "buyerBillingAddress", "buyerEmail", "buyerFirstName", "buyerLastName", "buyerOriginCity", "buyerPhone", "createdAt", "expiresAt", "failureCode", "finalQuoteSnapshot", "flightProviderReference", "flightStatus", "hotelProviderReference", "hotelStatus", "id", "latestSafePaymentAt", "packageType", "partySize", "paymentProviderChoice", "paymentProviderReference", "paymentStatus", "status", "ticketStatus", "tripId", "updatedAt" FROM "CheckoutAttempt";
DROP TABLE "CheckoutAttempt";
ALTER TABLE "new_CheckoutAttempt" RENAME TO "CheckoutAttempt";
CREATE UNIQUE INDEX "CheckoutAttempt_accessToken_key" ON "CheckoutAttempt"("accessToken");
CREATE UNIQUE INDEX "CheckoutAttempt_bookingId_key" ON "CheckoutAttempt"("bookingId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "FlightSearchSession_tripId_originIata_partySize_idx" ON "FlightSearchSession"("tripId", "originIata", "partySize");

