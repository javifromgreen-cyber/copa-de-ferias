-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('draft', 'upcoming', 'open', 'sold_out', 'completed', 'archived');

-- CreateEnum
CREATE TYPE "ScheduleStatus" AS ENUM ('confirmed', 'time_provisional', 'date_provisional');

-- CreateEnum
CREATE TYPE "TravelMode" AS ENUM ('A_TU_AIRE', 'GROUP_CDF');

-- CreateEnum
CREATE TYPE "PackageType" AS ENUM ('TICKET_ONLY', 'TICKET_HOTEL', 'TICKET_HOTEL_FLIGHT');

-- CreateEnum
CREATE TYPE "Region" AS ENUM ('EUROPE', 'SOUTH_AMERICA', 'NORTH_AMERICA', 'ASIA', 'AFRICA', 'OCEANIA');

-- CreateEnum
CREATE TYPE "CompetitionType" AS ENUM ('DOMESTIC_LEAGUE', 'DOMESTIC_CUP', 'CONTINENTAL_COMPETITION', 'OTHER');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('draft', 'published', 'cancelled');

-- CreateEnum
CREATE TYPE "LeadType" AS ENUM ('notify', 'waitlist', 'general');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('pending_payment', 'confirmed', 'cancellation_requested', 'cancelled', 'refund_pending', 'refunded');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'paid', 'failed', 'refunded');

-- CreateEnum
CREATE TYPE "PaymentProviderKind" AS ENUM ('demo', 'stripe', 'paypal');

-- CreateEnum
CREATE TYPE "RoomPreference" AS ENUM ('share_with_group', 'share_same_sex', 'single');

