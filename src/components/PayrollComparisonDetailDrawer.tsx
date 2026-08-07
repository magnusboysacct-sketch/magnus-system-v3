// Payroll Comparison Detail Drawer - Phase 2C-2
// Read-only worker-level payroll comparison detail drawer
// PHASE 2C-2 WORKER DETAIL REVIEW ONLY — NOT ACTIVE PAYROLL

import React, { useState, useEffect } from 'react';
import { X, User, Calendar, DollarSign, TrendingUp, TrendingDown, AlertTriangle, CheckCircle, XCircle, Clock, Eye, Shield, FileText, Calculator } from 'lucide-react';

interface WorkerComparisonDetail {
  id: string;
  workerId: string;
  workerName: string;
  employeeId: string;
  usNetPay: number;
  jamaicanNetPay: number;
  difference: number;
  differencePercentage: number;
  validationStatus: 'valid' | 'warning' | 'error' | 'not_available';
  warningCount: number;
  payrollCountry: string;
  regularHours: number;
  overtimeHours: number;
  grossPay: number;
}

interface PayrollPeriod {
  id: string;
  period_start: string;
  period_end: string;
  status: string;
}

interface PayrollComparisonDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  worker: WorkerComparisonDetail | null;
  periodData: PayrollPeriod | null;
}

