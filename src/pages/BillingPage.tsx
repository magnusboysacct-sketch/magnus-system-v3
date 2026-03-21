import React from "react";
import { Check, X } from "lucide-react";
import { usePlan } from "../hooks/usePlan";
import type { Plan } from "../lib/plans";
import { PLAN_FEATURES } from "../lib/plans";
import { useFinanceAccess } from "../hooks/useFinanceAccess";
import { FinanceAccessDenied } from "../components/FinanceAccessDenied";
import { theme } from "../lib/theme";

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
        <h1 className={`text-3xl font-bold ${theme.text.primary} mb-2`}>Billing & Plans</h1>
        <p className={theme.text.muted}>Choose the plan that fits your needs</p>
      </div>

      <div className={`mb-8 p-4 ${theme.status.info.bg} border ${theme.status.info.border} rounded-lg`}>
        <p className={`text-sm ${theme.status.info.text}`}>
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
                  ? `border-blue-500 ${theme.status.info.bg}`
                  : `${theme.border.base} ${theme.surface.base}`
                }
              `}
            >
              {isCurrent && (
                <div className="absolute top-4 right-4 bg-blue-500 text-white text-xs px-2 py-1 rounded-full font-semibold">
                  Current
                </div>
              )}

              <div className="mb-6">
                <h3 className={`text-xl font-bold ${theme.text.primary} mb-2`}>
                  {planInfo.name}
                </h3>
                <div className={`text-3xl font-bold ${theme.text.primary}`}>
                  {planInfo.price.split("/")[0]}
                  <span className={`text-sm font-normal ${theme.text.muted}`}>
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
                    display = value ? <Check size={16} className={theme.status.success.text} /> : <X size={16} className={theme.text.muted} />;
                  } else if (typeof value === "number") {
                    display = value;
                  } else if (value === null) {
                    display = "Unlimited";
                  } else {
                    display = String(value);
                  }

                  return (
                    <li key={feature.key} className={`flex items-center gap-2 text-sm ${theme.text.secondary}`}>
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
                    ? `${theme.input.disabled} ${theme.text.muted} cursor-not-allowed`
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

      <div className={`mt-8 p-4 ${theme.surface.muted} border ${theme.border.base} rounded-lg`}>
        <p className={`text-xs ${theme.text.muted}`}>
          <strong>Note:</strong> This is a demo monetization system. No real payments are processed.
          Plan selection is stored locally for testing purposes.
        </p>
      </div>
    </div>
  );
}
