"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import type { TripStatus, ScheduleStatus } from "@prisma/client";

export type TripFormInput = {
  id?: string;
  number: number;
  slug: string;
  name: string;
  subtitle: string;
  city: string;
  country: string;
  homeTeam: string;
  awayTeam: string;
  stadium: string;
  matchDate: string;
  durationDays: number;
  durationNights: number;
  status: TripStatus;
  published: boolean;
  homeFeatured: boolean;
  order: number;
  isDemo: boolean;
  price: number;
  currency: string;
  maxSpots: number;
  minSpots: number;
  minDeadlineDate: string;
  singleSupplement: number;
  requiredTravelerFields: string;
  scheduleStatus: ScheduleStatus;
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
  whatsappAvailableAt: string;
  seoTitle: string;
  seoDescription: string;
  origins: string[];
  planningDays: { title: string; description: string; icon: string }[];
  activities: { title: string; description: string }[];
  inclusions: { text: string; included: boolean }[];
  requirements: string[];
  faqs: { question: string; answer: string }[];
};

function baseData(input: TripFormInput) {
  return {
    number: input.number,
    slug: input.slug,
    name: input.name,
    subtitle: input.subtitle,
    city: input.city,
    country: input.country,
    homeTeam: input.homeTeam,
    awayTeam: input.awayTeam,
    stadium: input.stadium,
    matchDate: new Date(input.matchDate),
    durationDays: input.durationDays,
    durationNights: input.durationNights,
    status: input.status,
    published: input.published,
    homeFeatured: input.homeFeatured,
    order: input.order,
    isDemo: input.isDemo,
    price: input.price,
    currency: input.currency,
    maxSpots: input.maxSpots,
    minSpots: input.minSpots,
    minDeadlineDate: input.minDeadlineDate ? new Date(input.minDeadlineDate) : null,
    singleSupplement: input.singleSupplement,
    requiredTravelerFields: input.requiredTravelerFields,
    scheduleStatus: input.scheduleStatus,
    heroImageKey: input.heroImageKey,
    description: input.description,
    whyWeGo: input.whyWeGo,
    localCulture: input.localCulture,
    departureText: input.departureText,
    returnText: input.returnText,
    hotelStars: input.hotelStars,
    hotelZone: input.hotelZone,
    hotelCentric: input.hotelCentric,
    hotelDescription: input.hotelDescription,
    ticketCategory: input.ticketCategory,
    ticketSector: input.ticketSector,
    ticketSeating: input.ticketSeating,
    insuranceDescription: input.insuranceDescription,
    coordinatorName: input.coordinatorName,
    hostName: input.hostName,
    cancellationPolicy: input.cancellationPolicy,
    importantConditions: input.importantConditions,
    whatsappUrl: input.whatsappUrl,
    whatsappAvailableAt: input.whatsappAvailableAt ? new Date(input.whatsappAvailableAt) : null,
    seoTitle: input.seoTitle,
    seoDescription: input.seoDescription,
  };
}

