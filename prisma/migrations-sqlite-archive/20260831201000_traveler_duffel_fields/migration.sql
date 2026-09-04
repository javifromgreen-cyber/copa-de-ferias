
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
    "title" TEXT NOT NULL DEFAULT '',
    "gender" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "hasTicket" BOOLEAN NOT NULL DEFAULT true,
    "originAirport" TEXT NOT NULL DEFAULT '',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Traveler_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Traveler" ("birthDate", "bookingId", "createdAt", "docCountry", "docExpiry", "docNumber", "docType", "emergencyContactName", "emergencyContactPhone", "firstName", "hasTicket", "id", "lastName", "nationality", "order", "originAirport", "originCity", "phone", "roomPartnerName", "roomPreference", "sex", "updatedAt") SELECT "birthDate", "bookingId", "createdAt", "docCountry", "docExpiry", "docNumber", "docType", "emergencyContactName", "emergencyContactPhone", "firstName", "hasTicket", "id", "lastName", "nationality", "order", "originAirport", "originCity", "phone", "roomPartnerName", "roomPreference", "sex", "updatedAt" FROM "Traveler";
DROP TABLE "Traveler";
ALTER TABLE "new_Traveler" RENAME TO "Traveler";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

