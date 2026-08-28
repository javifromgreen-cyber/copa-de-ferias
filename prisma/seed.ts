/**
 * Copa de Ferias — demo seed data.
 *
 * Everything created here is clearly internal demo content: fake buyer
 * names, no real emails, no invented licences/testimonials. Run with
 * `npm run db:seed` (also runs automatically after `prisma migrate reset`).
 */
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { KNOWN_COMPETITIONS } from "../src/lib/catalog/knownCompetitions";
import { computeOrganizationFee, NO_OVERRIDES } from "../src/lib/pricing/organizationFee";

const prisma = new PrismaClient();

function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

// Next Saturday at least `minDaysOut` days from now — keeps the demo trip
// date consistent with the Friday/Saturday/Sunday planning copy.
function nextSaturday(minDaysOut: number) {
  const d = addDays(new Date(), minDaysOut);
  const day = d.getDay(); // 0 = Sunday ... 6 = Saturday
  const diff = (6 - day + 7) % 7;
  d.setDate(d.getDate() + diff);
  d.setHours(21, 0, 0, 0);
  return d;
}

function token() {
  return randomBytes(16).toString("hex");
}

function reference() {
  return "CDF-" + randomBytes(4).toString("hex").toUpperCase();
}

async function main() {
  console.log("Seeding Copa de Ferias demo data...");

  // -----------------------------------------------------------------
  // Brand config (singleton)
  // -----------------------------------------------------------------
  await prisma.brandConfig.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      name: "Copa de Ferias",
      shortName: "CDF",
      claim: "Fútbol que merece el viaje.",
      contactEmail: "hola@copadeferias.com",
      instagramUrl: "https://instagram.com/copadeferias",
      facebookUrl: "https://facebook.com/copadeferias",
      tiktokUrl: "https://tiktok.com/@copadeferias",
      legalName: "",
      legalTaxId: "",
      legalAddress: "",
      legalLicense: "",
      insuranceInfo: "",
      reviewsProvider: "none",
      reviewsUrl: "",
      reviewsVisible: false,
      ga4Id: "",
      metaPixelId: "",
      tiktokPixelId: "",
      notifyEmailEnabled: false,
    },
    update: {},
  });

  // -----------------------------------------------------------------
  // Organization fee config (singleton) — global margin defaults per
  // §71-74/§163-166. Every existing/new trip uses these unless it sets its
  // own orgFee*Override.
  // -----------------------------------------------------------------
  const feeConfig = await prisma.organizationFeeConfig.upsert({
    where: { id: "default" },
    create: { id: "default" },
    update: {},
  });

  // -----------------------------------------------------------------
  // Competition classification catalog (region → country → type →
  // competition) — seeded once from the reference list so it's never
  // re-entered ad hoc per Event. See src/lib/catalog/knownCompetitions.ts.
  // -----------------------------------------------------------------
  const competitionByName = new Map<string, string>();
  for (const c of KNOWN_COMPETITIONS) {
    const row = await prisma.competition.upsert({
      where: { name_region: { name: c.name, region: c.region } },
      create: c,
      update: { country: c.country, competitionType: c.competitionType },
    });
    competitionByName.set(c.name, row.id);
  }

  // -----------------------------------------------------------------
  // Global FAQ — grouped into 7 categories for the general FAQ page.
  // This phase communicates exclusively about matches (§0): every answer
  // here reflects the A_TU_AIRE model (entrada / entrada+hotel /
  // entrada+hotel+vuelo, chosen per match), not the retired GROUP_CDF
  // "viaje cerrado con coordinador" framing. Payment methods listed match
  // exactly what src/lib/payments actually implements (Stripe: card,
  // Bizum, Klarna; PayPal) — never invented.
  // -----------------------------------------------------------------
  await prisma.faq.deleteMany();
  const faqs: Array<[string, string, string]> = [
    [
      "antes-de-reservar",
      "¿Cómo elijo el partido?",
      "Busca por equipo, ciudad o competición en el buscador o en el catálogo de partidos, y entra en la ficha del que te interese. Ahí verás el estadio, la fecha y las opciones disponibles.",
    ],
    [
      "antes-de-reservar",
      "¿Qué puedo reservar en cada partido?",
      "Depende de cada partido: normalmente puedes elegir entre solo entrada, entrada + hotel, o entrada + hotel + vuelo. En la ficha del partido y en el checkout verás las opciones disponibles para ese partido en concreto.",
    ],
    [
      "antes-de-reservar",
      "¿Puedo viajar solo?",
      "Sí. Puedes reservar solo, en pareja o con un grupo de amigos; el precio es por persona.",
    ],
    [
      "antes-de-reservar",
      "¿Qué edad necesito para reservar?",
      "La edad mínima para reservar y viajar es 18 años.",
    ],
    [
      "entradas",
      "¿La entrada está siempre incluida?",
      "Sí: la entrada al partido forma parte de las tres opciones de reserva (solo entrada, con hotel, o con hotel y vuelo).",
    ],
    [
      "entradas",
      "¿Puedo elegir mi asiento?",
      "Depende del proveedor de ticketing y de la disponibilidad en el momento de la compra. Cuando es posible elegir zona o categoría, te lo mostramos durante la reserva.",
    ],
    [
      "entradas",
      "¿Cuándo recibo la entrada?",
      "Antes del partido, normalmente en formato digital. El plazo exacto depende del proveedor y de la antelación con la que compres; te lo indicamos desde \"Mi Viaje\".",
    ],
    [
      "entradas",
      "Si reservamos varias entradas juntos, ¿nos sentamos juntos?",
      "Hacemos lo posible por mantener juntas a las personas de una misma reserva dentro del mismo sector, aunque no siempre podemos garantizar asientos exactamente contiguos.",
    ],
    [
      "hotel",
      "¿Cómo se reparten las habitaciones?",
      "Según el número de viajeros de tu reserva armamos la combinación de habitaciones dobles y triples más ajustada. Por ejemplo: 4 personas → 2 habitaciones dobles; 5 personas → 1 doble + 1 triple; 6 personas → 3 dobles. Durante la reserva ves exactamente cómo queda repartido tu grupo.",
    ],
    [
      "hotel",
      "¿Puedo pedir habitación individual?",
      "Depende del hotel y la disponibilidad de ese partido; cuando es posible, se muestra como opción con su suplemento correspondiente durante la reserva.",
    ],
    [
      "hotel",
      "¿Dónde está el hotel?",
      "Buscamos hoteles bien situados respecto al estadio y al centro de la ciudad. La zona concreta se indica en la ficha del partido.",
    ],
    [
      "hotel",
      "¿Qué pasa si viajo solo y elijo hotel?",
      "Si tu reserva es de una sola persona, compartes habitación doble con otro viajero de tu mismo sexo, salvo que prefieras pagar el suplemento de individual cuando esté disponible.",
    ],
    [
      "vuelos",
      "¿Desde qué ciudades hay vuelo disponible?",
      "Depende de cada partido: en el checkout verás los orígenes disponibles para esa ruta concreta. Si tu ciudad no aparece, de momento no podemos ofrecerte esa combinación.",
    ],
    [
      "vuelos",
      "¿Puedo elegir la franja horaria del vuelo?",
      "Cuando hay varias opciones, te las mostramos en el checkout. Coordinamos los horarios pensando en el partido, así que en algunos casos solo hay una franja disponible.",
    ],
    [
      "vuelos",
      "¿Qué pasa si pierdo mi vuelo?",
      "Contacta con nosotros en cuanto lo sepas. Te ayudamos a reorganizarte, aunque los gastos de un nuevo billete corren por tu cuenta salvo que el retraso sea responsabilidad nuestra.",
    ],
    [
      "pago-y-reserva",
      "¿Cómo funcionan los pagos?",
      "Tu reserva se paga íntegra en el momento de reservar, con tarjeta, Bizum o Klarna a través de Stripe, o con PayPal. Durante el pago pueden aparecer opciones de pago aplazado de Klarna o PayPal según disponibilidad para tu compra.",
    ],
    [
      "pago-y-reserva",
      "¿Hay depósitos o pagos parciales?",
      "No por nuestra parte: el importe se cobra completo al reservar. Si tu proveedor de pago ofrece financiación (Klarna, PayPal Pay Later), la gestionas directamente con ellos durante el pago.",
    ],
    [
      "pago-y-reserva",
      "¿Puedo cancelar mi reserva?",
      "Sí, puedes solicitarlo desde \"Mi Viaje\". Las condiciones (plazos, importes reembolsables) se detallan antes de reservar y dependen de lo cerca que estés de la fecha del partido.",
    ],
    [
      "pago-y-reserva",
      "¿Puedo cambiar el nombre de un viajero ya confirmado?",
      "Una vez confirmada la reserva no se puede editar libremente. Puedes solicitar un cambio desde \"Mi Viaje\" y lo revisamos caso por caso.",
    ],
    [
      "despues-de-reservar",
      "¿Qué ocurre justo después de reservar?",
      "Recibes la confirmación al instante. A partir de ahí, desde \"Mi Viaje\" vas completando los datos que falten y siguiendo toda la información del partido.",
    ],
    [
      "despues-de-reservar",
      "¿Qué documentación necesito?",
      "Depende del destino. Te lo indicamos con tiempo suficiente y lo completas desde \"Mi Viaje\" después de reservar.",
    ],
    [
      "despues-de-reservar",
      "¿Cómo sé si hay cambios en el horario del partido?",
      "Si la competición confirma o modifica el horario, lo actualizamos en la ficha del partido y te avisamos si ya has reservado.",
    ],
    [
      "por-que-copa-de-ferias",
      "¿Qué hace diferente a Copa de Ferias?",
      "No vendemos el mismo viaje a todo el mundo: cada partido tiene su propio plan de entrada, hotel y vuelo, pensado para ese estadio y esa ciudad.",
    ],
    [
      "por-que-copa-de-ferias",
      "¿Con qué proveedores trabajáis?",
      "Las entradas se gestionan con proveedores de ticketing deportivo con acceso oficial a cada partido; el hotel y el vuelo, con partners especializados en viajes de fútbol.",
    ],
    [
      "por-que-copa-de-ferias",
      "¿Copa de Ferias tiene relación con la antigua competición del mismo nombre?",
      "No. Tomamos prestado un nombre con historia porque nos gusta la idea de ciudades conectadas por el fútbol, pero no somos continuadores de aquel torneo ni tenemos relación con UEFA, FIFA ni ninguna organización que lo gestionase.",
    ],
  ];
  for (let i = 0; i < faqs.length; i++) {
    await prisma.faq.create({
      data: { category: faqs[i][0], question: faqs[i][1], answer: faqs[i][2], order: i, active: true },
    });
  }

  // -----------------------------------------------------------------
  // Trip #001 — Belgrado, El Derbi Eterno (OPEN, full public page)
  // -----------------------------------------------------------------
  const belgradoMatchDate = nextSaturday(85);

  await prisma.trip.deleteMany({ where: { slug: "derbi-eterno-belgrado" } });
  const belgrado = await prisma.trip.create({
    data: {
      number: 1,
      slug: "derbi-eterno-belgrado",
      name: "Belgrado",
      subtitle: "El Derbi Eterno",
      city: "Belgrado",
      country: "Serbia",
      homeTeam: "Estrella Roja",
      awayTeam: "Partizan",
      stadium: "Estadio Rajko Mitić",
      matchDate: belgradoMatchDate,
      durationDays: 3,
      durationNights: 2,
      status: "open",
      published: true,
      homeFeatured: true,
      order: 0,
      isDemo: true,
      price: 549,
      currency: "EUR",
      maxSpots: 20,
      soldSpots: 0, // recalculated below from demo bookings
      minSpots: 8,
      minDeadlineDate: addDays(belgradoMatchDate, -30),
      singleSupplement: 90,
      requiredTravelerFields: "nationality,docType,docNumber,docExpiry,docCountry",
      scheduleStatus: "confirmed",
      heroImageKey: "belgrado",
      description:
        "Belgrado es una de esas ciudades que todo enfermo del fútbol tiene apuntada en algún sitio. El Eterno Derbi entre Estrella Roja y Partizan no es un partido cualquiera: es la ciudad entera dividida en dos, un ambiente que se nota desde el aeropuerto y noventa minutos que se recuerdan durante años. Montamos un viaje corto y bien resuelto para vivirlo desde dentro, con grupo pequeño y gente que va exactamente por lo mismo que tú.",
      whyWeGo:
        "Porque hay derbis que se ven por televisión y hay derbis que hay que vivir en la grada. El de Belgrado es de los segundos. Bengalas, cánticos que no paran en todo el partido y una rivalidad que lleva décadas siendo una de las más intensas de Europa. Si te gusta el fútbol de verdad, este es de los viajes que justifican coger un avión.",
      localCulture:
        "Estrella Roja y Partizan representan mucho más que dos clubes de fútbol: son parte de la identidad de la ciudad. El ambiente previo se vive en las calles del centro y en Skadarlija, el barrio bohemio de Belgrado, antes de trasladarse hacia el estadio con el resto de aficionados.",
      departureText: "Salida viernes por la mañana desde España.",
      returnText: "Regreso domingo por la noche.",
      hotelStars: 4,
      hotelZone: "Centro de Belgrado",
      hotelCentric: true,
      hotelDescription:
        "Hotel céntrico de 4 estrellas, a distancia caminable de las zonas con más ambiente y bien comunicado con el estadio.",
      ticketCategory: "Categoría 2",
      ticketSector: "Grada lateral",
      ticketSeating: "El grupo se sienta junto siempre que la organización del estadio lo permite.",
      insuranceDescription:
        "Seguro de asistencia en viaje incluido (asistencia médica y equipaje). Consulta las condiciones completas antes de reservar; no sustituye ninguna obligación legal del organizador.",
      coordinatorName: "Coordinador de Copa de Ferias (viaja desde Barcelona)",
      hostName: "Host local en Belgrado",
      cancellationPolicy:
        "Cancelaciones con más de 30 días de antelación: reembolso íntegro salvo gastos ya comprometidos con proveedores. Entre 30 y 15 días: reembolso parcial. Menos de 15 días: sin reembolso salvo causa mayor.",
      importantConditions:
        "Viaje pensado para mayores de 18 años. La entrada, el sector y el planning pueden sufrir pequeños ajustes por causas ajenas a Copa de Ferias (organización del club, seguridad, autoridades locales); en ese caso te avisamos en cuanto lo sepamos.",
      whatsappUrl: "https://chat.whatsapp.com/demo-belgrado",
      whatsappAvailableAt: addDays(belgradoMatchDate, -15),
      seoTitle: "Belgrado — El Derbi Eterno | Copa de Ferias",
      seoDescription:
        "Viaje a Belgrado para vivir el Eterno Derbi entre Estrella Roja y Partizan. Vuelo, hotel, entrada, host local y coordinador. Grupo pequeño, 3 días.",
    },
  });

  // Kept in sync with the Trip's own homeTeam/awayTeam/stadium/matchDate —
  // GROUP_CDF pages still read those legacy Trip fields directly; this
  // Event row exists for forward-compatibility with the multi-match engine.
  await prisma.event.create({
    data: {
      tripId: belgrado.id,
      competitionId: competitionByName.get("Serbian SuperLiga") ?? null,
      homeTeam: belgrado.homeTeam,
      awayTeam: belgrado.awayTeam,
      stadium: belgrado.stadium,
      city: belgrado.city,
      country: belgrado.country,
      timezone: "Europe/Belgrade",
      matchDate: belgrado.matchDate,
      scheduleStatus: belgrado.scheduleStatus,
      status: "published",
      primaryEvent: true,
      order: 0,
    },
  });

  await prisma.tripOrigin.createMany({
    data: [
      { tripId: belgrado.id, city: "Barcelona", order: 0 },
      { tripId: belgrado.id, city: "Madrid", order: 1 },
    ],
  });

  await prisma.tripPlanningDay.createMany({
    data: [
      {
        tripId: belgrado.id,
        title: "Viernes",
        description:
          "Salida desde España. Llegada a Belgrado y transfer al hotel. Check-in y encuentro del grupo. Primera toma de contacto con la ciudad y su ambiente.",
        order: 0,
      },
      {
        tripId: belgrado.id,
        title: "Sábado",
        description:
          "Ruta futbolística por la ciudad y el barrio del estadio. Encuentro con el host local. Tiempo de previa en la zona del estadio. Estrella Roja - Partizan. Regreso al hotel.",
        order: 1,
      },
      {
        tripId: belgrado.id,
        title: "Domingo",
        description: "Tiempo libre en la ciudad y regreso a España.",
        order: 2,
      },
    ],
  });

  await prisma.tripActivity.createMany({
    data: [
      {
        tripId: belgrado.id,
        title: "Tour por el Estadio Rajko Mitić",
        description: "Recorrido por el estadio y su entorno con el host local.",
        order: 0,
      },
      {
        tripId: belgrado.id,
        title: "Ruta futbolística por Belgrado",
        description: "Los puntos que explican la rivalidad entre Estrella Roja y Partizan, contados desde dentro.",
        order: 1,
      },
      {
        tripId: belgrado.id,
        title: "Tiempo de previa en la zona del estadio",
        description: "El ambiente antes del derbi, en las calles del centro.",
        order: 2,
      },
    ],
  });

  await prisma.tripInclusion.createMany({
    data: [
      { tripId: belgrado.id, text: "Vuelos desde el origen seleccionado", included: true, order: 0 },
      { tripId: belgrado.id, text: "Transfers definidos en el planning", included: true, order: 1 },
      { tripId: belgrado.id, text: "2 noches de hotel", included: true, order: 2 },
      { tripId: belgrado.id, text: "Habitación doble compartida", included: true, order: 3 },
      { tripId: belgrado.id, text: "Entrada al partido", included: true, order: 4 },
      { tripId: belgrado.id, text: "Actividades futbolísticas especificadas", included: true, order: 5 },
      { tripId: belgrado.id, text: "Host local", included: true, order: 6 },
      { tripId: belgrado.id, text: "Coordinador del grupo", included: true, order: 7 },
      { tripId: belgrado.id, text: "Seguro de asistencia en viaje", included: true, order: 8 },
      { tripId: belgrado.id, text: "Pasaporte CDF y pegatina del viaje", included: true, order: 9 },
      { tripId: belgrado.id, text: "Comidas, salvo indicación expresa", included: false, order: 10 },
      { tripId: belgrado.id, text: "Bebidas y alcohol", included: false, order: 11 },
      { tripId: belgrado.id, text: "Gastos personales", included: false, order: 12 },
      { tripId: belgrado.id, text: "Actividades opcionales no descritas en el planning", included: false, order: 13 },
      { tripId: belgrado.id, text: "Suplemento de habitación individual", included: false, order: 14 },
      { tripId: belgrado.id, text: "Desplazamiento hasta el aeropuerto de origen", included: false, order: 15 },
      { tripId: belgrado.id, text: "Equipaje adicional al permitido", included: false, order: 16 },
      { tripId: belgrado.id, text: "Documentación o visados, cuando correspondan", included: false, order: 17 },
    ],
  });

  await prisma.tripRequirement.createMany({
    data: [
      { tripId: belgrado.id, text: "DNI o pasaporte en vigor durante todo el viaje", order: 0 },
      { tripId: belgrado.id, text: "Clima habitual de noviembre en Belgrado: lleva ropa de abrigo", order: 1 },
      { tripId: belgrado.id, text: "Punto de encuentro: recepción del hotel, se confirma por WhatsApp", order: 2 },
    ],
  });

  await prisma.tripFaq.createMany({
    data: [
      {
        tripId: belgrado.id,
        question: "¿En qué sector nos sentamos?",
        answer: "Categoría 2, grada lateral. El grupo se sienta junto siempre que el estadio lo permita.",
        order: 0,
      },
      {
        tripId: belgrado.id,
        question: "¿Hay un punto de encuentro antes del partido?",
        answer: "Sí, quedamos en el hotel con el coordinador y el host local; el horario exacto se confirma por WhatsApp más cerca de la fecha.",
        order: 1,
      },
    ],
  });

  // -----------------------------------------------------------------
  // Trip #002 — Fútbol Inglés (UPCOMING, no public page yet)
  // -----------------------------------------------------------------
  await prisma.trip.deleteMany({ where: { slug: "futbol-ingles" } });
  const futbolInglesTrip = await prisma.trip.create({
    data: {
      number: 2,
      slug: "futbol-ingles",
      name: "Fútbol Inglés",
      subtitle: "3 partidos · 3 días",
      city: "Inglaterra",
      country: "Reino Unido",
      homeTeam: "Por confirmar",
      awayTeam: "Por confirmar",
      stadium: "Varios estadios",
      matchDate: nextSaturday(150),
      durationDays: 3,
      durationNights: 2,
      status: "upcoming",
      published: false,
      homeFeatured: true,
      order: 1,
      isDemo: true,
      price: 0,
      currency: "EUR",
      maxSpots: 20,
      soldSpots: 0,
      minSpots: 8,
      singleSupplement: 90,
      scheduleStatus: "time_provisional",
      heroImageKey: "futbol-ingles",
      description: "Todavía en preparación. Déjanos tu email y te avisamos en cuanto abramos plazas.",
      seoTitle: "Fútbol Inglés | Copa de Ferias",
      seoDescription: "Próximo viaje de Copa de Ferias: 3 partidos de fútbol inglés en 3 días.",
    },
  });
  await prisma.event.create({
    data: {
      tripId: futbolInglesTrip.id,
      homeTeam: futbolInglesTrip.homeTeam,
      awayTeam: futbolInglesTrip.awayTeam,
      stadium: futbolInglesTrip.stadium,
      matchDate: futbolInglesTrip.matchDate,
      scheduleStatus: futbolInglesTrip.scheduleStatus,
      primaryEvent: true,
      order: 0,
    },
  });

  // -----------------------------------------------------------------
  // Trip #003 — Lisboa, Derbi de Lisboa (UPCOMING, no public page yet)
  // -----------------------------------------------------------------
  await prisma.trip.deleteMany({ where: { slug: "derbi-lisboa" } });
  const lisboaTrip = await prisma.trip.create({
    data: {
      number: 3,
      slug: "derbi-lisboa",
      name: "Lisboa",
      subtitle: "Derbi de Lisboa",
      city: "Lisboa",
      country: "Portugal",
      homeTeam: "Sporting",
      awayTeam: "Benfica",
      stadium: "Por confirmar",
      matchDate: nextSaturday(180),
      durationDays: 3,
      durationNights: 2,
      status: "upcoming",
      published: false,
      homeFeatured: true,
      order: 2,
      isDemo: true,
      price: 0,
      currency: "EUR",
      maxSpots: 20,
      soldSpots: 0,
      minSpots: 8,
      singleSupplement: 90,
      scheduleStatus: "time_provisional",
      heroImageKey: "lisboa",
      description: "Todavía en preparación. Déjanos tu email y te avisamos en cuanto abramos plazas.",
      seoTitle: "Lisboa — Derbi de Lisboa | Copa de Ferias",
      seoDescription: "Próximo viaje de Copa de Ferias: el derbi de Lisboa entre Sporting y Benfica.",
    },
  });
  await prisma.event.create({
    data: {
      tripId: lisboaTrip.id,
      homeTeam: lisboaTrip.homeTeam,
      awayTeam: lisboaTrip.awayTeam,
      stadium: lisboaTrip.stadium,
      matchDate: lisboaTrip.matchDate,
      scheduleStatus: lisboaTrip.scheduleStatus,
      primaryEvent: true,
      order: 0,
    },
  });

  // -----------------------------------------------------------------
  // A_TU_AIRE demo products — three genuinely different scenarios for
  // exercising the commercial engine, not three clones with a different
  // team. Ticket prices come first; Trip.price below is only a legacy
  // "desde" display figure (that column predates A_TU_AIRE and is still
  // NOT NULL) computed once here from the real engine — it is not kept
  // resynced automatically, since nothing reads it for A_TU_AIRE pricing
  // yet (that happens in the still-unbuilt checkout, off computeQuote).
  // -----------------------------------------------------------------
  function fromPrice(cheapestTicketCost: number) {
    return cheapestTicketCost + computeOrganizationFee({ packageType: "TICKET_ONLY", partySize: 1, matchCount: 1, global: feeConfig, overrides: NO_OVERRIDES }).total;
  }

  // --- DEMO A — Ámsterdam, De Klassieker — TICKET_ONLY only ----------
  await prisma.trip.deleteMany({ where: { slug: "amsterdam-de-klassieker" } });
  const demoA = await prisma.trip.create({
    data: {
      number: 4,
      slug: "amsterdam-de-klassieker",
      name: "Ámsterdam",
      subtitle: "De Klassieker",
      city: "Ámsterdam",
      country: "Países Bajos",
      homeTeam: "Ajax",
      awayTeam: "Feyenoord",
      stadium: "Johan Cruijff ArenA",
      matchDate: nextSaturday(60),
      durationDays: 2,
      durationNights: 1,
      status: "open",
      published: true,
      homeFeatured: false,
      order: 3,
      isDemo: true,
      price: fromPrice(45),
      scheduleStatus: "confirmed",
      travelMode: "A_TU_AIRE",
      maxPartySize: 6,
      availablePackageTypes: "TICKET_ONLY",
      heroImageKey: "amsterdam",
      description: "Demo A_TU_AIRE — escenario de entrada suelta, sin hotel ni vuelo en el paquete.",
      seoTitle: "Ámsterdam — De Klassieker | Copa de Ferias",
      seoDescription: "Entrada para el Ajax - Feyenoord, a tu aire.",
    },
  });
  const demoAEvent = await prisma.event.create({
    data: {
      tripId: demoA.id,
      competitionId: competitionByName.get("Eredivisie") ?? null,
      homeTeam: "Ajax",
      awayTeam: "Feyenoord",
      stadium: "Johan Cruijff ArenA",
      city: "Ámsterdam",
      country: "Países Bajos",
      timezone: "Europe/Amsterdam",
      matchDate: demoA.matchDate,
      kickoff: new Date(new Date(demoA.matchDate).setHours(20, 0, 0, 0)),
      scheduleStatus: "confirmed",
      status: "published",
      primaryEvent: true,
      order: 0,
    },
  });
  await prisma.ticketOffer.createMany({
    data: [
      {
        eventId: demoAEvent.id,
        provider: "manual",
        category: "General",
        sector: "Fondo",
        costNet: 45,
        currency: "EUR",
        stock: 100,
        deliveryType: "digital",
        active: true,
      },
      {
        eventId: demoAEvent.id,
        provider: "manual",
        category: "Tribuna preferente",
        sector: "Lateral",
        costNet: 85,
        currency: "EUR",
        stock: 30,
        deliveryType: "digital",
        active: true,
      },
    ],
  });

  // --- DEMO B — Milán, Derby della Madonnina — TICKET_ONLY + TICKET_HOTEL
  // Party sizes needing a triple room (3/5/7/9 travelers) legitimately hit
  // MockHotelProviderA's zero-triple inventory here: it stays the cheaper
  // provider but becomes invalid, so selection must fall through to
  // MockHotelProviderB. Party sizes 1/2/4/6/8 stay within A's inventory.
  await prisma.trip.deleteMany({ where: { slug: "milan-derby-della-madonnina" } });
  const demoB = await prisma.trip.create({
    data: {
      number: 5,
      slug: "milan-derby-della-madonnina",
      name: "Milán",
      subtitle: "Derby della Madonnina",
      city: "Milán",
      country: "Italia",
      homeTeam: "Inter",
      awayTeam: "Milan",
      stadium: "Stadio San Siro",
      matchDate: nextSaturday(75),
      durationDays: 3,
      durationNights: 2,
      status: "open",
      published: true,
      homeFeatured: false,
      order: 4,
      isDemo: true,
      price: fromPrice(40),
      scheduleStatus: "confirmed",
      travelMode: "A_TU_AIRE",
      maxPartySize: 8,
      availablePackageTypes: "TICKET_ONLY,TICKET_HOTEL",
      heroImageKey: "milan",
      description: "Demo A_TU_AIRE — escenario de entrada + hotel, con estancia de 1 o 2 noches.",
      seoTitle: "Milán — Derby della Madonnina | Copa de Ferias",
      seoDescription: "Entrada (y hotel opcional) para el Inter - Milan, a tu aire.",
    },
  });
  const demoBEvent = await prisma.event.create({
    data: {
      tripId: demoB.id,
      competitionId: competitionByName.get("Serie A") ?? null,
      homeTeam: "Inter",
      awayTeam: "Milan",
      stadium: "Stadio San Siro",
      city: "Milán",
      country: "Italia",
      timezone: "Europe/Rome",
      matchDate: demoB.matchDate,
      kickoff: new Date(new Date(demoB.matchDate).setHours(20, 45, 0, 0)),
      scheduleStatus: "confirmed",
      status: "published",
      primaryEvent: true,
      order: 0,
    },
  });
  await prisma.ticketOffer.createMany({
    data: [
      { eventId: demoBEvent.id, provider: "manual", category: "Curva", sector: "Curva Nord", costNet: 40, currency: "EUR", stock: 80, deliveryType: "digital", active: true },
      { eventId: demoBEvent.id, provider: "manual", category: "Tribuna", sector: "Tribuna Est", costNet: 95, currency: "EUR", stock: 25, deliveryType: "digital", active: true },
    ],
  });

  // --- DEMO C — Londres, doble jornada Premier League ------------------
  // TICKET_ONLY + TICKET_HOTEL + TICKET_HOTEL_FLIGHT, two Events under the
  // same product: Arsenal-Tottenham CONFIRMED (Saturday) and Chelsea-
  // Arsenal PROVISIONAL (Sunday, kickoff not yet fixed — realistic Premier
  // League scheduling). Exercises additionalMatchFee, the multi-match
  // flight-window bounds, and provisional-schedule flight blocking.
  await prisma.trip.deleteMany({ where: { slug: "londres-doble-jornada" } });
  const demoCMatch1Date = nextSaturday(90);
  const demoCMatch2Date = addDays(demoCMatch1Date, 1);
  const demoC = await prisma.trip.create({
    data: {
      number: 6,
      slug: "londres-doble-jornada",
      name: "Londres",
      subtitle: "Doble jornada Premier League",
      city: "Londres",
      country: "Reino Unido",
      homeTeam: "Arsenal",
      awayTeam: "Tottenham",
      stadium: "Emirates Stadium",
      matchDate: demoCMatch1Date,
      durationDays: 4,
      durationNights: 3,
      status: "open",
      published: true,
      homeFeatured: false,
      order: 5,
      isDemo: true,
      price: fromPrice(60),
      scheduleStatus: "confirmed",
      travelMode: "A_TU_AIRE",
      maxPartySize: 10,
      availablePackageTypes: "TICKET_ONLY,TICKET_HOTEL,TICKET_HOTEL_FLIGHT",
      heroImageKey: "londres",
      description: "Demo A_TU_AIRE — dos partidos en la misma experiencia, con vuelo y hotel opcionales.",
      seoTitle: "Londres — Doble jornada Premier League | Copa de Ferias",
      seoDescription: "Arsenal - Tottenham y Chelsea - Arsenal en el mismo viaje, a tu aire.",
    },
  });
  const demoCEvent1 = await prisma.event.create({
    data: {
      tripId: demoC.id,
      competitionId: competitionByName.get("Premier League") ?? null,
      homeTeam: "Arsenal",
      awayTeam: "Tottenham",
      stadium: "Emirates Stadium",
      city: "Londres",
      country: "Reino Unido",
      timezone: "Europe/London",
      matchDate: demoCMatch1Date,
      kickoff: new Date(new Date(demoCMatch1Date).setHours(17, 30, 0, 0)),
      scheduleStatus: "confirmed",
      status: "published",
      primaryEvent: true,
      order: 0,
    },
  });
  const demoCEvent2 = await prisma.event.create({
    data: {
      tripId: demoC.id,
      competitionId: competitionByName.get("Premier League") ?? null,
      homeTeam: "Chelsea",
      awayTeam: "Arsenal",
      stadium: "Stamford Bridge",
      city: "Londres",
      country: "Reino Unido",
      timezone: "Europe/London",
      matchDate: demoCMatch2Date,
      kickoff: null, // provisional — Premier League hasn't fixed the exact kickoff yet
      scheduleStatus: "time_provisional",
      status: "published",
      primaryEvent: false,
      order: 1,
    },
  });
  await prisma.ticketOffer.createMany({
    data: [
      { eventId: demoCEvent1.id, provider: "manual", category: "General", sector: "Clock End", costNet: 60, currency: "EUR", stock: 100, deliveryType: "digital", active: true },
      { eventId: demoCEvent1.id, provider: "manual", category: "Members", sector: "Club Level", costNet: 120, currency: "EUR", stock: 20, deliveryType: "digital", active: true },
      { eventId: demoCEvent2.id, provider: "manual", category: "General", sector: "Away end", costNet: 70, currency: "EUR", stock: 50, deliveryType: "digital", active: true },
      { eventId: demoCEvent2.id, provider: "manual", category: "Members", sector: "Away end premium", costNet: 110, currency: "EUR", stock: 15, deliveryType: "digital", active: true },
    ],
  });

  // --- DEMO D — Manchester derby — QA/testing product with a fully
  // CONFIRMED schedule (day AND kickoff both fixed), so the entire
  // checkout — country -> 3 modalities -> travelers -> entradas -> noches
  // -> hotel -> aeropuerto -> preferencias -> vuelo -> revalidación -> pago
  // — can be walked end to end without touching Londres/Admin first. Same
  // architecture as every other A_TU_AIRE product, no special-casing (§28)
  // — its only particularity is deterministic, fully-testable data:
  //   - MAD/BCN/AGP: genuinely round-trip-direct (ida Y vuelta) to
  //     Manchester (MAN) — MAD additionally has NO afternoon return slot,
  //     giving a real "Tarde — No disponible" case on the return leg.
  //   - SVQ: direct Friday outbound but no direct Manchester -> Sevilla
  //     return — excluded entirely, proving round-trip eligibility (§22).
  //   - OVD: no route at all — excluded (§7/§29).
  await prisma.trip.deleteMany({ where: { slug: "manchester-a-tu-aire" } });
  const demoDMatchDate = nextSaturday(95);
  const demoD = await prisma.trip.create({
    data: {
      number: 7,
      slug: "manchester-a-tu-aire",
      name: "Manchester",
      subtitle: "Derbi de Manchester",
      city: "Manchester",
      country: "Inglaterra",
      homeTeam: "Manchester City",
      awayTeam: "Manchester United",
      stadium: "Etihad Stadium",
      matchDate: demoDMatchDate,
      durationDays: 3,
      durationNights: 2,
      status: "open",
      published: true,
      homeFeatured: false,
      order: 6,
      isDemo: true,
      price: fromPrice(55),
      scheduleStatus: "confirmed",
      travelMode: "A_TU_AIRE",
      maxPartySize: 10,
      availablePackageTypes: "TICKET_ONLY,TICKET_HOTEL,TICKET_HOTEL_FLIGHT",
      heroImageKey: "manchester",
      description: "Producto de prueba A_TU_AIRE — horario confirmado, pensado para recorrer todo el checkout de principio a fin.",
      seoTitle: "Manchester — Derbi de Manchester | Copa de Ferias",
      seoDescription: "Manchester City - Manchester United, a tu aire.",
    },
  });
  const demoDEvent = await prisma.event.create({
    data: {
      tripId: demoD.id,
      competitionId: competitionByName.get("Premier League") ?? null,
      homeTeam: "Manchester City",
      awayTeam: "Manchester United",
      stadium: "Etihad Stadium",
      city: "Manchester",
      country: "Inglaterra",
      timezone: "Europe/London",
      matchDate: demoDMatchDate,
      kickoff: new Date(new Date(demoDMatchDate).setHours(17, 30, 0, 0)),
      scheduleStatus: "confirmed",
      status: "published",
      primaryEvent: true,
      order: 0,
    },
  });
  await prisma.ticketOffer.createMany({
    data: [
      { eventId: demoDEvent.id, provider: "manual", category: "General", sector: "Away end", costNet: 55, currency: "EUR", stock: 100, deliveryType: "digital", active: true },
      { eventId: demoDEvent.id, provider: "manual", category: "Members", sector: "Tier 1", costNet: 105, currency: "EUR", stock: 25, deliveryType: "digital", active: true },
    ],
  });

  // -----------------------------------------------------------------
  // Demo leads (notify + waitlist)
  // -----------------------------------------------------------------
  await prisma.lead.deleteMany();
  const futbolIngles = await prisma.trip.findUniqueOrThrow({ where: { slug: "futbol-ingles" } });
  const lisboa = await prisma.trip.findUniqueOrThrow({ where: { slug: "derbi-lisboa" } });

  const demoLeads: Array<{ tripId: string; name: string; email: string; city: string }> = [
    { tripId: futbolIngles.id, name: "Demo Interesado 1", email: "demo1@example.com", city: "Barcelona" },
    { tripId: futbolIngles.id, name: "Demo Interesado 2", email: "demo2@example.com", city: "Madrid" },
    { tripId: futbolIngles.id, name: "Demo Interesado 3", email: "demo3@example.com", city: "Valencia" },
    { tripId: lisboa.id, name: "Demo Interesado 4", email: "demo4@example.com", city: "Barcelona" },
    { tripId: lisboa.id, name: "Demo Interesado 5", email: "demo5@example.com", city: "Sevilla" },
  ];
  for (const l of demoLeads) {
    await prisma.lead.create({
      data: { ...l, type: "notify", consent: true },
    });
  }

  // -----------------------------------------------------------------
  // Demo bookings for Belgrado (seed data, clearly fictitious)
  // -----------------------------------------------------------------
  await prisma.booking.deleteMany({ where: { tripId: belgrado.id } });

  type DemoBooking = {
    buyerFirstName: string;
    buyerLastName: string;
    originCity: string;
    travelers: Array<{ firstName: string; lastName: string; roomPreference: "share_with_group" | "share_same_sex" | "single" }>;
  };

  const demoBookings: DemoBooking[] = [
    {
      buyerFirstName: "Demo",
      buyerLastName: "Viajero Uno",
      originCity: "Barcelona",
      travelers: [
        { firstName: "Demo", lastName: "Viajero Uno", roomPreference: "share_with_group" },
        { firstName: "Demo", lastName: "Acompañante Uno", roomPreference: "share_with_group" },
      ],
    },
    {
      buyerFirstName: "Demo",
      buyerLastName: "Viajero Dos",
      originCity: "Madrid",
      travelers: [{ firstName: "Demo", lastName: "Viajero Dos", roomPreference: "single" }],
    },
    {
      buyerFirstName: "Demo",
      buyerLastName: "Viajero Tres",
      originCity: "Barcelona",
      travelers: [
        { firstName: "Demo", lastName: "Viajero Tres", roomPreference: "share_same_sex" },
        { firstName: "Demo", lastName: "Acompañante Tres A", roomPreference: "share_same_sex" },
        { firstName: "Demo", lastName: "Acompañante Tres B", roomPreference: "share_same_sex" },
      ],
    },
    {
      buyerFirstName: "Demo",
      buyerLastName: "Viajero Cuatro",
      originCity: "Madrid",
      travelers: [
        { firstName: "Demo", lastName: "Viajero Cuatro", roomPreference: "share_with_group" },
        { firstName: "Demo", lastName: "Acompañante Cuatro", roomPreference: "share_with_group" },
        { firstName: "Demo", lastName: "Acompañante Cuatro B", roomPreference: "share_with_group" },
        { firstName: "Demo", lastName: "Acompañante Cuatro C", roomPreference: "share_with_group" },
        { firstName: "Demo", lastName: "Acompañante Cuatro D", roomPreference: "share_with_group" },
        { firstName: "Demo", lastName: "Acompañante Cuatro E", roomPreference: "share_with_group" },
      ],
    },
  ];

  let totalSold = 0;
  for (const b of demoBookings) {
    const singleRooms = b.travelers.filter((t) => t.roomPreference === "single").length;
    const total = b.travelers.length * belgrado.price + singleRooms * belgrado.singleSupplement;
    const booking = await prisma.booking.create({
      data: {
        reference: reference(),
        tripId: belgrado.id,
        buyerFirstName: b.buyerFirstName,
        buyerLastName: b.buyerLastName,
        buyerEmail: `${b.buyerFirstName.toLowerCase()}.${b.buyerLastName.toLowerCase().replace(/\s+/g, "")}@example.com`,
        buyerPhone: "+34600000000",
        originCity: b.originCity,
        travelersCount: b.travelers.length,
        singleRooms,
        totalPrice: total,
        currency: "EUR",
        paymentProvider: "demo",
        paymentStatus: "paid",
        bookingStatus: "confirmed",
        accessToken: token(),
        hasReceivedPassport: false,
        passportStatus: "pending",
      },
    });
    for (const t of b.travelers) {
      await prisma.traveler.create({
        data: {
          bookingId: booking.id,
          firstName: t.firstName,
          lastName: t.lastName,
          originCity: b.originCity,
          roomPreference: t.roomPreference,
        },
      });
    }
    totalSold += b.travelers.length;
  }

  await prisma.trip.update({ where: { id: belgrado.id }, data: { soldSpots: totalSold } });

  // -----------------------------------------------------------------
  // Email templates
  // -----------------------------------------------------------------
  await prisma.emailTemplate.deleteMany();
  const templates = [
    {
      key: "notify_confirmation",
      name: "Confirmación de Avísame",
      description: "Se envía al dejar el email en el formulario \"Avísame\" de un viaje próximamente. Desactivado por defecto.",
      subject: "Te avisaremos sobre {{tripName}}",
      body:
        "Hola {{firstName}},\n\nApuntado. En cuanto abramos plazas para {{tripName}} serás de los primeros en saberlo.\n\nUn abrazo futbolero,\nCopa de Ferias",
      active: false,
      timingReference: "immediate",
      timingDaysOffset: null,
    },
    {
      key: "booking_confirmed",
      name: "1. Reserva confirmada",
      description: "Se envía justo después de completar el pago.",
      subject: "Tu plaza en {{tripName}} está confirmada — {{tripNumber}}",
      body:
        "Hola {{firstName}},\n\nYa estás dentro. Tu reserva para {{tripName}} ({{tripNumber}}) está confirmada.\n\nSalida desde {{departureCity}}: {{departureDate}}\nRegreso: {{returnDate}}\n\nEn los próximos días te iremos pidiendo algunos datos y compartiendo la información práctica. De momento, solo queda una cosa: contar los días.\n\nCopa de Ferias — Fútbol que merece el viaje.",
      active: true,
      timingReference: "immediate",
      timingDaysOffset: null,
    },
    {
      key: "welcome",
      name: "2. Bienvenida (+1 día)",
      description: "Un día después de la compra: qué ocurre a partir de ahora.",
      subject: "Bienvenido a Copa de Ferias",
      body:
        "Hola {{firstName}},\n\nBienvenido a Copa de Ferias. A partir de ahora iremos completando entre todos el viaje a {{tripName}}: primero algunos datos tuyos, después el grupo de WhatsApp, y por último toda la información práctica antes de salir.\n\nPuedes ver el estado de tu reserva en cualquier momento en tu área \"Mi Viaje\".\n\nUn abrazo,\nCopa de Ferias",
      active: true,
      timingReference: "booking_plus_1",
      timingDaysOffset: 1,
    },
    {
      key: "pending_data",
      name: "3. Datos pendientes",
      description: "Recordatorio cuando falten datos de algún viajero.",
      subject: "Nos faltan algunos datos para {{tripName}}",
      body:
        "Hola {{firstName}},\n\nPara dejar cerrado el viaje a {{tripName}} nos faltan algunos datos de uno o varios viajeros. Puedes completarlos desde tu área \"Mi Viaje\" cuando tengas un momento.\n\nCopa de Ferias",
      active: true,
      timingReference: "immediate",
      timingDaysOffset: null,
    },
    {
      key: "reminder_30_days",
      name: "4. 30 días antes",
      description: "Documentación y requisitos del viaje.",
      subject: "Faltan 30 días para {{tripName}}",
      body:
        "Hola {{firstName}},\n\nEn un mes viajas a {{tripName}}. Es un buen momento para revisar la documentación y los requisitos del viaje desde tu área \"Mi Viaje\".\n\nCopa de Ferias",
      active: true,
      timingReference: "before_departure",
      timingDaysOffset: 30,
    },
    {
      key: "reminder_21_days",
      name: "5. 21 días antes",
      description: "Información práctica del viaje.",
      subject: "21 días para {{tripName}}: información práctica",
      body:
        "Hola {{firstName}},\n\nQueda poco. Te dejamos por aquí la información práctica de {{tripName}}: alojamiento, punto de encuentro y lo que necesitas saber antes de salir. Todo disponible en \"Mi Viaje\".\n\nCopa de Ferias",
      active: true,
      timingReference: "before_departure",
      timingDaysOffset: 21,
    },
    {
      key: "whatsapp_15_days",
      name: "6. Grupo de WhatsApp (15 días antes)",
      description: "Se activa el enlace al grupo de WhatsApp del viaje.",
      subject: "Únete al grupo de {{tripName}}",
      body:
        "Hola {{firstName}},\n\nYa puedes unirte al grupo de WhatsApp de {{tripName}} para conocer al resto del grupo antes de viajar:\n\n{{whatsappUrl}}\n\nCopa de Ferias",
      active: true,
      timingReference: "before_departure",
      timingDaysOffset: 15,
    },
    {
      key: "planning_7_days",
      name: "7. Planning definitivo (7 días antes)",
      description: "Planning definitivo y checklist final.",
      subject: "Planning definitivo de {{tripName}}",
      body:
        "Hola {{firstName}},\n\nQueda una semana. Aquí tienes el planning definitivo de {{tripName}} y la checklist de qué llevar, disponibles en \"Mi Viaje\".\n\nCopa de Ferias",
      active: true,
      timingReference: "before_departure",
      timingDaysOffset: 7,
    },
    {
      key: "final_48h",
      name: "8. Últimos detalles (48h antes)",
      description: "Punto de encuentro y últimos detalles.",
      subject: "Últimos detalles antes de {{tripName}}",
      body:
        "Hola {{firstName}},\n\nCasi. Punto de encuentro, hora y últimos detalles de {{tripName}} en \"Mi Viaje\". Nos vemos allí.\n\nCopa de Ferias",
      active: true,
      timingReference: "before_departure",
      timingDaysOffset: 2,
    },
    {
      key: "thanks_after_return",
      name: "9. Gracias (+1 día tras el regreso)",
      description: "Mensaje de agradecimiento y recuerdo del viaje.",
      subject: "Gracias por venir a {{tripName}}",
      body:
        "Hola {{firstName}},\n\nGracias por haber venido. Esperamos que {{tripName}} haya sido de esos viajes que se recuerdan. Nos encantaría verte en el próximo.\n\nCopa de Ferias",
      active: true,
      timingReference: "after_return",
      timingDaysOffset: 1,
    },
    {
      key: "review_request",
      name: "10. Solicitud de reseña (+3-5 días)",
      description: "Petición de reseña tras el viaje.",
      subject: "¿Nos cuentas qué tal {{tripName}}?",
      body:
        "Hola {{firstName}},\n\nSi tienes un minuto, nos ayudaría mucho que nos dejaras tu opinión sobre {{tripName}}. Gracias por confiar en nosotros.\n\nCopa de Ferias",
      active: true,
      timingReference: "after_return",
      timingDaysOffset: 4,
    },
    {
      key: "future_trips",
      name: "11. Futuros viajes",
      description: "Solo se envía si existe consentimiento comercial explícito.",
      subject: "El próximo viaje ya está en marcha",
      body:
        "Hola {{firstName}},\n\nEstamos preparando el próximo viaje. Si quieres ser de los primeros en enterarte, échale un ojo a copadeferias.com.\n\nCopa de Ferias",
      active: false,
      timingReference: "immediate",
      timingDaysOffset: null,
    },
  ] as const;

  for (const t of templates) {
    await prisma.emailTemplate.create({ data: t });
  }

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
