import React from 'react';
import { ShieldCheck } from 'lucide-react';

export default function PayrollSimulationAuditPanel() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-emerald-50 p-2 text-emerald-700">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-slate-900">
            Payroll Simulation Audit
          </h3>
          <p className="text-sm text-slate-600">
            Audit panel temporarily stabilized for Phase 3E compile recovery. No payroll activation, GL posting, or payroll mutation is performed here.
          </p>
        </div>
      </div>
    </div>
  );
}
