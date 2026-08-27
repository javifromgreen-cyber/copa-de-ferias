-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Traveler" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bookingId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "birthDate" DATETIME,
    "originCity" TEXT NOT NULL DEFAULT '',
    "roomPreference" TEXT NOT NULL DEFAULT 'share_with_group',
    "roomPartnerName" TEXT NOT NULL DEFAULT '',
    "nationality" TEXT NOT NULL DEFAULT '',
    "sex" TEXT NOT NULL DEFAULT '',
    "docType" TEXT NOT NULL DEFAULT '',
    "docNumber" TEXT NOT NULL DEFAULT '',
    "docExpiry" DATETIME,
    "docCountry" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "emergencyContactName" TEXT NOT NULL DEFAULT '',
    "emergencyContactPhone" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Traveler_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Traveler" ("birthDate", "bookingId", "createdAt", "docCountry", "docExpiry", "docNumber", "docType", "firstName", "id", "lastName", "nationality", "originCity", "phone", "roomPartnerName", "roomPreference", "sex", "updatedAt") SELECT "birthDate", "bookingId", "createdAt", "docCountry", "docExpiry", "docNumber", "docType", "firstName", "id", "lastName", "nationality", "originCity", "phone", "roomPartnerName", "roomPreference", "sex", "updatedAt" FROM "Traveler";
DROP TABLE "Traveler";
ALTER TABLE "new_Traveler" RENAME TO "Traveler";
CREATE TABLE "new_Trip" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" INTEGER NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subtitle" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "homeTeam" TEXT NOT NULL,
    "awayTeam" TEXT NOT NULL,
    "stadium" TEXT NOT NULL,
    "matchDate" DATETIME NOT NULL,
    "durationDays" INTEGER NOT NULL DEFAULT 3,
    "durationNights" INTEGER NOT NULL DEFAULT 2,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "published" BOOLEAN NOT NULL DEFAULT false,
    "homeFeatured" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isDemo" BOOLEAN NOT NULL DEFAULT true,
    "price" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "maxSpots" INTEGER NOT NULL DEFAULT 20,
    "soldSpots" INTEGER NOT NULL DEFAULT 0,
    "minSpots" INTEGER NOT NULL DEFAULT 8,
    "minDeadlineDate" DATETIME,
    "singleSupplement" REAL NOT NULL DEFAULT 0,
    "requiredTravelerFields" TEXT NOT NULL DEFAULT 'nationality,docType,docNumber,docExpiry,docCountry',
    "requiresShippingAddress" BOOLEAN NOT NULL DEFAULT false,
    "scheduleStatus" TEXT NOT NULL DEFAULT 'provisional',
    "heroImageKey" TEXT NOT NULL DEFAULT 'default',
    "description" TEXT NOT NULL DEFAULT '',
    "whyWeGo" TEXT NOT NULL DEFAULT '',
    "localCulture" TEXT NOT NULL DEFAULT '',
    "departureText" TEXT NOT NULL DEFAULT '',
    "returnText" TEXT NOT NULL DEFAULT '',
    "hotelStars" INTEGER NOT NULL DEFAULT 3,
    "hotelZone" TEXT NOT NULL DEFAULT '',
    "hotelCentric" BOOLEAN NOT NULL DEFAULT true,
    "hotelDescription" TEXT NOT NULL DEFAULT '',
    "ticketCategory" TEXT NOT NULL DEFAULT '',
    "ticketSector" TEXT NOT NULL DEFAULT '',
    "ticketSeating" TEXT NOT NULL DEFAULT '',
    "insuranceDescription" TEXT NOT NULL DEFAULT '',
    "coordinatorName" TEXT NOT NULL DEFAULT '',
    "hostName" TEXT NOT NULL DEFAULT '',
    "cancellationPolicy" TEXT NOT NULL DEFAULT '',
    "importantConditions" TEXT NOT NULL DEFAULT '',
    "whatsappUrl" TEXT NOT NULL DEFAULT '',
    "whatsappAvailableAt" DATETIME,
    "seoTitle" TEXT NOT NULL DEFAULT '',
    "seoDescription" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Trip" ("awayTeam", "cancellationPolicy", "city", "coordinatorName", "country", "createdAt", "currency", "departureText", "description", "durationDays", "durationNights", "heroImageKey", "homeFeatured", "homeTeam", "hostName", "hotelCentric", "hotelDescription", "hotelStars", "hotelZone", "id", "importantConditions", "insuranceDescription", "isDemo", "localCulture", "matchDate", "maxSpots", "minDeadlineDate", "minSpots", "name", "number", "order", "price", "published", "requiredTravelerFields", "returnText", "scheduleStatus", "seoDescription", "seoTitle", "singleSupplement", "slug", "soldSpots", "stadium", "status", "subtitle", "ticketCategory", "ticketSeating", "ticketSector", "updatedAt", "whatsappAvailableAt", "whatsappUrl", "whyWeGo") SELECT "awayTeam", "cancellationPolicy", "city", "coordinatorName", "country", "createdAt", "currency", "departureText", "description", "durationDays", "durationNights", "heroImageKey", "homeFeatured", "homeTeam", "hostName", "hotelCentric", "hotelDescription", "hotelStars", "hotelZone", "id", "importantConditions", "insuranceDescription", "isDemo", "localCulture", "matchDate", "maxSpots", "minDeadlineDate", "minSpots", "name", "number", "order", "price", "published", "requiredTravelerFields", "returnText", "scheduleStatus", "seoDescription", "seoTitle", "singleSupplement", "slug", "soldSpots", "stadium", "status", "subtitle", "ticketCategory", "ticketSeating", "ticketSector", "updatedAt", "whatsappAvailableAt", "whatsappUrl", "whyWeGo" FROM "Trip";
DROP TABLE "Trip";
ALTER TABLE "new_Trip" RENAME TO "Trip";
CREATE UNIQUE INDEX "Trip_number_key" ON "Trip"("number");
CREATE UNIQUE INDEX "Trip_slug_key" ON "Trip"("slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
