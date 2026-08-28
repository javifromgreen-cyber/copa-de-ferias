-- Existing "provisional" rows always meant "day known, hour not yet fixed"
-- (see Event.kickoff comment) — remap them to the new, more precise name
-- rather than changing their meaning.
UPDATE "Event" SET "scheduleStatus" = 'time_provisional' WHERE "scheduleStatus" = 'provisional';
UPDATE "Trip" SET "scheduleStatus" = 'time_provisional' WHERE "scheduleStatus" = 'provisional';

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
    "scheduleStatus" TEXT NOT NULL DEFAULT 'time_provisional',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "imageKey" TEXT NOT NULL DEFAULT 'default',
    "primaryEvent" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Event_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Event_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Event" ("awayTeam", "city", "competitionId", "country", "createdAt", "homeTeam", "id", "imageKey", "kickoff", "matchDate", "name", "order", "primaryEvent", "scheduleStatus", "stadium", "status", "timezone", "tripId", "updatedAt") SELECT "awayTeam", "city", "competitionId", "country", "createdAt", "homeTeam", "id", "imageKey", "kickoff", "matchDate", "name", "order", "primaryEvent", "scheduleStatus", "stadium", "status", "timezone", "tripId", "updatedAt" FROM "Event";
DROP TABLE "Event";
ALTER TABLE "new_Event" RENAME TO "Event";
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
    "scheduleStatus" TEXT NOT NULL DEFAULT 'time_provisional',
    "travelMode" TEXT NOT NULL DEFAULT 'GROUP_CDF',
    "maxPartySize" INTEGER NOT NULL DEFAULT 10,
    "availablePackageTypes" TEXT NOT NULL DEFAULT 'TICKET_ONLY,TICKET_HOTEL,TICKET_HOTEL_FLIGHT',
    "hostAvailable" BOOLEAN NOT NULL DEFAULT false,
    "hostPrice" REAL NOT NULL DEFAULT 0,
    "hostPricingType" TEXT NOT NULL DEFAULT 'per_person',
    "hostCapacity" INTEGER NOT NULL DEFAULT 0,
    "hostLanguage" TEXT NOT NULL DEFAULT '',
    "hostNotes" TEXT NOT NULL DEFAULT '',
    "guideEnabled" BOOLEAN NOT NULL DEFAULT false,
    "guideTitle" TEXT NOT NULL DEFAULT '',
    "guidePdfUrl" TEXT NOT NULL DEFAULT '',
    "guideVersion" TEXT NOT NULL DEFAULT '',
    "guideUpdatedAt" DATETIME,
    "minimumArrivalBufferBeforeKickoffMinutes" INTEGER NOT NULL DEFAULT 180,
    "minimumReturnBufferAfterEventMinutes" INTEGER NOT NULL DEFAULT 120,
    "orgFeeTicketOnlyOverride" REAL,
    "orgFeeHotelTiersOverride" TEXT NOT NULL DEFAULT '',
    "orgFeeHotelFlightTiersOverride" TEXT NOT NULL DEFAULT '',
    "additionalMatchFeeOverride" REAL,
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
INSERT INTO "new_Trip" ("additionalMatchFeeOverride", "availablePackageTypes", "awayTeam", "cancellationPolicy", "city", "coordinatorName", "country", "createdAt", "currency", "departureText", "description", "durationDays", "durationNights", "guideEnabled", "guidePdfUrl", "guideTitle", "guideUpdatedAt", "guideVersion", "heroImageKey", "homeFeatured", "homeTeam", "hostAvailable", "hostCapacity", "hostLanguage", "hostName", "hostNotes", "hostPrice", "hostPricingType", "hotelCentric", "hotelDescription", "hotelStars", "hotelZone", "id", "importantConditions", "insuranceDescription", "isDemo", "localCulture", "matchDate", "maxPartySize", "maxSpots", "minDeadlineDate", "minSpots", "minimumArrivalBufferBeforeKickoffMinutes", "minimumReturnBufferAfterEventMinutes", "name", "number", "order", "orgFeeHotelFlightTiersOverride", "orgFeeHotelTiersOverride", "orgFeeTicketOnlyOverride", "price", "published", "requiredTravelerFields", "requiresShippingAddress", "returnText", "scheduleStatus", "seoDescription", "seoTitle", "singleSupplement", "slug", "soldSpots", "stadium", "status", "subtitle", "ticketCategory", "ticketSeating", "ticketSector", "travelMode", "updatedAt", "whatsappAvailableAt", "whatsappUrl", "whyWeGo") SELECT "additionalMatchFeeOverride", "availablePackageTypes", "awayTeam", "cancellationPolicy", "city", "coordinatorName", "country", "createdAt", "currency", "departureText", "description", "durationDays", "durationNights", "guideEnabled", "guidePdfUrl", "guideTitle", "guideUpdatedAt", "guideVersion", "heroImageKey", "homeFeatured", "homeTeam", "hostAvailable", "hostCapacity", "hostLanguage", "hostName", "hostNotes", "hostPrice", "hostPricingType", "hotelCentric", "hotelDescription", "hotelStars", "hotelZone", "id", "importantConditions", "insuranceDescription", "isDemo", "localCulture", "matchDate", "maxPartySize", "maxSpots", "minDeadlineDate", "minSpots", "minimumArrivalBufferBeforeKickoffMinutes", "minimumReturnBufferAfterEventMinutes", "name", "number", "order", "orgFeeHotelFlightTiersOverride", "orgFeeHotelTiersOverride", "orgFeeTicketOnlyOverride", "price", "published", "requiredTravelerFields", "requiresShippingAddress", "returnText", "scheduleStatus", "seoDescription", "seoTitle", "singleSupplement", "slug", "soldSpots", "stadium", "status", "subtitle", "ticketCategory", "ticketSeating", "ticketSector", "travelMode", "updatedAt", "whatsappAvailableAt", "whatsappUrl", "whyWeGo" FROM "Trip";
DROP TABLE "Trip";
ALTER TABLE "new_Trip" RENAME TO "Trip";
CREATE UNIQUE INDEX "Trip_number_key" ON "Trip"("number");
CREATE UNIQUE INDEX "Trip_slug_key" ON "Trip"("slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
