// PHASE 2D-2-4 ACTIVATION CONTROL UI ONLY — NOT ACTIVE PAYROLL

import React from 'react';
import {
  Shield,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Database,
  Unlock,
  RefreshCw,
  Settings,
  Clock,
} from 'lucide-react';

interface PayrollRollbackReadinessCardProps {
  title: string;
  readinessLevel:
    | 'very_low'
    | 'low'
    | 'moderate'
    | 'high'
    | 'very_high'
    | 'ready';
  confidenceScore: number;
  lastAssessment?: string;
  factors: {
    archiveIntegrity: number;
    versionHistory: number;
    dataConsistency: number;
    rollbackComplexity: number;
  };
  issues: string[];
  warnings: string[];
  recommendations: string[];
  onAssessNow?: () => void;
}

export default function PayrollRollbackReadinessCard({
  title,
  readinessLevel,
  confidenceScore,
  lastAssessment,
  factors,
  issues,
  warnings,
  recommendations,
  onAssessNow,
}: PayrollRollbackReadinessCardProps) {
  const getReadinessColor = () => {
    switch (readinessLevel) {
      case 'very_low':
        return 'text-red-600 bg-red-100';
      case 'low':
        return 'text-orange-600 bg-orange-100';
      case 'moderate':
        return 'text-yellow-600 bg-yellow-100';
      case 'high':
        return 'text-blue-600 bg-blue-100';
      case 'very_high':
      case 'ready':
        return 'text-green-600 bg-green-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const getReadinessIcon = () => {
    switch (readinessLevel) {
      case 'very_low':
        return <XCircle className="w-5 h-5" />;
      case 'low':
        return <AlertTriangle className="w-5 h-5" />;
      case 'moderate':
        return <Shield className="w-5 h-5" />;
      case 'high':
      case 'very_high':
      case 'ready':
        return <CheckCircle className="w-5 h-5" />;
      default:
        return <Clock className="w-5 h-5" />;
    }
  };

  const getProgressWidth = (value: number) => {
    return `${Math.min(100, Math.max(0, (value / 25) * 100))}%`;
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div
            className={`rounded-full p-2 ${getReadinessColor()}`}
          >
            {getReadinessIcon()}
          </div>

          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              {title}
            </h3>

            <div className="mt-1 flex items-center gap-2">
              <span className="text-2xl font-bold text-slate-900">
                {confidenceScore}/100
              </span>

              <span
                className={`rounded-full px-2 py-1 text-xs font-medium ${getReadinessColor()}`}
              >
                {readinessLevel.replace('_', ' ').toUpperCase()}
              </span>
            </div>

            {lastAssessment && (
              <p className="mt-1 text-sm text-slate-500">
                Last assessed{' '}
                {new Date(lastAssessment).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
          <Unlock className="h-4 w-4" />
          Rollback Ready
        </div>
      </div>

      {/* Confidence Breakdown */}
      <div className="mt-6 border-t border-slate-200 pt-6">
        <h4 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-700">
          Confidence Breakdown
        </h4>

        <div className="space-y-4">
          {[
            {
              label: 'Archive Integrity',
              value: factors.archiveIntegrity,
              color: 'bg-blue-600',
            },
            {
              label: 'Version History',
              value: factors.versionHistory,
              color: 'bg-indigo-600',
            },
            {
              label: 'Data Consistency',
              value: factors.dataConsistency,
              color: 'bg-green-600',
            },
            {
              label: 'Rollback Complexity',
              value: 25 - factors.rollbackComplexity,
              color: 'bg-yellow-600',
            },
          ].map((factor) => (
            <div key={factor.label}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-medium text-slate-700">
                  {factor.label}
                </span>

                <span className="font-semibold text-slate-900">
                  {factor.value}/25
                </span>
              </div>

              <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${factor.color}`}
                  style={{ width: getProgressWidth(factor.value) }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Issues */}
      {issues.length > 0 && (
        <div className="mt-6 border-t border-slate-200 pt-6">
          <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-red-700">
            Issues Requiring Attention
          </h4>

          <div className="space-y-2">
            {issues.map((issue, index) => (
              <div
                key={index}
                className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 text-red-600" />

                <span className="text-sm text-red-700">
                  {issue}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="mt-6 border-t border-slate-200 pt-6">
          <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-yellow-700">
            Warnings
          </h4>

          <div className="space-y-2">
            {warnings.map((warning, index) => (
              <div
                key={index}
                className="flex items-start gap-2 rounded-xl border border-yellow-200 bg-yellow-50 p-3"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 text-yellow-600" />

                <span className="text-sm text-yellow-700">
                  {warning}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div className="mt-6 border-t border-slate-200 pt-6">
          <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-blue-700">
            Recommendations
          </h4>

          <div className="space-y-2">
            {recommendations.map((rec, index) => (
              <div
                key={index}
                className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3"
              >
                <Settings className="mt-0.5 h-4 w-4 text-blue-600" />

                <span className="text-sm text-blue-700">
                  {rec}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer Action */}
      {onAssessNow && readinessLevel !== 'ready' && (
        <div className="mt-6 border-t border-slate-200 pt-6">
          <button
            onClick={onAssessNow}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-blue-700"
          >
            <RefreshCw className="h-4 w-4" />
            Assess Rollback Readiness
          </button>
        </div>
      )}

      {/* Assessment Timestamp */}
      {lastAssessment && (
        <div className="mt-6 border-t border-slate-200 pt-4">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Clock className="h-4 w-4" />

            Last assessment:{' '}
            {new Date(lastAssessment).toLocaleString()}
          </div>
        </div>
      )}

      {/* Footer Status */}
      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <Database className="h-4 w-4 text-slate-500" />

          Recovery infrastructure is operating in safe monitoring mode only.
        </div>
      </div>
    </div>
  );
}