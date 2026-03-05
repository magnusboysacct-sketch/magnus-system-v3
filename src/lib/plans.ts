export type Plan = "free" | "pro" | "team";

export interface PlanFeatures {
  name: string;
  price: string;
  takeoffExport: boolean;
  boqTakeoffLinking: boolean;
  maxTakeoffGroups: number | null;
  maxUsers: number | null;
  advancedReports: boolean;
  prioritySupport: boolean;
}

export const PLAN_FEATURES: Record<Plan, PlanFeatures> = {
  free: {
    name: "Free",
    price: "$0/month",
    takeoffExport: false,
    boqTakeoffLinking: false,
    maxTakeoffGroups: 2,
    maxUsers: 1,
    advancedReports: false,
    prioritySupport: false,
  },
  pro: {
    name: "Pro",
    price: "$49/month",
    takeoffExport: true,
    boqTakeoffLinking: true,
    maxTakeoffGroups: null,
    maxUsers: 5,
    advancedReports: true,
    prioritySupport: false,
  },
  team: {
    name: "Team",
    price: "$99/month",
    takeoffExport: true,
    boqTakeoffLinking: true,
    maxTakeoffGroups: null,
    maxUsers: null,
    advancedReports: true,
    prioritySupport: true,
  },
};

export function canAccessFeature(plan: Plan, feature: keyof PlanFeatures): boolean {
  const planFeatures = PLAN_FEATURES[plan];
  const value = planFeatures[feature];

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number" || value === null) {
    return value !== 0;
  }

  return true;
}
