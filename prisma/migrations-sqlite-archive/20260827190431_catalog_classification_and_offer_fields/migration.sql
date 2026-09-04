-- CreateTable
CREATE TABLE "Competition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT '',
    "competitionType" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Event" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "competitionId" TEXT,
    "name" TEXT NOT NULL DEFAULT '',
    "homeTeam" TEXT NOT NULL,
    "awayTeam" TEXT NOT NULL,
    "stadium" TEXT NOT NULL,
    "city" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL DEFAULT '',
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Madrid',
    "matchDate" DATETIME NOT NULL,
    "kickoff" DATETIME,
    "scheduleStatus" TEXT NOT NULL DEFAULT 'provisional',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "imageKey" TEXT NOT NULL DEFAULT 'default',
    "primaryEvent" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Event_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Event_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Event" ("awayTeam", "createdAt", "homeTeam", "id", "kickoff", "matchDate", "order", "primaryEvent", "scheduleStatus", "stadium", "tripId", "updatedAt") SELECT "awayTeam", "createdAt", "homeTeam", "id", "kickoff", "matchDate", "order", "primaryEvent", "scheduleStatus", "stadium", "tripId", "updatedAt" FROM "Event";
DROP TABLE "Event";
ALTER TABLE "new_Event" RENAME TO "Event";
CREATE TABLE "new_TicketOffer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'manual',
    "category" TEXT NOT NULL DEFAULT '',
    "sector" TEXT NOT NULL DEFAULT '',
    "costNet" REAL NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "stock" INTEGER NOT NULL DEFAULT 0,
    "maxQuantity" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastCheckedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" DATETIME,
    "seatingTogetherGuaranteed" BOOLEAN NOT NULL DEFAULT false,
    "deliveryType" TEXT NOT NULL DEFAULT '',
    "deliveryNotes" TEXT NOT NULL DEFAULT '',
    "restrictions" TEXT NOT NULL DEFAULT '',
    "internalNotes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TicketOffer_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TicketOffer" ("category", "costNet", "createdAt", "deliveryNotes", "deliveryType", "eventId", "id", "internalNotes", "lastCheckedAt", "provider", "seatingTogetherGuaranteed", "sector", "stock", "updatedAt", "validUntil") SELECT "category", "costNet", "createdAt", "deliveryNotes", "deliveryType", "eventId", "id", "internalNotes", "lastCheckedAt", "provider", "seatingTogetherGuaranteed", "sector", "stock", "updatedAt", "validUntil" FROM "TicketOffer";
DROP TABLE "TicketOffer";
ALTER TABLE "new_TicketOffer" RENAME TO "TicketOffer";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Competition_name_region_key" ON "Competition"("name", "region");