-- CreateEnum
CREATE TYPE "CheckoutAttemptStatus" AS ENUM ('draft', 'revalidating', 'ready_to_pay', 'payment_authorizing', 'payment_authorized', 'fulfilling', 'payment_capturing', 'finalizing', 'confirmed', 'compensating', 'recovery_required', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "TicketComponentStatus" AS ENUM ('not_started', 'held', 'confirmed', 'released', 'expired');

-- CreateEnum
CREATE TYPE "HotelComponentStatus" AS ENUM ('validated', 'prebooked', 'booking', 'confirmed', 'unknown', 'failed', 'cancelling', 'cancelled');

-- CreateEnum
CREATE TYPE "FlightComponentStatus" AS ENUM ('validated', 'booking', 'confirmed', 'unknown', 'failed', 'cancelling', 'cancelled');

-- CreateEnum
CREATE TYPE "PaymentComponentStatus" AS ENUM ('not_started', 'authorizing', 'authorized', 'capturing', 'captured', 'unknown', 'voiding', 'voided', 'failed');

-- CreateEnum
CREATE TYPE "TicketHoldStatus" AS ENUM ('held', 'confirmed', 'released', 'expired');

-- CreateEnum
CREATE TYPE "CheckoutAttemptEventType" AS ENUM ('checkout_created', 'state_changed', 'ticket_hold_created', 'ticket_hold_released', 'ticket_hold_expired', 'ticket_hold_confirmed', 'finalization_started', 'finalization_completed', 'finalization_failed', 'travelers_validated', 'quote_revalidation_started', 'ticket_validated', 'hotel_prebook_confirmed', 'flight_revalidated', 'quote_snapshot_created', 'quote_refresh_started', 'quote_refreshed', 'payment_authorization_created', 'payment_requires_action', 'payment_authorized', 'payment_failed', 'payment_voided', 'payment_webhook_processed', 'payment_abandoned_released', 'payment_unverifiable');

-- CreateEnum
CREATE TYPE "BookingDocumentType" AS ENUM ('ticket', 'hotel', 'flight', 'other');

-- CreateEnum
CREATE TYPE "BookingDocumentStatus" AS ENUM ('pending', 'available', 'delivered', 'action_required');

-- CreateEnum
CREATE TYPE "BookingActionType" AS ENUM ('hotel_checkin', 'flight_checkin', 'data_correction', 'change_review', 'document', 'other');

-- CreateEnum
CREATE TYPE "BookingActionStatus" AS ENUM ('pending', 'completed');

-- CreateEnum
CREATE TYPE "ChangeRequestType" AS ENUM ('name_change', 'important_change', 'cancellation');

-- CreateEnum
CREATE TYPE "ChangeRequestStatus" AS ENUM ('requested', 'in_review', 'approved', 'rejected', 'completed');

-- CreateEnum
CREATE TYPE "EmailMode" AS ENUM ('demo', 'real');

-- CreateTable
CREATE TABLE "BrandConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "name" TEXT NOT NULL DEFAULT 'Copa de Ferias',
    "shortName" TEXT NOT NULL DEFAULT 'CDF',
    "claim" TEXT NOT NULL DEFAULT 'Fútbol que merece el viaje.',
    "contactEmail" TEXT NOT NULL DEFAULT 'hola@copadeferias.com',
    "instagramUrl" TEXT NOT NULL DEFAULT '',
    "facebookUrl" TEXT NOT NULL DEFAULT '',
    "tiktokUrl" TEXT NOT NULL DEFAULT '',
    "legalName" TEXT NOT NULL DEFAULT '',
    "legalTaxId" TEXT NOT NULL DEFAULT '',
    "legalAddress" TEXT NOT NULL DEFAULT '',
    "legalLicense" TEXT NOT NULL DEFAULT '',
    "insuranceInfo" TEXT NOT NULL DEFAULT '',
    "reviewsProvider" TEXT NOT NULL DEFAULT 'none',
    "reviewsUrl" TEXT NOT NULL DEFAULT '',
    "reviewsVisible" BOOLEAN NOT NULL DEFAULT false,
    "ga4Id" TEXT NOT NULL DEFAULT '',
    "metaPixelId" TEXT NOT NULL DEFAULT '',
    "tiktokPixelId" TEXT NOT NULL DEFAULT '',
    "notifyEmailEnabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subtitle" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "homeTeam" TEXT NOT NULL,
    "awayTeam" TEXT NOT NULL,
    "stadium" TEXT NOT NULL,
    "matchDate" TIMESTAMP(3) NOT NULL,
    "durationDays" INTEGER NOT NULL DEFAULT 3,
    "durationNights" INTEGER NOT NULL DEFAULT 2,
    "status" "TripStatus" NOT NULL DEFAULT 'draft',
    "published" BOOLEAN NOT NULL DEFAULT false,
    "homeFeatured" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isDemo" BOOLEAN NOT NULL DEFAULT true,
    "price" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "maxSpots" INTEGER NOT NULL DEFAULT 20,
    "soldSpots" INTEGER NOT NULL DEFAULT 0,
    "minSpots" INTEGER NOT NULL DEFAULT 8,
    "minDeadlineDate" TIMESTAMP(3),
    "singleSupplement" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "requiredTravelerFields" TEXT NOT NULL DEFAULT 'nationality,docType,docNumber,docExpiry,docCountry',
    "requiresShippingAddress" BOOLEAN NOT NULL DEFAULT false,
    "scheduleStatus" "ScheduleStatus" NOT NULL DEFAULT 'time_provisional',
    "travelMode" "TravelMode" NOT NULL DEFAULT 'GROUP_CDF',
    "maxPartySize" INTEGER NOT NULL DEFAULT 10,
    "availablePackageTypes" TEXT NOT NULL DEFAULT 'TICKET_ONLY,TICKET_HOTEL,TICKET_HOTEL_FLIGHT',
    "hostAvailable" BOOLEAN NOT NULL DEFAULT false,
    "hostPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hostPricingType" TEXT NOT NULL DEFAULT 'per_person',
    "hostCapacity" INTEGER NOT NULL DEFAULT 0,
    "hostLanguage" TEXT NOT NULL DEFAULT '',
    "hostNotes" TEXT NOT NULL DEFAULT '',
    "guideEnabled" BOOLEAN NOT NULL DEFAULT false,
    "guideTitle" TEXT NOT NULL DEFAULT '',
    "guidePdfUrl" TEXT NOT NULL DEFAULT '',
    "guideVersion" TEXT NOT NULL DEFAULT '',
    "guideUpdatedAt" TIMESTAMP(3),
    "minimumArrivalBufferBeforeKickoffMinutes" INTEGER NOT NULL DEFAULT 180,
    "minimumReturnBufferAfterEventMinutes" INTEGER NOT NULL DEFAULT 120,
    "orgFeeTicketOnlyOverride" DOUBLE PRECISION,
    "orgFeeHotelTiersOverride" TEXT NOT NULL DEFAULT '',
    "orgFeeHotelFlightTiersOverride" TEXT NOT NULL DEFAULT '',
    "additionalMatchFeeOverride" DOUBLE PRECISION,
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
    "whatsappAvailableAt" TIMESTAMP(3),
    "seoTitle" TEXT NOT NULL DEFAULT '',
    "seoDescription" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Competition" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "region" "Region" NOT NULL,
    "country" TEXT NOT NULL DEFAULT '',
    "competitionType" "CompetitionType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Competition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "competitionId" TEXT,
    "name" TEXT NOT NULL DEFAULT '',
    "homeTeam" TEXT NOT NULL,
    "awayTeam" TEXT NOT NULL,
    "stadium" TEXT NOT NULL,
    "city" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL DEFAULT '',
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Madrid',
    "matchDate" TIMESTAMP(3) NOT NULL,
    "kickoff" TIMESTAMP(3),
    "scheduleStatus" "ScheduleStatus" NOT NULL DEFAULT 'time_provisional',
    "status" "EventStatus" NOT NULL DEFAULT 'draft',
    "imageKey" TEXT NOT NULL DEFAULT 'default',
    "primaryEvent" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketOffer" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'manual',
    "category" TEXT NOT NULL DEFAULT '',
    "sector" TEXT NOT NULL DEFAULT '',
    "costNet" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "stock" INTEGER NOT NULL DEFAULT 0,
    "maxQuantity" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastCheckedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "seatingTogetherGuaranteed" BOOLEAN NOT NULL DEFAULT false,
    "deliveryType" TEXT NOT NULL DEFAULT '',
    "deliveryNotes" TEXT NOT NULL DEFAULT '',
    "restrictions" TEXT NOT NULL DEFAULT '',
    "internalNotes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationFeeConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "feeTicketOnly" DOUBLE PRECISION NOT NULL DEFAULT 49,
    "feeHotelTiers" TEXT NOT NULL DEFAULT '[{"minParty":1,"maxParty":2,"feePerTraveler":99},{"minParty":3,"maxParty":4,"feePerTraveler":94},{"minParty":5,"maxParty":6,"feePerTraveler":89},{"minParty":7,"maxParty":10,"feePerTraveler":84}]',
    "feeHotelFlightTiers" TEXT NOT NULL DEFAULT '[{"minParty":1,"maxParty":2,"feePerTraveler":159},{"minParty":3,"maxParty":4,"feePerTraveler":149},{"minParty":5,"maxParty":6,"feePerTraveler":139},{"minParty":7,"maxParty":10,"feePerTraveler":129}]',
    "additionalMatchFee" DOUBLE PRECISION NOT NULL DEFAULT 25,
    "paymentMethodFees" TEXT NOT NULL DEFAULT '{}',
    "pricingBuffer" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "minimumEstimatedProfit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxEstimateEnabled" BOOLEAN NOT NULL DEFAULT false,
    "taxEstimateRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationFeeConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripOrigin" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TripOrigin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripPlanningDay" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT '',
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TripPlanningDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripActivity" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TripActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripInclusion" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "included" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TripInclusion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripRequirement" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TripRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripFaq" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TripFaq_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Faq" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT '',
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Faq_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "tripId" TEXT,
    "type" "LeadType" NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL,
    "city" TEXT NOT NULL DEFAULT '',
    "consent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
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
    "totalPrice" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "paymentProvider" "PaymentProviderKind" NOT NULL DEFAULT 'demo',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "bookingStatus" "BookingStatus" NOT NULL DEFAULT 'pending_payment',
    "accessToken" TEXT NOT NULL,
    "internalNotes" TEXT NOT NULL DEFAULT '',
    "additionalDataRequestNote" TEXT NOT NULL DEFAULT '',
    "hasReceivedPassport" BOOLEAN NOT NULL DEFAULT false,
    "passportStatus" TEXT NOT NULL DEFAULT 'pending',
    "packageType" "PackageType",
    "partySize" INTEGER,
    "ticketCount" INTEGER,
    "hostSelected" BOOLEAN NOT NULL DEFAULT false,
    "hostCount" INTEGER NOT NULL DEFAULT 0,
    "hotelSelectionSnapshot" TEXT NOT NULL DEFAULT '',
    "flightSelectionSnapshot" TEXT NOT NULL DEFAULT '',
    "priceBreakdownSnapshot" TEXT NOT NULL DEFAULT '',
    "roomingSnapshot" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Traveler" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "birthDate" TIMESTAMP(3),
    "originCity" TEXT NOT NULL DEFAULT '',
    "roomPreference" "RoomPreference" NOT NULL DEFAULT 'share_with_group',
    "roomPartnerName" TEXT NOT NULL DEFAULT '',
    "nationality" TEXT NOT NULL DEFAULT '',
    "sex" TEXT NOT NULL DEFAULT '',
    "docType" TEXT NOT NULL DEFAULT '',
    "docNumber" TEXT NOT NULL DEFAULT '',
    "docExpiry" TIMESTAMP(3),
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Traveler_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckoutAttempt" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "packageType" "PackageType" NOT NULL,
    "partySize" INTEGER NOT NULL,
    "status" "CheckoutAttemptStatus" NOT NULL DEFAULT 'draft',
    "ticketStatus" "TicketComponentStatus" NOT NULL DEFAULT 'not_started',
    "hotelStatus" "HotelComponentStatus",
    "flightStatus" "FlightComponentStatus",
    "paymentStatus" "PaymentComponentStatus" NOT NULL DEFAULT 'not_started',
    "finalQuoteSnapshot" TEXT NOT NULL DEFAULT '',
    "finalQuoteSnapshotVersion" INTEGER NOT NULL DEFAULT 0,
    "ticketSelectionJson" TEXT NOT NULL DEFAULT '',
    "hotelSelectionJson" TEXT NOT NULL DEFAULT '',
    "flightSelectionJson" TEXT NOT NULL DEFAULT '',
    "buyerFirstName" TEXT NOT NULL DEFAULT '',
    "buyerLastName" TEXT NOT NULL DEFAULT '',
    "buyerEmail" TEXT NOT NULL DEFAULT '',
    "buyerPhone" TEXT NOT NULL DEFAULT '',
    "buyerOriginCity" TEXT NOT NULL DEFAULT '',
    "buyerBillingAddress" TEXT NOT NULL DEFAULT '',
    "travelOriginCountry" TEXT NOT NULL DEFAULT '',
    "paymentProviderChoice" "PaymentProviderKind" NOT NULL DEFAULT 'demo',
    "accessToken" TEXT NOT NULL DEFAULT '',
    "bookingId" TEXT,
    "paymentProviderReference" TEXT NOT NULL DEFAULT '',
    "hotelProviderReference" TEXT NOT NULL DEFAULT '',
    "flightProviderReference" TEXT NOT NULL DEFAULT '',
    "stripePaymentIntentId" TEXT NOT NULL DEFAULT '',
    "paymentIntentQuoteVersion" INTEGER,
    "paymentAuthorizationExpiresAt" TIMESTAMP(3),
    "failureCode" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "latestSafePaymentAt" TIMESTAMP(3),

    CONSTRAINT "CheckoutAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckoutAttemptTraveler" (
    "id" TEXT NOT NULL,
    "checkoutAttemptId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "birthDate" TIMESTAMP(3),
    "title" TEXT NOT NULL DEFAULT '',
    "gender" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "nationality" TEXT NOT NULL DEFAULT '',
    "docType" TEXT NOT NULL DEFAULT '',
    "docNumber" TEXT NOT NULL DEFAULT '',
    "docExpiry" TIMESTAMP(3),
    "docCountry" TEXT NOT NULL DEFAULT '',
    "emergencyContactName" TEXT NOT NULL DEFAULT '',
    "emergencyContactPhone" TEXT NOT NULL DEFAULT '',
    "originAirport" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CheckoutAttemptTraveler_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketHold" (
    "id" TEXT NOT NULL,
    "checkoutAttemptId" TEXT NOT NULL,
    "ticketOfferId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "TicketHoldStatus" NOT NULL DEFAULT 'held',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketHold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckoutAttemptEvent" (
    "id" TEXT NOT NULL,
    "checkoutAttemptId" TEXT NOT NULL,
    "type" "CheckoutAttemptEventType" NOT NULL,
    "providerReference" TEXT NOT NULL DEFAULT '',
    "sanitizedDetail" TEXT NOT NULL DEFAULT '',
    "providerEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheckoutAttemptEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlightSearchSession" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "partySize" INTEGER NOT NULL,
    "originIata" TEXT NOT NULL,
    "destinationIata" TEXT NOT NULL,
    "outboundDate" TEXT NOT NULL,
    "returnDate" TEXT NOT NULL,
    "offerRequestId" TEXT NOT NULL,
    "passengerIds" TEXT NOT NULL,
    "offersJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlightSearchSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingDocument" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "type" "BookingDocumentType" NOT NULL,
    "eventId" TEXT NOT NULL DEFAULT '',
    "label" TEXT NOT NULL DEFAULT '',
    "status" "BookingDocumentStatus" NOT NULL DEFAULT 'pending',
    "fileUrl" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingUpdate" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingAction" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "type" "BookingActionType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" "BookingActionStatus" NOT NULL DEFAULT 'pending',
    "actionUrl" TEXT NOT NULL DEFAULT '',
    "dueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "BookingAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeRequest" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "type" "ChangeRequestType" NOT NULL,
    "description" TEXT NOT NULL,
    "status" "ChangeRequestStatus" NOT NULL DEFAULT 'requested',
    "resolutionNotes" TEXT NOT NULL DEFAULT '',
    "cost" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "timingDaysOffset" INTEGER,
    "timingReference" TEXT NOT NULL DEFAULT 'immediate',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailLog" (
    "id" TEXT NOT NULL,
    "templateKey" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "mode" "EmailMode" NOT NULL DEFAULT 'demo',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bookingId" TEXT,

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Trip_number_key" ON "Trip"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Trip_slug_key" ON "Trip"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Competition_name_region_key" ON "Competition"("name", "region");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_reference_key" ON "Booking"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_accessToken_key" ON "Booking"("accessToken");

-- CreateIndex
CREATE UNIQUE INDEX "CheckoutAttempt_accessToken_key" ON "CheckoutAttempt"("accessToken");

-- CreateIndex
CREATE UNIQUE INDEX "CheckoutAttempt_bookingId_key" ON "CheckoutAttempt"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "CheckoutAttemptTraveler_checkoutAttemptId_order_key" ON "CheckoutAttemptTraveler"("checkoutAttemptId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "TicketHold_checkoutAttemptId_ticketOfferId_key" ON "TicketHold"("checkoutAttemptId", "ticketOfferId");

-- CreateIndex
CREATE UNIQUE INDEX "CheckoutAttemptEvent_providerEventId_key" ON "CheckoutAttemptEvent"("providerEventId");

-- CreateIndex
CREATE INDEX "FlightSearchSession_tripId_originIata_partySize_idx" ON "FlightSearchSession"("tripId", "originIata", "partySize");

-- CreateIndex
CREATE UNIQUE INDEX "EmailTemplate_key_key" ON "EmailTemplate"("key");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketOffer" ADD CONSTRAINT "TicketOffer_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripOrigin" ADD CONSTRAINT "TripOrigin_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripPlanningDay" ADD CONSTRAINT "TripPlanningDay_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripActivity" ADD CONSTRAINT "TripActivity_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripInclusion" ADD CONSTRAINT "TripInclusion_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripRequirement" ADD CONSTRAINT "TripRequirement_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripFaq" ADD CONSTRAINT "TripFaq_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Traveler" ADD CONSTRAINT "Traveler_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckoutAttempt" ADD CONSTRAINT "CheckoutAttempt_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckoutAttempt" ADD CONSTRAINT "CheckoutAttempt_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckoutAttemptTraveler" ADD CONSTRAINT "CheckoutAttemptTraveler_checkoutAttemptId_fkey" FOREIGN KEY ("checkoutAttemptId") REFERENCES "CheckoutAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketHold" ADD CONSTRAINT "TicketHold_checkoutAttemptId_fkey" FOREIGN KEY ("checkoutAttemptId") REFERENCES "CheckoutAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketHold" ADD CONSTRAINT "TicketHold_ticketOfferId_fkey" FOREIGN KEY ("ticketOfferId") REFERENCES "TicketOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckoutAttemptEvent" ADD CONSTRAINT "CheckoutAttemptEvent_checkoutAttemptId_fkey" FOREIGN KEY ("checkoutAttemptId") REFERENCES "CheckoutAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingDocument" ADD CONSTRAINT "BookingDocument_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingUpdate" ADD CONSTRAINT "BookingUpdate_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingAction" ADD CONSTRAINT "BookingAction_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
