-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "homeTeam" TEXT NOT NULL,
    "awayTeam" TEXT NOT NULL,
    "stadium" TEXT NOT NULL,
    "matchDate" DATETIME NOT NULL,
    "kickoff" DATETIME,
    "scheduleStatus" TEXT NOT NULL DEFAULT 'provisional',
    "primaryEvent" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Event_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TicketOffer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'manual',
    "category" TEXT NOT NULL DEFAULT '',
    "sector" TEXT NOT NULL DEFAULT '',
    "costNet" REAL NOT NULL DEFAULT 0,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "lastCheckedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" DATETIME,
    "seatingTogetherGuaranteed" BOOLEAN NOT NULL DEFAULT false,
    "deliveryType" TEXT NOT NULL DEFAULT '',
    "deliveryNotes" TEXT NOT NULL DEFAULT '',
    "internalNotes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TicketOffer_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OrganizationFeeConfig" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "feeTicketOnly" REAL NOT NULL DEFAULT 49,
    "feeHotelTiers" TEXT NOT NULL DEFAULT '[{"minParty":1,"maxParty":2,"feePerTraveler":99},{"minParty":3,"maxParty":4,"feePerTraveler":94},{"minParty":5,"maxParty":6,"feePerTraveler":89},{"minParty":7,"maxParty":10,"feePerTraveler":84}]',
    "feeHotelFlightTiers" TEXT NOT NULL DEFAULT '[{"minParty":1,"maxParty":2,"feePerTraveler":159},{"minParty":3,"maxParty":4,"feePerTraveler":149},{"minParty":5,"maxParty":6,"feePerTraveler":139},{"minParty":7,"maxParty":10,"feePerTraveler":129}]',
    "additionalMatchFee" REAL NOT NULL DEFAULT 25,
    "paymentMethodFees" TEXT NOT NULL DEFAULT '{}',
    "pricingBuffer" REAL NOT NULL DEFAULT 0,
    "minimumEstimatedProfit" REAL NOT NULL DEFAULT 0,
    "taxEstimateEnabled" BOOLEAN NOT NULL DEFAULT false,
    "taxEstimateRate" REAL NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Booking" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reference" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "buyerFirstName" TEXT NOT NULL,
    "buyerLastName" TEXT NOT NULL,
    "buyerEmail" TEXT NOT NULL,
    "buyerPhone" TEXT NOT NULL,
    "originCity" TEXT NOT NULL,
    "billingAddress" TEXT NOT NULL DEFAULT '',
    "travelersCount" INTEGER NOT NULL,
    "singleRooms" INTEGER NOT NULL DEFAULT 0,
    "totalPrice" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "paymentProvider" TEXT NOT NULL DEFAULT 'demo',
    "paymentStatus" TEXT NOT NULL DEFAULT 'pending',
    "bookingStatus" TEXT NOT NULL DEFAULT 'pending_payment',
    "accessToken" TEXT NOT NULL,
    "internalNotes" TEXT NOT NULL DEFAULT '',
    "additionalDataRequestNote" TEXT NOT NULL DEFAULT '',
    "hasReceivedPassport" BOOLEAN NOT NULL DEFAULT false,
    "passportStatus" TEXT NOT NULL DEFAULT 'pending',
    "packageType" TEXT,
    "partySize" INTEGER,
    "ticketCount" INTEGER,
    "hostSelected" BOOLEAN NOT NULL DEFAULT false,
    "hostCount" INTEGER NOT NULL DEFAULT 0,
    "hotelSelectionSnapshot" TEXT NOT NULL DEFAULT '',
    "flightSelectionSnapshot" TEXT NOT NULL DEFAULT '',
    "priceBreakdownSnapshot" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Booking_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Booking" ("accessToken", "additionalDataRequestNote", "billingAddress", "bookingStatus", "buyerEmail", "buyerFirstName", "buyerLastName", "buyerPhone", "createdAt", "currency", "hasReceivedPassport", "id", "internalNotes", "originCity", "passportStatus", "paymentProvider", "paymentStatus", "reference", "singleRooms", "totalPrice", "travelersCount", "tripId", "updatedAt") SELECT "accessToken", "additionalDataRequestNote", "billingAddress", "bookingStatus", "buyerEmail", "buyerFirstName", "buyerLastName", "buyerPhone", "createdAt", "currency", "hasReceivedPassport", "id", "internalNotes", "originCity", "passportStatus", "paymentProvider", "paymentStatus", "reference", "singleRooms", "totalPrice", "travelersCount", "tripId", "updatedAt" FROM "Booking";
DROP TABLE "Booking";
ALTER TABLE "new_Booking" RENAME TO "Booking";
CREATE UNIQUE INDEX "Booking_reference_key" ON "Booking"("reference");
CREATE UNIQUE INDEX "Booking_accessToken_key" ON "Booking"("accessToken");
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
    "hasTicket" BOOLEAN NOT NULL DEFAULT true,
    "originAirport" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Traveler_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Traveler" ("birthDate", "bookingId", "createdAt", "docCountry", "docExpiry", "docNumber", "docType", "emergencyContactName", "emergencyContactPhone", "firstName", "id", "lastName", "nationality", "originCity", "phone", "roomPartnerName", "roomPreference", "sex", "updatedAt") SELECT "birthDate", "bookingId", "createdAt", "docCountry", "docExpiry", "docNumber", "docType", "emergencyContactName", "emergencyContactPhone", "firstName", "id", "lastName", "nationality", "originCity", "phone", "roomPartnerName", "roomPreference", "sex", "updatedAt" FROM "Traveler";
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
INSERT INTO "new_Trip" ("awayTeam", "cancellationPolicy", "city", "coordinatorName", "country", "createdAt", "currency", "departureText", "description", "durationDays", "durationNights", "heroImageKey", "homeFeatured", "homeTeam", "hostName", "hotelCentric", "hotelDescription", "hotelStars", "hotelZone", "id", "importantConditions", "insuranceDescription", "isDemo", "localCulture", "matchDate", "maxSpots", "minDeadlineDate", "minSpots", "name", "number", "order", "price", "published", "requiredTravelerFields", "requiresShippingAddress", "returnText", "scheduleStatus", "seoDescription", "seoTitle", "singleSupplement", "slug", "soldSpots", "stadium", "status", "subtitle", "ticketCategory", "ticketSeating", "ticketSector", "updatedAt", "whatsappAvailableAt", "whatsappUrl", "whyWeGo") SELECT "awayTeam", "cancellationPolicy", "city", "coordinatorName", "country", "createdAt", "currency", "departureText", "description", "durationDays", "durationNights", "heroImageKey", "homeFeatured", "homeTeam", "hostName", "hotelCentric", "hotelDescription", "hotelStars", "hotelZone", "id", "importantConditions", "insuranceDescription", "isDemo", "localCulture", "matchDate", "maxSpots", "minDeadlineDate", "minSpots", "name", "number", "order", "price", "published", "requiredTravelerFields", "requiresShippingAddress", "returnText", "scheduleStatus", "seoDescription", "seoTitle", "singleSupplement", "slug", "soldSpots", "stadium", "status", "subtitle", "ticketCategory", "ticketSeating", "ticketSector", "updatedAt", "whatsappAvailableAt", "whatsappUrl", "whyWeGo" FROM "Trip";
DROP TABLE "Trip";
ALTER TABLE "new_Trip" RENAME TO "Trip";
CREATE UNIQUE INDEX "Trip_number_key" ON "Trip"("number");
CREATE UNIQUE INDEX "Trip_slug_key" ON "Trip"("slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
