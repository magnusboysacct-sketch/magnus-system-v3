import { useEffect, useState } from "react";
import type { Plan } from "../lib/plans";
import { PLAN_FEATURES, canAccessFeature } from "../lib/plans";

export function usePlan() {
  const [plan, setPlanState] = useState<Plan>(() => {
    const saved = localStorage.getItem("plan");
    if (saved === "free" || saved === "pro" || saved === "team") {
      return saved;
    }
    return "free";
  });

  useEffect(() => {
    localStorage.setItem("plan", plan);
  }, [plan]);

  const setPlan = (newPlan: Plan) => {
    setPlanState(newPlan);
  };

  const hasFeature = (feature: keyof typeof PLAN_FEATURES.free) => {
    return canAccessFeature(plan, feature);
  };

  const features = PLAN_FEATURES[plan];

  return { plan, setPlan, hasFeature, features };
}
