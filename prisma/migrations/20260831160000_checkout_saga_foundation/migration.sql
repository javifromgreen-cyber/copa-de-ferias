-- Checkout saga foundation (Fase 1): CheckoutAttempt, TicketHold,
-- CheckoutAttemptEvent. Nothing here is wired into the live checkout yet.

-- CreateTable
CREATE TABLE "CheckoutAttempt" (
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
    "bookingId" TEXT,
    "paymentProviderReference" TEXT NOT NULL DEFAULT '',
    "hotelProviderReference" TEXT NOT NULL DEFAULT '',
    "flightProviderReference" TEXT NOT NULL DEFAULT '',
    "failureCode" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "expiresAt" DATETIME,
    CONSTRAINT "CheckoutAttempt_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CheckoutAttempt_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TicketHold" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "checkoutAttemptId" TEXT NOT NULL,
    "ticketOfferId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'held',
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TicketHold_checkoutAttemptId_fkey" FOREIGN KEY ("checkoutAttemptId") REFERENCES "CheckoutAttempt" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TicketHold_ticketOfferId_fkey" FOREIGN KEY ("ticketOfferId") REFERENCES "TicketOffer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CheckoutAttemptEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "checkoutAttemptId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "providerReference" TEXT NOT NULL DEFAULT '',
    "sanitizedDetail" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CheckoutAttemptEvent_checkoutAttemptId_fkey" FOREIGN KEY ("checkoutAttemptId") REFERENCES "CheckoutAttempt" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "CheckoutAttempt_bookingId_key" ON "CheckoutAttempt"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketHold_checkoutAttemptId_ticketOfferId_key" ON "TicketHold"("checkoutAttemptId", "ticketOfferId");
