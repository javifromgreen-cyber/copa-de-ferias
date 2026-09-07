-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CheckoutAttemptEventType" ADD VALUE 'hotel_not_auto_bookable';
ALTER TYPE "CheckoutAttemptEventType" ADD VALUE 'hotel_safe_window_expired';
ALTER TYPE "CheckoutAttemptEventType" ADD VALUE 'hotel_book_started';
ALTER TYPE "CheckoutAttemptEventType" ADD VALUE 'hotel_booked';
ALTER TYPE "CheckoutAttemptEventType" ADD VALUE 'hotel_book_reconciled';
ALTER TYPE "CheckoutAttemptEventType" ADD VALUE 'hotel_book_failed';
ALTER TYPE "CheckoutAttemptEventType" ADD VALUE 'hotel_book_ambiguous';
ALTER TYPE "CheckoutAttemptEventType" ADD VALUE 'hotel_cancel_started';
ALTER TYPE "CheckoutAttemptEventType" ADD VALUE 'hotel_cancelled';
ALTER TYPE "CheckoutAttemptEventType" ADD VALUE 'hotel_cancel_ambiguous';
