import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileCheck2,
  ShieldCheck,
} from 'lucide-react';

type AuditStatus = 'passed' | 'warning' | 'pending';

type AuditItem = {
  id: string;
  title: string;
  description: string;
  status: AuditStatus;
};

const auditItems: AuditItem[] = [
  {
    id: 'shadow-only',
    title: 'Shadow-only execution',
    description: 'Simulation review is isolated from live payroll processing.',
    status: 'passed',
  },
  {
    id: 'no-gl-posting',
    title: 'No GL posting',
    description: 'Audit panel does not post journal entries or accounting records.',
    status: 'passed',
  },
  {
    id: 'no-payroll-mutation',
    title: 'No payroll mutation',
    description: 'Payroll entries remain read-only during Phase 3E review.',
    status: 'passed',
  },
  {
    id: 'audit-detail-rebuild',
    title: 'Detailed audit rebuild',
    description: 'Full audit data model will be reconnected after schema alignment.',
    status: 'pending',
  },
];

const statusStyles: Record<AuditStatus, string> = {
  passed: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20',
  warning: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20',
  pending: 'bg-slate-50 dark:bg-white/[0.04] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-white/[0.08]',
};

const statusIcon: Record<AuditStatus, React.ReactNode> = {
  passed: <CheckCircle2 className="h-4 w-4" />,
  warning: <AlertTriangle className="h-4 w-4" />,
  pending: <Clock className="h-4 w-4" />,
};

type PayrollSimulationAuditPanelProps = {
  totalSimulations?: number;
  runningSimulations?: number;
  completedSimulations?: number;
  averageSafetyScore?: number;
};

export default function PayrollSimulationAuditPanel({
  totalSimulations = 0,
  runningSimulations = 0,
  completedSimulations = 0,
  averageSafetyScore = 0,
}: PayrollSimulationAuditPanelProps) {
    const liveAuditItems: AuditItem[] = [
    ...auditItems,
    {
      id: 'live-simulations',
      title: 'Live simulation records',
      description: `${totalSimulations} simulation record(s) loaded for audit review.`,
      status: totalSimulations > 0 ? 'passed' : 'pending',
    },
    {
      id: 'completed-simulations',
      title: 'Completed simulations available',
      description: `${completedSimulations} completed simulation(s) available for review.`,
      status: completedSimulations > 0 ? 'passed' : 'pending',
    },
    {
      id: 'safety-score',
      title: 'Average safety score',
      description: `Current average safety score is ${averageSafetyScore.toFixed(1)}%.`,
      status: averageSafetyScore >= 90 ? 'passed' : averageSafetyScore > 0 ? 'warning' : 'pending',
    },
  ];

  const passedCount = liveAuditItems.filter((item) => item.status === 'passed').length;
    const pendingCount = liveAuditItems.filter((item) => item.status === 'pending').length;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0f1520] p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-emerald-50 dark:bg-emerald-500/10 p-2 text-emerald-700 dark:text-emerald-400">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Payroll Simulation Audit
              </h3>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                Phase 3E audit review is rebuilt in safe shadow-only mode. This panel is read-only and does not activate payroll, mutate entries, or post GL transactions.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg border border-emerald-200 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/10 px-4 py-3">
              <div className="text-xs font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                Passed
              </div>
              <div className="mt-1 text-2xl font-semibold text-emerald-800 dark:text-emerald-300">
                {passedCount}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.04] px-4 py-3">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-600 dark:text-slate-400">
                Pending
              </div>
              <div className="mt-1 text-2xl font-semibold text-slate-800 dark:text-slate-200">
                {pendingCount}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0f1520] shadow-sm">
        <div className="border-b border-slate-200 dark:border-white/[0.08] px-5 py-4">
          <div className="flex items-center gap-2">
            <FileCheck2 className="h-5 w-5 text-slate-600 dark:text-slate-400" />
            <h4 className="font-semibold text-slate-900 dark:text-slate-100">Safety audit checklist</h4>
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {liveAuditItems.map((item) => (
            <div key={item.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="font-medium text-slate-900 dark:text-slate-100">{item.title}</div>
                <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">{item.description}</div>
              </div>
              <div className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${statusStyles[item.status]}`}>
                {statusIcon[item.status]}
                <span className="capitalize">{item.status}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


