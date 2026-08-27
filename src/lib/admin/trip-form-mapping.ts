import type { TripFormInput } from "@/server/actions/admin-trips";

export const BLANK_TRIP_FORM: TripFormInput = {
  number: 0,
  slug: "",
  name: "",
  subtitle: "",
  city: "",
  country: "",
  homeTeam: "",
  awayTeam: "",
  stadium: "",
  matchDate: new Date().toISOString(),
  durationDays: 3,
  durationNights: 2,
  status: "draft",
  published: false,
  homeFeatured: false,
  order: 0,
  isDemo: true,
  price: 0,
  currency: "EUR",
  maxSpots: 20,
  minSpots: 8,
  minDeadlineDate: "",
  singleSupplement: 0,
  requiredTravelerFields: "nationality,docType,docNumber,docExpiry,docCountry",
  scheduleStatus: "provisional",
  heroImageKey: "default",
  description: "",
  whyWeGo: "",
  localCulture: "",
  departureText: "",
  returnText: "",
  hotelStars: 3,
  hotelZone: "",
  hotelCentric: true,
  hotelDescription: "",
  ticketCategory: "",
  ticketSector: "",
  ticketSeating: "",
  insuranceDescription: "",
  coordinatorName: "",
  hostName: "",
  cancellationPolicy: "",
  importantConditions: "",
  whatsappUrl: "",
  whatsappAvailableAt: "",
  seoTitle: "",
  seoDescription: "",
  origins: [],
  planningDays: [],
  activities: [],
  inclusions: [],
  requirements: [],
  faqs: [],
};

type TripWithRelations = {
  id: string;
  number: number;
  slug: string;
  name: string;
  subtitle: string;
  city: string;
  country: string;
  homeTeam: string;
  awayTeam: string;
  stadium: string;
  matchDate: Date;
  durationDays: number;
  durationNights: number;
  status: TripFormInput["status"];
  published: boolean;
  homeFeatured: boolean;
  order: number;
  isDemo: boolean;
  price: number;
  currency: string;
  maxSpots: number;
  minSpots: number;
  minDeadlineDate: Date | null;
  singleSupplement: number;
  requiredTravelerFields: string;
  scheduleStatus: TripFormInput["scheduleStatus"];
  heroImageKey: string;
  description: string;
  whyWeGo: string;
  localCulture: string;
  departureText: string;
  returnText: string;
  hotelStars: number;
  hotelZone: string;
  hotelCentric: boolean;
  hotelDescription: string;
  ticketCategory: string;
  ticketSector: string;
  ticketSeating: string;
  insuranceDescription: string;
  coordinatorName: string;
  hostName: string;
  cancellationPolicy: string;
  importantConditions: string;
  whatsappUrl: string;
  whatsappAvailableAt: Date | null;
  seoTitle: string;
  seoDescription: string;
  origins: { city: string }[];
  planningDays: { title: string; description: string; icon: string }[];
  activities: { title: string; description: string }[];
  inclusions: { text: string; included: boolean }[];
  requirements: { text: string }[];
  faqs: { question: string; answer: string }[];
};

export function tripToFormInput(trip: TripWithRelations): TripFormInput {
  return {
    id: trip.id,
    number: trip.number,
    slug: trip.slug,
    name: trip.name,
    subtitle: trip.subtitle,
    city: trip.city,
    country: trip.country,
    homeTeam: trip.homeTeam,
    awayTeam: trip.awayTeam,
    stadium: trip.stadium,
    matchDate: trip.matchDate.toISOString(),
    durationDays: trip.durationDays,
    durationNights: trip.durationNights,
    status: trip.status,
    published: trip.published,
    homeFeatured: trip.homeFeatured,
    order: trip.order,
    isDemo: trip.isDemo,
    price: trip.price,
    currency: trip.currency,
    maxSpots: trip.maxSpots,
    minSpots: trip.minSpots,
    minDeadlineDate: trip.minDeadlineDate ? trip.minDeadlineDate.toISOString() : "",
    singleSupplement: trip.singleSupplement,
    requiredTravelerFields: trip.requiredTravelerFields,
    scheduleStatus: trip.scheduleStatus,
    heroImageKey: trip.heroImageKey,
    description: trip.description,
    whyWeGo: trip.whyWeGo,
    localCulture: trip.localCulture,
    departureText: trip.departureText,
    returnText: trip.returnText,
    hotelStars: trip.hotelStars,
    hotelZone: trip.hotelZone,
    hotelCentric: trip.hotelCentric,
    hotelDescription: trip.hotelDescription,
    ticketCategory: trip.ticketCategory,
    ticketSector: trip.ticketSector,
    ticketSeating: trip.ticketSeating,
    insuranceDescription: trip.insuranceDescription,
    coordinatorName: trip.coordinatorName,
    hostName: trip.hostName,
    cancellationPolicy: trip.cancellationPolicy,
    importantConditions: trip.importantConditions,
    whatsappUrl: trip.whatsappUrl,
    whatsappAvailableAt: trip.whatsappAvailableAt ? trip.whatsappAvailableAt.toISOString() : "",
    seoTitle: trip.seoTitle,
    seoDescription: trip.seoDescription,
    origins: trip.origins.map((o) => o.city),
    planningDays: trip.planningDays.map((d) => ({ title: d.title, description: d.description, icon: d.icon })),
    activities: trip.activities.map((a) => ({ title: a.title, description: a.description })),
    inclusions: trip.inclusions.map((i) => ({ text: i.text, included: i.included })),
    requirements: trip.requirements.map((r) => r.text),
    faqs: trip.faqs.map((f) => ({ question: f.question, answer: f.answer })),
  };
}
