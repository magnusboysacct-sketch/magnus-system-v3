// PHASE 2D-2-4 ACTIVATION CONTROL UI ONLY — NOT ACTIVE PAYROLL

import React, { useState } from 'react';
import {
  Settings,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Play,
  Pause,
  Square,
  TrendingUp,
  Clock,
  BarChart3,
} from 'lucide-react';

interface PayrollExecutionModeViewerProps {
  modes: Array<{
    mode: string;
    description: string;
    status: 'active' | 'inactive' | 'error' | 'warning';
    lastUsed?: string;
    configuration?: {
      readinessThreshold?: number;
      rollbackThreshold?: number;
      autoRollback?: boolean;
    };
  }>;
  onModeChange?: (mode: string) => void;
  onModeConfigure?: (mode: string) => void;
}

interface ExecutionModeStats {
  usageCount: number;
  avgDuration: number;
  successRate: number;
  errorCount: number;
}

export default function PayrollExecutionModeViewer({
  modes,
  onModeChange,
  onModeConfigure,
}: PayrollExecutionModeViewerProps) {
  const [selectedMode, setSelectedMode] = useState('');
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const [configuringMode, setConfiguringMode] = useState('');

  const getStatusStyles = (
    status: 'active' | 'inactive' | 'error' | 'warning'
  ) => {
    switch (status) {
      case 'active':
        return {
          text: 'text-green-700',
          badge: 'bg-green-100 text-green-800',
          border: 'border-green-300',
          icon: <CheckCircle className="h-4 w-4" />,
        };

      case 'inactive':
        return {
          text: 'text-slate-600',
          badge: 'bg-slate-100 text-slate-700',
          border: 'border-slate-200',
          icon: <Square className="h-4 w-4" />,
        };

      case 'error':
        return {
          text: 'text-red-700',
          badge: 'bg-red-100 text-red-800',
          border: 'border-red-300',
          icon: <XCircle className="h-4 w-4" />,
        };

      case 'warning':
        return {
          text: 'text-yellow-700',
          badge: 'bg-yellow-100 text-yellow-800',
          border: 'border-yellow-300',
          icon: <AlertTriangle className="h-4 w-4" />,
        };
    }
  };

  const getModeStats = (): ExecutionModeStats => {
    return {
      usageCount: Math.floor(Math.random() * 100),
      avgDuration: Math.floor(Math.random() * 20) + 5,
      successRate: Math.floor(Math.random() * 15) + 85,
      errorCount: Math.floor(Math.random() * 4),
    };
  };

  const handleModeSelect = (mode: string) => {
    setSelectedMode(mode);

    if (onModeChange) {
      onModeChange(mode);
    }
  };

  const handleConfigureMode = (mode: string) => {
    setConfiguringMode(mode);
    setShowConfigDialog(true);

    if (onModeConfigure) {
      onModeConfigure(mode);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">
            Execution Modes
          </h3>

          <p className="mt-1 text-sm text-slate-500">
            Routing visibility and activation monitoring
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowConfigDialog(true)}
          className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
        >
          <Settings className="h-4 w-4" />
          Configure Modes
        </button>
      </div>

      {/* Modes */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {modes.map((mode, index) => {
          const selected = selectedMode === mode.mode;
          const styles = getStatusStyles(mode.status);
          const stats = getModeStats();

          return (
            <div
              key={`${mode.mode}-${index}`}
              className={`rounded-2xl border p-5 transition ${
                selected
                  ? 'border-blue-500 bg-blue-50'
                  : styles.border
              }`}
            >
              {/* Top */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <div className={styles.text}>
                      {styles.icon}
                    </div>

                    <h4 className="font-semibold text-slate-900">
                      {mode.description}
                    </h4>
                  </div>

                  <div className="mt-2">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-medium ${styles.badge}`}
                    >
                      {mode.status.toUpperCase()}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleConfigureMode(mode.mode)}
                  className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100"
                >
                  <Settings className="h-4 w-4" />
                </button>
              </div>

              {/* Last Used */}
              <div className="mt-4 text-xs text-slate-500">
                {mode.lastUsed
                  ? `Last used ${new Date(
                      mode.lastUsed
                    ).toLocaleDateString()}`
                  : 'Never used'}
              </div>

              {/* Config */}
              {mode.configuration && (
                <div className="mt-4 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-600">
                      Readiness Threshold
                    </span>

                    <span className="font-medium text-slate-900">
                      {mode.configuration.readinessThreshold || 95}%
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-slate-600">
                      Rollback Threshold
                    </span>

                    <span className="font-medium text-slate-900">
                      {mode.configuration.rollbackThreshold || 24}h
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-slate-600">
                      Auto Rollback
                    </span>

                    <span className="font-medium text-slate-900">
                      {mode.configuration.autoRollback
                        ? 'Enabled'
                        : 'Disabled'}
                    </span>
                  </div>
                </div>
              )}

              {/* Stats */}
              <div className="mt-5 grid grid-cols-2 gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-center">
                  <BarChart3 className="mx-auto h-5 w-5 text-slate-400" />

                  <div className="mt-1 text-xl font-bold text-slate-900">
                    {stats.usageCount}
                  </div>

                  <div className="text-xs text-slate-500">
                    Usage Count
                  </div>
                </div>

                <div className="text-center">
                  <TrendingUp className="mx-auto h-5 w-5 text-green-600" />

                  <div className="mt-1 text-xl font-bold text-green-700">
                    {stats.successRate}%
                  </div>

                  <div className="text-xs text-slate-500">
                    Success Rate
                  </div>
                </div>

                <div className="text-center">
                  <Clock className="mx-auto h-5 w-5 text-slate-400" />

                  <div className="mt-1 text-xl font-bold text-slate-900">
                    {stats.avgDuration}s
                  </div>

                  <div className="text-xs text-slate-500">
                    Avg Duration
                  </div>
                </div>

                <div className="text-center">
                  <XCircle className="mx-auto h-5 w-5 text-red-600" />

                  <div className="mt-1 text-xl font-bold text-red-700">
                    {stats.errorCount}
                  </div>

                  <div className="text-xs text-slate-500">
                    Errors
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  disabled={mode.status === 'active'}
                  onClick={() => handleModeSelect(mode.mode)}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition ${
                    mode.status === 'active'
                      ? 'cursor-not-allowed bg-slate-100 text-slate-400'
                      : selected
                      ? 'bg-green-600 text-white hover:bg-green-700'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  {mode.status === 'active' ? (
                    <>
                      <Pause className="h-4 w-4" />
                      Active
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4" />
                      Select
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => handleConfigureMode(mode.mode)}
                  className="flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                >
                  <Settings className="h-4 w-4" />
                  Configure
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Config Dialog */}
      {showConfigDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-slate-900">
              Configure {configuringMode}
            </h3>

            <p className="mt-1 text-sm text-slate-500">
              Activation control configuration (safe mode only)
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowConfigDialog(false)}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => setShowConfigDialog(false)}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Save Configuration
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}