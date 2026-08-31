/**
 * Fase 1 of the real checkout saga — persistent foundation only. Nothing
 * in this directory is wired into the live A_TU_AIRE checkout yet
 * (createAtuAireBooking, the mock providers, and the public UI are all
 * untouched). See this session's architecture report/addenda for the
 * full design rationale — this file only re-exports the Prisma-generated
 * enums under names local code imports from, the same pattern already
 * used for PackageType/ScheduleStatus elsewhere in this codebase.
 */
export type {
  CheckoutAttempt,
  CheckoutAttemptStatus,
  TicketComponentStatus,
  HotelComponentStatus,
  FlightComponentStatus,
  PaymentComponentStatus,
  TicketHold,
  TicketHoldStatus,
  CheckoutAttemptEvent,
  CheckoutAttemptEventType,
} from "@prisma/client";
