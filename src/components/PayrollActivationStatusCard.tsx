// PHASE 2D-2-4 ACTIVATION CONTROL UI ONLY — NOT ACTIVE PAYROLL

import React from 'react';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  Settings,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';

interface PayrollActivationStatusCardProps {
  title: string;
  status: 'active' | 'inactive' | 'error' | 'warning';
  description?: string;
  lastUpdated?: string;
  children?: React.ReactNode;
  action?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    icon?: React.ReactNode;
  };
  stats?: Array<{
    label: string;
    value: string | number;
    trend?: 'up' | 'down' | 'neutral';
  }>;
}

export default function PayrollActivationStatusCard({
  title,
  status,
  description,
  lastUpdated,
  children,
  action,
  stats = [],
}: PayrollActivationStatusCardProps) {
  const statusStyle = {
    active: {
      icon: <CheckCircle className="h-5 w-5" />,
      iconClass: 'bg-green-100 text-green-700',
      badgeClass: 'bg-green-100 text-green-800',
    },
    inactive: {
      icon: <XCircle className="h-5 w-5" />,
      iconClass: 'bg-slate-100 text-slate-600',
      badgeClass: 'bg-slate-100 text-slate-800',
    },
    error: {
      icon: <AlertTriangle className="h-5 w-5" />,
      iconClass: 'bg-red-100 text-red-700',
      badgeClass: 'bg-red-100 text-red-800',
    },
    warning: {
      icon: <AlertTriangle className="h-5 w-5" />,
      iconClass: 'bg-yellow-100 text-yellow-700',
      badgeClass: 'bg-yellow-100 text-yellow-800',
    },
  }[status];

  const getTrendIcon = (trend?: 'up' | 'down' | 'neutral') => {
    if (trend === 'up') {
      return <TrendingUp className="h-4 w-4 text-green-600" />;
    }

    if (trend === 'down') {
      return <TrendingDown className="h-4 w-4 text-red-600" />;
    }

    return <div className="h-4 w-4 rounded-full bg-slate-300" />;
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className={`rounded-full p-2 ${statusStyle.iconClass}`}>
            {statusStyle.icon}
          </div>

          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              {title}
            </h3>

            {description && (
              <p className="mt-1 text-sm text-slate-600">
                {description}
              </p>
            )}

            {lastUpdated && (
              <div className="mt-2 flex items-center gap-1 text-xs text-slate-500">
                <Clock className="h-4 w-4" />
                Updated {new Date(lastUpdated).toLocaleDateString()}
              </div>
            )}
          </div>
        </div>

        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${statusStyle.badgeClass}`}
        >
          {status.toUpperCase()}
        </span>
      </div>

      {stats.length > 0 && (
        <div className="mt-6 border-t border-slate-200 pt-5">
          <h4 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-700">
            Statistics
          </h4>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {stats.map((stat, index) => (
              <div
                key={`${stat.label}-${index}`}
                className="rounded-xl border border-slate-200 bg-slate-50 p-4"
              >
                <div className="text-2xl font-bold text-slate-900">
                  {stat.value}
                </div>

                <div className="mt-2 flex items-center gap-2 text-sm text-slate-600">
                  {getTrendIcon(stat.trend)}
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {children && (
        <div className="mt-6 border-t border-slate-200 pt-5">
          {children}
        </div>
      )}

      {action && (
        <div className="mt-6 border-t border-slate-200 pt-5">
          <button
            type="button"
            onClick={action.onClick}
            disabled={action.disabled}
            className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition ${
              action.disabled
                ? 'cursor-not-allowed bg-slate-100 text-slate-400'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {action.icon ?? <Settings className="h-4 w-4" />}
            {action.label}
          </button>
        </div>
      )}
    </div>
  );
}