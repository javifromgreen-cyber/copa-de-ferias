import type { PackageType } from "@prisma/client";

export type FeeTier = { minParty: number; maxParty: number; feePerTraveler: number };

export type OrganizationFeeGlobalConfig = {
  feeTicketOnly: number;
  feeHotelTiers: string; // JSON FeeTier[]
  feeHotelFlightTiers: string; // JSON FeeTier[]
  additionalMatchFee: number;
};

export type OrganizationFeeTripOverrides = {
  orgFeeTicketOnlyOverride: number | null;
  orgFeeHotelTiersOverride: string; // JSON FeeTier[] or ""
  orgFeeHotelFlightTiersOverride: string; // JSON FeeTier[] or ""
  additionalMatchFeeOverride: number | null;
};

export type OrganizationFeeBreakdown = {
  feePerTraveler: number;
  baseFeeTotal: number;
  additionalMatchFeePerTraveler: number;
  additionalMatchFeeTotal: number;
  total: number;
};

function parseTiers(json: string): FeeTier[] {
  if (!json.trim()) return [];
  const parsed = JSON.parse(json) as FeeTier[];
  return parsed;
}

function resolveTierFee(tiers: FeeTier[], partySize: number): number {
  const tier = tiers.find((t) => partySize >= t.minParty && partySize <= t.maxParty);
  if (!tier) {
    throw new Error(`No fee tier configured for party size ${partySize}`);
  }
  return tier.feePerTraveler;
}

/**
 * Computes the organization fee (our margin, never shown to the customer —
 * only the resulting commercial total is) for one booking, per §71-74/§163-166.
 * A trip-level override always wins over the global default (§88/§167).
 * `matchCount` is the number of Events (matches) the ticket(s) cover; every
 * match beyond the first adds `additionalMatchFee` per traveler (§74/§166).
 */
export function computeOrganizationFee(opts: {
  packageType: PackageType;
  partySize: number;
  matchCount: number;
  global: OrganizationFeeGlobalConfig;
  overrides: OrganizationFeeTripOverrides;
}): OrganizationFeeBreakdown {
  const { packageType, partySize, matchCount, global, overrides } = opts;

  let feePerTraveler: number;
  if (packageType === "TICKET_ONLY") {
    feePerTraveler = overrides.orgFeeTicketOnlyOverride ?? global.feeTicketOnly;
  } else if (packageType === "TICKET_HOTEL") {
    const tiers = overrides.orgFeeHotelTiersOverride.trim() ? parseTiers(overrides.orgFeeHotelTiersOverride) : parseTiers(global.feeHotelTiers);
    feePerTraveler = resolveTierFee(tiers, partySize);
  } else {
    const tiers = overrides.orgFeeHotelFlightTiersOverride.trim() ? parseTiers(overrides.orgFeeHotelFlightTiersOverride) : parseTiers(global.feeHotelFlightTiers);
    feePerTraveler = resolveTierFee(tiers, partySize);
  }

  const baseFeeTotal = feePerTraveler * partySize;

  const additionalMatchFeePerTraveler = overrides.additionalMatchFeeOverride ?? global.additionalMatchFee;
  const additionalMatchCount = Math.max(0, matchCount - 1);
  const additionalMatchFeeTotal = additionalMatchFeePerTraveler * partySize * additionalMatchCount;

  return {
    feePerTraveler,
    baseFeeTotal,
    additionalMatchFeePerTraveler,
    additionalMatchFeeTotal,
    total: baseFeeTotal + additionalMatchFeeTotal,
  };
}

export const NO_OVERRIDES: OrganizationFeeTripOverrides = {
  orgFeeTicketOnlyOverride: null,
  orgFeeHotelTiersOverride: "",
  orgFeeHotelFlightTiersOverride: "",
  additionalMatchFeeOverride: null,
};
