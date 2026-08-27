/**
 * Copa de Ferias — demo seed data.
 *
 * Everything created here is clearly internal demo content: fake buyer
 * names, no real emails, no invented licences/testimonials. Run with
 * `npm run db:seed` (also runs automatically after `prisma migrate reset`).
 */
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";

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
  // Global FAQ
  // -----------------------------------------------------------------
  await prisma.faq.deleteMany();
  const faqs: Array<[string, string]> = [
    [
      "¿Puedo viajar solo?",
      "Sí. Puedes apuntarte por tu cuenta, venir en pareja o reservar varias plazas con amigos. Al llegar formaréis parte del mismo grupo.",
    ],
    [
      "¿Puedo ir con amigos?",
      "Claro. Puedes venir con un amigo, tu pareja o un grupo. En la reserva indicas cuántos viajeros sois.",
    ],
    [
      "¿Qué edad necesito para viajar?",
      "La edad mínima para reservar y viajar es 18 años.",
    ],
    [
      "¿Qué pasa si cambia el horario o el partido?",
      "Si hay un cambio de horario dentro de las mismas fechas, actualizamos el planning y te avisamos. Si el cambio es importante (fecha, estadio, condiciones del viaje), te lo comunicamos con las opciones disponibles antes de tomar ninguna decisión por ti.",
    ],
    [
      "¿Qué ocurre si no se alcanza el mínimo de viajeros?",
      "Cada viaje tiene un número mínimo de participantes para operar. Si no se alcanza antes de la fecha límite, cancelamos el viaje y se reembolsa el importe íntegro.",
    ],
    [
      "¿Qué documentación necesito?",
      "Depende del destino. Te lo indicamos con tiempo suficiente y lo vas completando desde tu área \"Mi Viaje\" después de reservar.",
    ],
    [
      "¿Puedo elegir habitación individual?",
      "Sí, con un suplemento que se muestra en cada ficha antes de reservar.",
    ],
    [
      "¿Con quién comparto habitación si no voy con nadie?",
      "Por defecto la habitación doble es compartida. Si vienes solo, te asignamos con otro participante de tu mismo sexo, salvo que prefieras pagar el suplemento de individual.",
    ],
    [
      "¿Puedo salir desde otra ciudad distinta a las ofertadas?",
      "Cada viaje tiene unas ciudades de salida configuradas según viabilidad de vuelos. Si tu ciudad no aparece, escríbenos y lo valoramos para próximos viajes.",
    ],
    [
      "¿Puedo incorporarme directamente en destino sin salir desde España?",
      "De momento no. En esta primera versión los viajes salen desde los orígenes que aparecen en cada ficha.",
    ],
    [
      "¿Las entradas están incluidas?",
      "Sí, siempre. La entrada al partido está incluida en todos nuestros viajes.",
    ],
    [
      "¿Dónde nos sentamos en el estadio?",
      "El sector y la disposición dependen de cada partido y se detallan en la ficha del viaje. Cuando es posible, el grupo se sienta junto.",
    ],
    [
      "¿El viaje incluye seguro?",
      "Sí, incluye un seguro de asistencia en viaje. Las condiciones concretas se detallan en cada ficha.",
    ],
    [
      "¿Qué pasa si pierdo mi vuelo?",
      "Contacta con el coordinador del grupo en cuanto lo sepas. Te ayudamos a reorganizarte, aunque los gastos de un nuevo billete corren por tu cuenta salvo que el retraso sea nuestra responsabilidad.",
    ],
    [
      "¿Puedo cancelar mi reserva?",
      "Sí, puedes solicitar la cancelación desde \"Mi Viaje\". Las condiciones (plazos, importes reembolsables) se detallan en la política de cada viaje antes de reservar.",
    ],
    [
      "¿Puedo cambiar el nombre de un viajero ya confirmado?",
      "Una vez confirmada la reserva no se puede editar libremente. Puedes solicitar un cambio de viajero desde \"Mi Viaje\" y lo revisamos caso por caso.",
    ],
    [
      "¿Cómo funcionan los pagos?",
      "El viaje se paga íntegro en el momento de reservar. Aceptamos tarjeta, wallets, Bizum y Klarna a través de Stripe, y PayPal (incluyendo Pay Later cuando esté disponible para tu cuenta).",
    ],
    [
      "¿Quién acompaña al grupo?",
      "Cada viaje tiene un coordinador responsable del grupo y, en destino, un host local que conoce bien la ciudad y el club.",
    ],
    [
      "¿Qué comidas están incluidas?",
      "Ninguna salvo que se indique expresamente en la ficha del viaje. El alojamiento sí está incluido.",
    ],
    [
      "¿Hay grupo de WhatsApp?",
      "Sí, se activa aproximadamente 15 días antes de cada viaje para que el grupo empiece a conocerse antes de viajar.",
    ],
  ];
  for (let i = 0; i < faqs.length; i++) {
    await prisma.faq.create({
      data: { question: faqs[i][0], answer: faqs[i][1], order: i, active: true },
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
  await prisma.trip.create({
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
      scheduleStatus: "provisional",
      heroImageKey: "futbol-ingles",
      description: "Todavía en preparación. Déjanos tu email y te avisamos en cuanto abramos plazas.",
      seoTitle: "Fútbol Inglés | Copa de Ferias",
      seoDescription: "Próximo viaje de Copa de Ferias: 3 partidos de fútbol inglés en 3 días.",
    },
  });

  // -----------------------------------------------------------------
  // Trip #003 — Lisboa, Derbi de Lisboa (UPCOMING, no public page yet)
  // -----------------------------------------------------------------
  await prisma.trip.deleteMany({ where: { slug: "derbi-lisboa" } });
  await prisma.trip.create({
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
      scheduleStatus: "provisional",
      heroImageKey: "lisboa",
      description: "Todavía en preparación. Déjanos tu email y te avisamos en cuanto abramos plazas.",
      seoTitle: "Lisboa — Derbi de Lisboa | Copa de Ferias",
      seoDescription: "Próximo viaje de Copa de Ferias: el derbi de Lisboa entre Sporting y Benfica.",
    },
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
