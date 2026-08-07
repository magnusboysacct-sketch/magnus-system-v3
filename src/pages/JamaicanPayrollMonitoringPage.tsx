// Jamaican Payroll Monitoring Dashboard - Phase 2A
// Internal admin dashboard for Jamaican payroll shadow-mode monitoring
// PHASE 2A INTERNAL MONITORING DASHBOARD ONLY — NOT ACTIVE PAYROLL

import React, { useState, useEffect } from 'react';
import { payrollMonitor } from '../lib/payrollMonitoring';
import { useAdminAccess } from '../hooks/useAdminAccess';
import { supabase } from '../lib/supabase';
import { 
  ShieldCheck, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  BarChart3, 
  TrendingUp, 
  TrendingDown,
  Users,
  FileText,
  Clock,
  RefreshCw,
  AlertCircle
} from 'lucide-react';

export default function JamaicanPayrollMonitoringPage() {
  const { isAdmin, loading: adminLoading } = useAdminAccess();
  const [monitoringData, setMonitoringData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isAdmin) {
      loadMonitoringData();
    }
  }, [isAdmin]);

  const loadMonitoringData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError('User not authenticated');
        return;
      }

      // Get company ID from user profile
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('company_id')
        .eq('id', user.id)
        .single();

      if (!profile?.company_id) {
        setError('Company not found');
        return;
      }

      const summary = await payrollMonitor.getMonitoringSummary({
        companyId: profile.company_id,
      });

      setMonitoringData(summary);
    } catch (err) {
      console.error('Failed to load monitoring data:', err);
      setError('Failed to load monitoring data');
    } finally {
      setLoading(false);
    }
  };

  // Admin access check
  if (adminLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin text-slate-500 dark:text-white/60" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <ShieldCheck className="w-12 h-12 text-red-500 mb-4" />
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">Access Denied</h2>
        <p className="text-slate-500 dark:text-white/60">You don't have permission to access this admin tool.</p>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin text-slate-500 dark:text-white/60" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <XCircle className="w-12 h-12 text-red-500 mb-4" />
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">Error</h2>
        <p className="text-slate-500 dark:text-white/60 mb-4">{error}</p>
        <button
          onClick={loadMonitoringData}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  // Empty state
  if (!monitoringData || monitoringData.totalAuditRecords === 0) {
    return (
      <div className="p-6">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Jamaican Payroll Monitor</h1>
            <div className="text-sm opacity-70">Internal monitoring dashboard for Jamaican payroll shadow calculations.</div>
          </div>
          <button
            onClick={loadMonitoringData}
            className="p-2 text-slate-500 dark:text-white/60 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-col items-center justify-center h-64 text-center">
          <FileText className="w-12 h-12 text-slate-400 dark:text-white/40 mb-4" />
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">No Audit Data Available</h2>
          <p className="text-slate-500 dark:text-white/60 mb-4">
            Jamaican payroll audit records will appear here once payroll calculations are run.
          </p>
          <div className="text-sm text-slate-400 dark:text-white/40">
            Run payroll calculations to generate shadow-mode audit data.
          </div>
        </div>
      </div>
    );
  }

  // Main dashboard
  return (
    <div className="p-6">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Jamaican Payroll Monitor</h1>
          <div className="text-sm opacity-70">Internal monitoring dashboard for Jamaican payroll shadow calculations.</div>
        </div>
        <button
          onClick={loadMonitoringData}
          className="p-2 text-slate-500 dark:text-white/60 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Migration Readiness Score */}
      <div className="mb-6">
        <div className="bg-white/5 border border-white/10 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium text-slate-900 dark:text-white">Migration Readiness</h2>
            <div className={`px-3 py-1 rounded-full text-sm font-medium ${
              monitoringData.migrationReadiness.score >= 90 
                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                : monitoringData.migrationReadiness.score >= 70
                ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                : 'bg-red-500/20 text-red-400 border border-red-500/30'
            }`}>
              {monitoringData.migrationReadiness.score}/100
            </div>
          </div>
          
          {monitoringData.migrationReadiness.issues.length > 0 && (
            <div className="mb-4">
              <h3 className="text-sm font-medium text-slate-700 dark:text-white/80 mb-2">Issues to Address:</h3>
              <ul className="space-y-1">
                {monitoringData.migrationReadiness.issues.map((issue: string, index: number) => (
                  <li key={index} className="flex items-start gap-2 text-sm text-slate-600 dark:text-white/70">
                    <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                    {issue}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {monitoringData.migrationReadiness.recommendations.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-slate-700 dark:text-white/80 mb-2">Recommendations:</h3>
              <ul className="space-y-1">
                {monitoringData.migrationReadiness.recommendations.map((rec: string, index: number) => (
                  <li key={index} className="flex items-start gap-2 text-sm text-slate-600 dark:text-white/70">
                    <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* Total Audit Records */}
        <div className="bg-white/5 border border-white/10 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <FileText className="w-5 h-5 text-blue-400" />
            <span className="text-xs text-slate-500 dark:text-white/60">Total</span>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">{monitoringData.totalAuditRecords}</div>
          <div className="text-sm text-slate-500 dark:text-white/60">Audit Records</div>
        </div>

        {/* Total Employees */}
        <div className="bg-white/5 border border-white/10 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <Users className="w-5 h-5 text-green-400" />
            <span className="text-xs text-slate-500 dark:text-white/60">Total</span>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">{monitoringData.totalEmployees}</div>
          <div className="text-sm text-slate-500 dark:text-white/60">Employees</div>
        </div>

        {/* Average Net Pay Difference */}
        <div className="bg-white/5 border border-white/10 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            {monitoringData.netPayDifferences.averageDifference >= 0 ? (
              <TrendingUp className="w-5 h-5 text-green-400" />
            ) : (
              <TrendingDown className="w-5 h-5 text-red-400" />
            )}
            <span className="text-xs text-slate-500 dark:text-white/60">Average</span>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">
            {new Intl.NumberFormat('en-JM', {
              style: 'currency',
              currency: 'JMD',
              minimumFractionDigits: 0,
              maximumFractionDigits: 0,
            }).format(Math.abs(monitoringData.netPayDifferences.averageDifference))}
          </div>
          <div className="text-sm text-slate-500 dark:text-white/60">Net Pay Difference</div>
        </div>

        {/* Largest Net Pay Difference */}
        <div className="bg-white/5 border border-white/10 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <BarChart3 className="w-5 h-5 text-purple-400" />
            <span className="text-xs text-slate-500 dark:text-white/60">Largest</span>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">
            {new Intl.NumberFormat('en-JM', {
              style: 'currency',
              currency: 'JMD',
              minimumFractionDigits: 0,
              maximumFractionDigits: 0,
            }).format(Math.abs(monitoringData.netPayDifferences.largestDifference))}
          </div>
          <div className="text-sm text-slate-500 dark:text-white/60">Net Pay Difference</div>
        </div>
      </div>

      {/* Validation Status and Warnings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Validation Status Counts */}
        <div className="bg-white/5 border border-white/10 rounded-lg p-6">
          <h2 className="text-lg font-medium text-slate-900 dark:text-white mb-4">Validation Status</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span className="text-sm text-slate-700 dark:text-white/80">Valid</span>
              </div>
              <span className="text-lg font-semibold text-slate-900 dark:text-white">{monitoringData.validationStatusCounts.valid}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-400" />
                <span className="text-sm text-slate-700 dark:text-white/80">Warning</span>
              </div>
              <span className="text-lg font-semibold text-slate-900 dark:text-white">{monitoringData.validationStatusCounts.warning}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <XCircle className="w-4 h-4 text-red-400" />
                <span className="text-sm text-slate-700 dark:text-white/80">Error</span>
              </div>
              <span className="text-lg font-semibold text-slate-900 dark:text-white">{monitoringData.validationStatusCounts.error}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-gray-400 dark:text-gray-600" />
                <span className="text-sm text-slate-700 dark:text-white/80">Not Available</span>
              </div>
              <span className="text-lg font-semibold text-slate-900 dark:text-white">{monitoringData.validationStatusCounts.not_available}</span>
            </div>
          </div>
        </div>

        {/* Warning Frequency */}
        <div className="bg-white/5 border border-white/10 rounded-lg p-6">
          <h2 className="text-lg font-medium text-slate-900 dark:text-white mb-4">Warning Frequency</h2>
          {monitoringData.warningAnalysis.mostCommonWarnings.length > 0 ? (
            <div className="space-y-2">
              {monitoringData.warningAnalysis.mostCommonWarnings.slice(0, 5).map((warning: any, index: number) => (
                <div key={index} className="flex items-center justify-between">
                  <span className="text-sm text-slate-600 dark:text-white/70 truncate flex-1 mr-2">{warning.warning}</span>
                  <span className="text-sm font-medium text-slate-900 dark:text-white bg-white/10 px-2 py-1 rounded">
                    {warning.count}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-slate-400 dark:text-white/40 py-8">
              <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-400" />
              <p className="text-sm">No warnings detected</p>
            </div>
          )}
        </div>
      </div>

      {/* Recent Audit Summaries */}
      <div className="bg-white/5 border border-white/10 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-slate-900 dark:text-white">Recent Audit Activity</h2>
          <Clock className="w-4 h-4 text-slate-500 dark:text-white/60" />
        </div>
        {monitoringData.recentActivity.recentAudits.length > 0 ? (
          <div className="space-y-2">
            {monitoringData.recentActivity.recentAudits.map((audit: any, index: number) => (
              <div key={index} className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${
                    audit.validationStatus === 'valid' ? 'bg-green-400' :
                    audit.validationStatus === 'warning' ? 'bg-yellow-400' :
                    audit.validationStatus === 'error' ? 'bg-red-400' : 'bg-gray-400 dark:bg-gray-500'
                  }`} />
                  <div>
                    <div className="text-sm font-medium text-slate-900 dark:text-white">{audit.employeeId}</div>
                    <div className="text-xs text-slate-500 dark:text-white/60">
                      {new Date(audit.auditDate).toLocaleString()}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-xs px-2 py-1 rounded-full ${
                    audit.validationStatus === 'valid' ? 'bg-green-500/20 text-green-400' :
                    audit.validationStatus === 'warning' ? 'bg-yellow-500/20 text-yellow-400' :
                    audit.validationStatus === 'error' ? 'bg-red-500/20 text-red-400' : 'bg-gray-500/20 text-gray-400 dark:text-gray-600'
                  }`}>
                    {audit.validationStatus}
                  </div>
                  <div className="text-sm text-slate-700 dark:text-white/80 mt-1">
                    {new Intl.NumberFormat('en-JM', {
                      style: 'currency',
                      currency: 'JMD',
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0,
                    }).format(audit.netPayDifference)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center text-slate-400 dark:text-white/40 py-8">
            <Clock className="w-8 h-8 mx-auto mb-2" />
            <p className="text-sm">No recent audit activity</p>
          </div>
        )}
      </div>

      {/* Metadata */}
      <div className="mt-6 text-xs text-slate-400 dark:text-white/40 text-center">
        Generated: {new Date(monitoringData.generatedAt).toLocaleString()} | 
        Version: {monitoringData.monitoringVersion}
      </div>
    </div>
  );
}
