import React from "react";
import { Check, X } from "lucide-react";
import { usePlan } from "../hooks/usePlan";
import type { Plan } from "../lib/plans";
import { PLAN_FEATURES } from "../lib/plans";
import { useFinanceAccess } from "../hooks/useFinanceAccess";
import { FinanceAccessDenied } from "../components/FinanceAccessDenied";

export default function BillingPage() {
  const { plan, setPlan } = usePlan();
  const financeAccess = useFinanceAccess();

  if (financeAccess.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-slate-600">Loading...</div>
      </div>
    );
  }

  if (!financeAccess.canViewBilling) {
    return <FinanceAccessDenied />;
  }

  const features = [
    { key: "takeoffExport", label: "Export Takeoff to CSV" },
    { key: "boqTakeoffLinking", label: "BOQ ↔ Takeoff Linking" },
    { key: "maxTakeoffGroups", label: "Takeoff Groups", getValue: (p: Plan) => PLAN_FEATURES[p].maxTakeoffGroups === null ? "Unlimited" : PLAN_FEATURES[p].maxTakeoffGroups },
    { key: "maxUsers", label: "Team Users", getValue: (p: Plan) => PLAN_FEATURES[p].maxUsers === null ? "Unlimited" : PLAN_FEATURES[p].maxUsers },
    { key: "advancedReports", label: "Advanced Reports" },
    { key: "prioritySupport", label: "Priority Support" },
  ];

  const plans: Plan[] = ["free", "pro", "team"];

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-2">Billing & Plans</h1>
        <p className="text-slate-600 dark:text-slate-400">Choose the plan that fits your needs</p>
      </div>

      <div className="mb-8 p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
        <p className="text-sm text-blue-900 dark:text-blue-100">
          <strong>Current Plan:</strong> {PLAN_FEATURES[plan].name} ({PLAN_FEATURES[plan].price})
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {plans.map((p) => {
          const planInfo = PLAN_FEATURES[p];
          const isCurrent = plan === p;

          return (
            <div
              key={p}
              className={`
                relative rounded-lg border-2 p-6 transition-all
                ${isCurrent
                  ? "border-blue-500 dark:border-blue-400 bg-blue-50/50 dark:bg-blue-950/20"
                  : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                }
              `}
            >
              {isCurrent && (
                <div className="absolute top-4 right-4 bg-blue-500 text-white text-xs px-2 py-1 rounded-full font-semibold">
                  Current
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">
                  {planInfo.name}
                </h3>
                <div className="text-3xl font-bold text-slate-900 dark:text-slate-100">
                  {planInfo.price.split("/")[0]}
                  <span className="text-sm font-normal text-slate-500 dark:text-slate-400">
                    /{planInfo.price.split("/")[1]}
                  </span>
                </div>
              </div>

              <ul className="space-y-3 mb-6">
                {features.map((feature) => {
                  const featureKey = feature.key as keyof typeof planInfo;
                  let value = planInfo[featureKey];
                  let display: React.ReactNode;

                  if (feature.getValue) {
                    display = feature.getValue(p);
                  } else if (typeof value === "boolean") {
                    display = value ? <Check size={16} className="text-green-600 dark:text-green-400" /> : <X size={16} className="text-slate-300 dark:text-slate-600" />;
                  } else if (typeof value === "number") {
                    display = value;
                  } else if (value === null) {
                    display = "Unlimited";
                  } else {
                    display = String(value);
                  }

                  return (
                    <li key={feature.key} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                      {typeof display === "object" && display !== null ? (
                        <>
                          {display}
                          <span>{feature.label}</span>
                        </>
                      ) : (
                        <>
                          <span className="font-semibold">{display}</span>
                          <span>{feature.label}</span>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>

              <button
                onClick={() => setPlan(p)}
                disabled={isCurrent}
                className={`
                  w-full py-2 px-4 rounded-lg font-semibold transition-all
                  ${isCurrent
                    ? "bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed"
                    : "bg-blue-600 hover:bg-blue-700 text-white"
                  }
                `}
              >
                {isCurrent ? "Current Plan" : `Switch to ${planInfo.name}`}
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-8 p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          <strong>Note:</strong> This is a demo monetization system. No real payments are processed.
          Plan selection is stored locally for testing purposes.
        </p>
      </div>
    </div>
  );
}