export default function PayrollComparisonDetailDrawer({ 
  isOpen, 
  onClose, 
  worker, 
  periodData 
}: PayrollComparisonDetailDrawerProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<any>(null);

  useEffect(() => {
    if (isOpen && worker && periodData) {
      loadWorkerDetailData();
    }
  }, [isOpen, worker, periodData]);

  const loadWorkerDetailData = async () => {
    if (!worker || !periodData) return;

    setLoading(true);
    setError(null);

    try {
      const { data: { user } } = await (await import('../lib/supabase')).supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { data: profile } = await (await import('../lib/supabase')).supabase
        .from('user_profiles')
        .select('company_id')
        .eq('id', user.id)
        .single();

      if (!profile?.company_id) throw new Error('Company not found');

      // Fetch detailed payroll entry with all shadow calculation data
      const { data: payrollEntry, error: entryError } = await (await import('../lib/supabase')).supabase
        .from('payroll_entries')
        .select(`
          id,
          regular_hours,
          overtime_hours,
          regular_pay,
          overtime_pay,
          gross_pay,
          net_pay,
          federal_tax,
          state_tax,
          social_security,
          medicare,
          health_insurance,
          retirement_401k,
          other_deductions,
          total_deductions,
          
          // Jamaican shadow calculation fields
          jamaicanShadowNetPay,
          jamaicanShadowDeductions,
          jamaicanShadowVersion,
          jamaicanValidationStatus,
          jamaicanValidationWarnings,
          jamaicanValidationVersion,
          
          // Jamaican deduction fields (from migration)
          nis_deduction,
          nht_deduction,
          paye_deduction,
          education_tax_deduction,
          employer_nis_contribution,
          employer_nht_contribution,
          employer_education_tax_contribution,
          
          // Audit fields
          created_at,
          updated_at
        `)
        .eq('id', worker.id)
        .eq('company_id', profile.company_id)
        .single();

      if (entryError) throw entryError;

      // Fetch worker tax info for payroll country
      const { data: taxInfo, error: taxError } = await (await import('../lib/supabase')).supabase
        .from('worker_tax_info')
        .select(`
          payroll_country,
          jamaican_payroll_enabled,
          nis_number,
          tax_file_number,
          trn,
          is_exempt_nis,
          is_exempt_nht,
          is_exempt_education_tax,
          is_exempt_paye
        `)
        .eq('worker_id', worker.workerId)
        .maybeSingle();

      if (taxError) throw taxError;

      // Fetch audit record for this calculation
      const { data: auditRecord, error: auditError } = await (await import('../lib/supabase')).supabase
        .from('payroll_calculation_audit')
        .select(`
          id,
          old_calculation_method,
          new_calculation_method,
          old_values,
          new_values,
          created_at,
          changed_by
        `)
        .eq('payroll_entry_id', worker.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (auditError) throw auditError;

      // Calculate Jamaican deductions totals - use shadow deduction data if available
      const jamaicanEmployeeDeductions = {
        nis: (payrollEntry as any)?.nis_deduction || 0,
        nht: (payrollEntry as any)?.nht_deduction || 0,
        paye: (payrollEntry as any)?.paye_deduction || 0,
        educationTax: (payrollEntry as any)?.education_tax_deduction || 0,
      };

      const jamaicanEmployerContributions = {
        nis: (payrollEntry as any)?.employer_nis_contribution || 0,
        nht: (payrollEntry as any)?.employer_nht_contribution || 0,
        educationTax: (payrollEntry as any)?.employer_education_tax_contribution || 0,
      };

      const totalJamaicanEmployeeDeductions = Object.values(jamaicanEmployeeDeductions).reduce((sum, val) => sum + val, 0);
      const totalJamaicanEmployerContributions = Object.values(jamaicanEmployerContributions).reduce((sum, val) => sum + val, 0);

      setDetailData({
        payrollEntry,
        taxInfo,
        auditRecord,
        jamaicanEmployeeDeductions,
        jamaicanEmployerContributions,
        totalJamaicanEmployeeDeductions,
        totalJamaicanEmployerContributions,
      });

    } catch (err) {
      console.error('Failed to load worker detail data:', err);
      setError('Failed to load worker detail data');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatPercentage = (value: number) => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
  };

  const getValidationIcon = (status: string) => {
    switch (status) {
      case 'valid':
        return <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />;
      case 'not_available':
        return <Clock className="w-5 h-5 text-slate-400 dark:text-slate-600" />;
      default:
        return <Clock className="w-5 h-5 text-slate-400 dark:text-slate-600" />;
    }
  };

  const getValidationColor = (status: string) => {
    switch (status) {
      case 'valid':
        return 'text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-500/20';
      case 'warning':
        return 'text-yellow-700 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-500/20';
      case 'error':
        return 'text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-500/20';
      case 'not_available':
        return 'text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-white/[0.06]';
      default:
        return 'text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-white/[0.06]';
    }
  };

  const getMigrationReadinessColor = (status: string) => {
    switch (status) {
      case 'valid':
        return 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-500/20';
      case 'warning':
        return 'text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-500/20';
      case 'error':
        return 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-500/20';
      default:
        return 'text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-white/[0.06]';
    }
  };

  const getMigrationReadinessLabel = (status: string) => {
    switch (status) {
      case 'valid':
        return 'Ready for Migration';
      case 'warning':
        return 'Needs Review';
      case 'error':
        return 'Not Ready';
      default:
        return 'Unknown';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div 
        className="absolute inset-0 bg-black/50" 
        onClick={onClose}
      />
      <div className="relative w-full max-w-2xl bg-white dark:bg-[#0f1520] shadow-2xl overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0f1520] px-6 py-4">
          <div className="flex items-center gap-3">
            <Eye className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                {worker?.workerName || 'Worker Details'}
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Payroll Comparison Review
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5 text-slate-600 dark:text-slate-400" />
          </button>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-slate-600 dark:text-slate-400">Loading worker comparison details...</p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="p-6">
            <div className="flex items-center gap-2 p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
              <span className="text-sm text-red-700 dark:text-red-400">{error}</span>
            </div>
          </div>
        )}

        {/* Detail Content */}
        {!loading && !error && worker && periodData && detailData && (
          <div className="p-6 space-y-6">
            {/* Worker Header */}
            <div className="bg-slate-50 dark:bg-white/[0.04] rounded-lg p-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{worker.workerName}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Employee</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {new Date(periodData.period_start).toLocaleDateString()} - {new Date(periodData.period_end).toLocaleDateString()}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Payroll Period</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{worker.employeeId || 'No ID'}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Employee ID</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  {getValidationIcon(worker.validationStatus)}
                  <div>
                    <p className={`px-2 py-1 rounded-full text-xs font-medium ${getValidationColor(worker.validationStatus)}`}>
                      {worker.validationStatus.replace('_', ' ')}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Validation Status</p>
                  </div>
                </div>
              </div>
              
              <div className="mt-4 flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <span className="text-sm text-slate-600 dark:text-slate-400">
                  Payroll Country: <span className="font-medium">{detailData.taxInfo?.payroll_country || 'US'}</span>
                </span>
                {detailData.taxInfo?.jamaican_payroll_enabled && (
                  <span className="px-2 py-1 bg-green-100 dark:bg-green-500/20 text-green-800 dark:text-green-300 rounded-full text-xs font-medium">
                    Jamaican Payroll Enabled
                  </span>
                )}
              </div>
            </div>

            {/* US Payroll Section */}
            <div className="bg-white dark:bg-[#0f1520] border border-slate-200 dark:border-white/[0.08] rounded-lg p-4">
              <div className="flex items-center gap-2 mb-4">
                <DollarSign className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">US Payroll Calculation</h3>
                <span className="px-2 py-1 bg-blue-100 dark:bg-blue-500/20 text-blue-800 dark:text-blue-300 rounded-full text-xs font-medium">
                  Current Method
                </span>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Gross Pay</p>
                  <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {formatCurrency(detailData.payrollEntry?.gross_pay || 0)}
                  </p>
                </div>
                
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Net Pay</p>
                  <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {formatCurrency(detailData.payrollEntry?.net_pay || 0)}
                  </p>
                </div>
                
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Total Deductions</p>
                  <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {formatCurrency(detailData.payrollEntry?.total_deductions || 0)}
                  </p>
                </div>
                
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Hours Worked</p>
                  <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {worker.regularHours.toFixed(1)} regular + {worker.overtimeHours.toFixed(1)} overtime
                  </p>
                </div>
              </div>
              
              <div className="mt-4 pt-4 border-t border-slate-200 dark:border-white/[0.08]">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Deduction Breakdown:</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Federal Tax:</span>
                    <span className="font-medium">{formatCurrency(detailData.payrollEntry?.federal_tax || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">State Tax:</span>
                    <span className="font-medium">{formatCurrency(detailData.payrollEntry?.state_tax || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Social Security:</span>
                    <span className="font-medium">{formatCurrency(detailData.payrollEntry?.social_security || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Medicare:</span>
                    <span className="font-medium">{formatCurrency(detailData.payrollEntry?.medicare || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Health Insurance:</span>
                    <span className="font-medium">{formatCurrency(detailData.payrollEntry?.health_insurance || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">401k:</span>
                    <span className="font-medium">{formatCurrency(detailData.payrollEntry?.retirement_401k || 0)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Jamaican Shadow Section */}
            <div className="bg-white dark:bg-[#0f1520] border border-slate-200 dark:border-white/[0.08] rounded-lg p-4">
              <div className="flex items-center gap-2 mb-4">
                <Calculator className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Jamaican Shadow Calculation</h3>
                <span className="px-2 py-1 bg-purple-100 dark:bg-purple-500/20 text-purple-800 dark:text-purple-300 rounded-full text-xs font-medium">
                  Shadow Mode
                </span>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Shadow Net Pay</p>
                  <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {formatCurrency(worker.jamaicanNetPay)}
                  </p>
                </div>
                
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Shadow Gross Pay</p>
                  <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {formatCurrency(detailData.payrollEntry?.gross_pay || 0)}
                  </p>
                </div>
                
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Total Employee Deductions</p>
                  <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {formatCurrency(detailData.totalJamaicanEmployeeDeductions)}
                  </p>
                </div>
                
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Total Employer Contributions</p>
                  <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {formatCurrency(detailData.totalJamaicanEmployerContributions)}
                  </p>
                </div>
              </div>
              
              <div className="mt-4 pt-4 border-t border-slate-200 dark:border-white/[0.08]">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Employee Deductions:</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">NIS (2.75%):</span>
                    <span className="font-medium">{formatCurrency(detailData.jamaicanEmployeeDeductions.nis)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">NHT (2%):</span>
                    <span className="font-medium">{formatCurrency(detailData.jamaicanEmployeeDeductions.nht)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">PAYE:</span>
                    <span className="font-medium">{formatCurrency(detailData.jamaicanEmployeeDeductions.paye)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Education Tax (2.25%):</span>
                    <span className="font-medium">{formatCurrency(detailData.jamaicanEmployeeDeductions.educationTax)}</span>
                  </div>
                </div>
              </div>
              
              <div className="mt-4 pt-4 border-t border-slate-200 dark:border-white/[0.08]">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Employer Contributions:</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Employer NIS (2.5%):</span>
                    <span className="font-medium">{formatCurrency(detailData.jamaicanEmployerContributions.nis)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Employer NHT (3%):</span>
                    <span className="font-medium">{formatCurrency(detailData.jamaicanEmployerContributions.nht)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Employer Education Tax (3.5%):</span>
                    <span className="font-medium">{formatCurrency(detailData.jamaicanEmployerContributions.educationTax)}</span>
                  </div>
                </div>
              </div>
              
              <div className="mt-4 pt-4 border-t border-slate-200 dark:border-white/[0.08]">
                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                  <FileText className="w-4 h-4" />
                  <span>Shadow Calculation Version: {detailData.payrollEntry?.jamaicanShadowVersion || 'N/A'}</span>
                </div>
              </div>
            </div>

            {/* Difference Analysis */}
            <div className="bg-white dark:bg-[#0f1520] border border-slate-200 dark:border-white/[0.08] rounded-lg p-4">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Difference Analysis</h3>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Net Pay Difference</p>
                  <p className={`text-lg font-semibold ${
                    Math.abs(worker.difference) < 1 ? 'text-green-600 dark:text-green-400' : 
                    Math.abs(worker.difference) < 10 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'
                  }`}>
                    {formatCurrency(worker.difference)}
                  </p>
                </div>
                
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Difference Percentage</p>
                  <p className={`text-lg font-semibold ${
                    Math.abs(worker.differencePercentage) < 5 ? 'text-green-600 dark:text-green-400' : 
                    Math.abs(worker.differencePercentage) < 15 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'
                  }`}>
                    {formatPercentage(worker.differencePercentage)}
                  </p>
                </div>
              </div>
              
              <div className="mt-4 pt-4 border-t border-slate-200 dark:border-white/[0.08]">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Validation Warnings:</p>
                </div>
                {worker.warningCount > 0 ? (
                  <div className="p-3 bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-500/20 rounded-lg">
                    <p className="text-sm text-yellow-800 dark:text-yellow-300">
                      {worker.warningCount} warning(s) detected in shadow calculation
                    </p>
                    {detailData.payrollEntry?.jamaicanValidationWarnings && (
                      <div className="mt-2">
                        {Array.isArray(detailData.payrollEntry.jamaicanValidationWarnings) 
                          ? detailData.payrollEntry.jamaicanValidationWarnings.map((warning: string, index: number) => (
                              <p key={index} className="text-xs text-yellow-700 dark:text-yellow-400 mt-1">• {warning}</p>
                            ))
                          : <p className="text-xs text-yellow-700 dark:text-yellow-400">{detailData.payrollEntry.jamaicanValidationWarnings}</p>
                        }
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-3 bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 rounded-lg">
                    <p className="text-sm text-green-800 dark:text-green-300">No warnings detected</p>
                  </div>
                )}
              </div>
              
              <div className="mt-4 pt-4 border-t border-slate-200 dark:border-white/[0.08]">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Migration Readiness:</p>
                </div>
                <div className={`p-3 rounded-lg border ${getMigrationReadinessColor(worker.validationStatus)}`}>
                  <div className="flex items-center gap-2">
                    {getValidationIcon(worker.validationStatus)}
                    <span className="text-sm font-medium">
                      {getMigrationReadinessLabel(worker.validationStatus)}
                    </span>
                  </div>
                  <p className="text-xs mt-1">
                    {worker.validationStatus === 'valid' && 'Worker is ready for Jamaican payroll migration'}
                    {worker.validationStatus === 'warning' && 'Worker requires review before migration'}
                    {worker.validationStatus === 'error' && 'Worker is not ready for migration'}
                    {worker.validationStatus === 'not_available' && 'Shadow calculation not available'}
                  </p>
                </div>
              </div>
            </div>

            {/* Audit Snapshot */}
            <div className="bg-white dark:bg-[#0f1520] border border-slate-200 dark:border-white/[0.08] rounded-lg p-4">
              <div className="flex items-center gap-2 mb-4">
                <FileText className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Audit Snapshot</h3>
              </div>
              
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Calculation Timestamp:</span>
                  <span className="font-medium">
                    {detailData.payrollEntry?.created_at ? 
                      new Date(detailData.payrollEntry.created_at).toLocaleString() : 
                      'N/A'
                    }
                  </span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Validation Version:</span>
                  <span className="font-medium">
                    {detailData.payrollEntry?.jamaicanValidationVersion || 'N/A'}
                  </span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Audit Source:</span>
                  <span className="font-medium">
                    {detailData.auditRecord?.new_calculation_method || 'Shadow Calculation Engine'}
                  </span>
                </div>
                
                {detailData.auditRecord && (
                  <div className="pt-3 border-t border-slate-200 dark:border-white/[0.08]">
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Last Audit Record:</p>
                    <div className="p-2 bg-slate-50 dark:bg-white/[0.04] rounded text-xs">
                      <div>ID: {detailData.auditRecord.id}</div>
                      <div>Created: {new Date(detailData.auditRecord.created_at).toLocaleString()}</div>
                      <div>Method: {detailData.auditRecord.new_calculation_method}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
