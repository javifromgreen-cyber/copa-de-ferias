import type { ScheduleStatus } from "@prisma/client";
import { formatDate } from "@/lib/utils";
import type { FaqItem } from "@/components/faq/FaqAccordion";

function scheduleFaqItem(matchDate: Date, scheduleStatus: ScheduleStatus): FaqItem {
  if (scheduleStatus === "confirmed") {
    return {
      id: "schedule",
      question: "¿Está confirmado el horario de este partido?",
      answer: `Sí, el horario ya está confirmado por la competición: se juega el ${formatDate(matchDate, { day: "numeric", month: "long", year: "numeric" })} a las ${formatDate(matchDate, { hour: "2-digit", minute: "2-digit" })}.`,
    };
  }
  if (scheduleStatus === "time_provisional") {
    return {
      id: "schedule",
      question: "¿Está confirmado el horario de este partido?",
      answer: `La fecha está confirmada (${formatDate(matchDate, { day: "numeric", month: "long", year: "numeric" })}), pero la competición todavía no ha anunciado la hora exacta. En cuanto se confirme, la actualizamos en esta ficha y te avisamos si ya has reservado.`,
    };
  }
  return {
    id: "schedule",
    question: "¿Está confirmada la fecha de este partido?",
    answer:
      "Este partido corresponde a una jornada o eliminatoria ya definida, pero la fecha exacta todavía no está confirmada oficialmente. En cuanto se confirme, la actualizamos en esta ficha y te avisamos si ya has reservado.",
  };
}

// Universal across every A_TU_AIRE match — prudent, provider-dependent
// language throughout, never an absolute guarantee (§22/§43).
const STATIC_ITEMS: FaqItem[] = [
  {
    id: "asiento",
    question: "¿Puedo elegir mi asiento en el estadio?",
    answer:
      "La asignación de asientos depende de cada proveedor de ticketing y de la disponibilidad en el momento de la compra. Cuando es posible elegir zona o categoría, te lo mostramos durante la reserva.",
  },
  {
    id: "asientos-juntos",
    question: "Si reservamos varias entradas juntos, ¿nos sentamos en el mismo sector?",
    answer:
      "Hacemos lo posible por sentar juntas a las personas de una misma reserva dentro del mismo sector, aunque no siempre podemos garantizar asientos exactamente contiguos: depende de la disponibilidad del proveedor en el momento de la compra.",
  },
  {
    id: "entrega-entrada",
    question: "¿Cuándo recibo la entrada?",
    answer:
      'Recibirás la entrada antes del partido, normalmente en formato digital. El plazo exacto depende del proveedor y de la antelación con la que compres; te lo iremos indicando desde tu área "Mi Viaje".',
  },
  {
    id: "anadir-hotel-vuelo",
    question: "¿Puedo añadir hotel y vuelo después de reservar solo la entrada?",
    answer:
      "Si en el checkout eliges únicamente la entrada, no puedes añadir hotel o vuelo más adelante sobre esa misma reserva. Si quieres viajar con nosotros, elige la opción con hotel o con hotel y vuelo directamente en el checkout.",
  },
];

/**
 * Per-match FAQ for an A_TU_AIRE ficha (§22): one dynamic Q&A driven by
 * the trip's real scheduleStatus/matchDate — never a hardcoded date — plus
 * 4 static, universal Q&As that apply to every match the same way.
 */
export function getAtuAireFaqItems(trip: { matchDate: Date; scheduleStatus: ScheduleStatus }): FaqItem[] {
  return [scheduleFaqItem(trip.matchDate, trip.scheduleStatus), ...STATIC_ITEMS];
}