export async function saveTrip(input: TripFormInput): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!input.slug.trim() || !input.name.trim()) {
    return { ok: false, error: "Nombre y slug son obligatorios" };
  }

  try {
    const tripId = await prisma.$transaction(async (tx) => {
      const trip = input.id
        ? await tx.trip.update({ where: { id: input.id }, data: baseData(input) })
        : await tx.trip.create({ data: { ...baseData(input), soldSpots: 0 } });

      await Promise.all([
        tx.tripOrigin.deleteMany({ where: { tripId: trip.id } }),
        tx.tripPlanningDay.deleteMany({ where: { tripId: trip.id } }),
        tx.tripActivity.deleteMany({ where: { tripId: trip.id } }),
        tx.tripInclusion.deleteMany({ where: { tripId: trip.id } }),
        tx.tripRequirement.deleteMany({ where: { tripId: trip.id } }),
        tx.tripFaq.deleteMany({ where: { tripId: trip.id } }),
      ]);

      await Promise.all([
        tx.tripOrigin.createMany({
          data: input.origins.filter(Boolean).map((city, i) => ({ tripId: trip.id, city, order: i })),
        }),
        tx.tripPlanningDay.createMany({
          data: input.planningDays
            .filter((d) => d.title.trim())
            .map((d, i) => ({ tripId: trip.id, title: d.title, description: d.description, icon: d.icon, order: i })),
        }),
        tx.tripActivity.createMany({
          data: input.activities
            .filter((a) => a.title.trim())
            .map((a, i) => ({ tripId: trip.id, title: a.title, description: a.description, order: i })),
        }),
        tx.tripInclusion.createMany({
          data: input.inclusions
            .filter((inc) => inc.text.trim())
            .map((inc, i) => ({ tripId: trip.id, text: inc.text, included: inc.included, order: i })),
        }),
        tx.tripRequirement.createMany({
          data: input.requirements.filter(Boolean).map((text, i) => ({ tripId: trip.id, text, order: i })),
        }),
        tx.tripFaq.createMany({
          data: input.faqs
            .filter((f) => f.question.trim())
            .map((f, i) => ({ tripId: trip.id, question: f.question, answer: f.answer, order: i })),
        }),
      ]);

      return trip.id;
    });

    revalidatePath("/admin/viajes");
    revalidatePath("/viajes");
    revalidatePath("/");
    return { ok: true, id: tripId };
  } catch (err) {
    if (err instanceof Error && err.message.includes("Unique constraint")) {
      return { ok: false, error: "Ya existe un viaje con ese número o slug" };
    }
    throw err;
  }
}

export async function duplicateTrip(id: string) {
  const trip = await prisma.trip.findUniqueOrThrow({
    where: { id },
    include: { origins: true, planningDays: true, activities: true, inclusions: true, requirements: true, faqs: true },
  });
  const maxNumber = await prisma.trip.aggregate({ _max: { number: true } });

  const copy = await prisma.trip.create({
    data: {
      ...{
        name: trip.name,
        subtitle: trip.subtitle,
        city: trip.city,
        country: trip.country,
        homeTeam: trip.homeTeam,
        awayTeam: trip.awayTeam,
        stadium: trip.stadium,
        matchDate: trip.matchDate,
        durationDays: trip.durationDays,
        durationNights: trip.durationNights,
        price: trip.price,
        currency: trip.currency,
        maxSpots: trip.maxSpots,
        minSpots: trip.minSpots,
        minDeadlineDate: trip.minDeadlineDate,
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
        seoTitle: trip.seoTitle,
        seoDescription: trip.seoDescription,
        isDemo: trip.isDemo,
      },
      number: (maxNumber._max.number ?? 0) + 1,
      slug: `${trip.slug}-copia-${Date.now().toString(36)}`,
      status: "draft",
      published: false,
      homeFeatured: false,
      soldSpots: 0,
      order: trip.order,
      origins: { create: trip.origins.map((o) => ({ city: o.city, order: o.order })) },
      planningDays: { create: trip.planningDays.map((d) => ({ title: d.title, description: d.description, icon: d.icon, order: d.order })) },
      activities: { create: trip.activities.map((a) => ({ title: a.title, description: a.description, order: a.order })) },
      inclusions: { create: trip.inclusions.map((i) => ({ text: i.text, included: i.included, order: i.order })) },
      requirements: { create: trip.requirements.map((r) => ({ text: r.text, order: r.order })) },
      faqs: { create: trip.faqs.map((f) => ({ question: f.question, answer: f.answer, order: f.order })) },
    },
  });

  revalidatePath("/admin/viajes");
  redirect(`/admin/viajes/${copy.id}`);
}

export async function archiveTrip(id: string) {
  await prisma.trip.update({ where: { id }, data: { status: "archived", published: false } });
  revalidatePath("/admin/viajes");
  revalidatePath("/viajes");
  revalidatePath("/");
}
