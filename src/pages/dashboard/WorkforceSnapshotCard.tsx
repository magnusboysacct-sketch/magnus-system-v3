// src/pages/dashboard/WorkforceSnapshotCard.tsx
import React from "react";
import { Users, HardHat } from "lucide-react";
import { Card, CardHeader, StatCard } from "../../components/ui";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

// TODO: Stage 2 — wire "Active Workers" to the workers table filtered by
// status = 'active' (NOT is_active — confirmed that column doesn't exist
// on this table), same filter DashboardPage.tsx already uses; wire "Field
// Payments (wk)" to field_payments filtered by work_date within the
// current week.
export default function WorkforceSnapshotCard() {
  return (
    <Card>
      <CardHeader title="Workforce Snapshot" subtitle="This week" />
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Active Workers" value="47" color="text-cyan-300" icon={<Users size={15} />} />
        <StatCard label="Field Payments (wk)" value={fmt(18600)} color="text-amber-300" icon={<HardHat size={15} />} />
      </div>
    </Card>
  );
}
