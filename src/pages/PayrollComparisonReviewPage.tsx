// Payroll Comparison Review Dashboard - Phase 2C-1
// Read-only dashboard for reviewing shadow Jamaican payroll comparisons
// PHASE 2C-1 READ-ONLY REVIEW DASHBOARD — NOT ACTIVE PAYROLL

import React, { useState, useEffect } from 'react';
import { Eye, Users, DollarSign, AlertTriangle, TrendingUp, TrendingDown, Calendar, Filter, Download, RefreshCw } from 'lucide-react';
import { useAdminAccess } from '../hooks/useAdminAccess';
import { payrollMonitor } from '../lib/payrollMonitoring';
import { supabase } from '../lib/supabase';
import PayrollComparisonSummaryCards from '../components/PayrollComparisonSummaryCards';
import PayrollComparisonTable from '../components/PayrollComparisonTable';
import PayrollComparisonDetailDrawer from '../components/PayrollComparisonDetailDrawer';
import PayrollMigrationApprovalPanel from '../components/PayrollMigrationApprovalPanel';

interface PayrollPeriod {
  id: string;
  period_start: string;
  period_end: string;
  status: string;
  total_workers: number;
  total_net: number;
  hasShadowCalculations?: boolean;
}

interface ComparisonData {
  periodId: string;
  totalWorkers: number;
  averageNetPayDifference: number;
  largestNetPayDifference: number;
  validationStatusCounts: {
    valid: number;
    warning: number;
    error: number;
    not_available: number;
  };
  migrationReadinessScore: number;
  workerComparisons: any[];
}

export default function PayrollComparisonReviewPage() {
  const { isAdmin, loading: adminLoading } = useAdminAccess();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Data state
  const [payrollPeriods, setPayrollPeriods] = useState<PayrollPeriod[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<string>('');
  const [comparisonData, setComparisonData] = useState<ComparisonData | null>(null);
  
  // UI state
  const [refreshing, setRefreshing] = useState(false);
  
  // Detail drawer state
  const [showDetailDrawer, setShowDetailDrawer] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState<any>(null);
  
  // Company ID state for approval panel
  const [currentCompanyId, setCurrentCompanyId] = useState<string>('');

  useEffect(() => {
    if (isAdmin) {
      loadPayrollPeriods();
    }
  }, [isAdmin]);

  useEffect(() => {
    if (selectedPeriod && isAdmin) {
      loadComparisonData();
    }
  }, [selectedPeriod, isAdmin]);

  const loadPayrollPeriods = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('company_id')
        .eq('id', user.id)
        .single();

      if (!profile?.company_id) throw new Error('Company not found');

      // Set currentCompanyId for use in approval panel
      setCurrentCompanyId(profile.company_id);

      // Fetch payroll periods with audit data
      const { data: periods, error: periodsError } = await supabase
        .from('payroll_periods')
        .select(`
          id,
          period_start,
          period_end,
          status,
          total_workers,
          total_net,
          payroll_entries!inner(
            id,
            jamaicanShadowNetPay,
            jamaicanValidationStatus,
            jamaicanValidationWarnings
          )
        `)
        .eq('company_id', profile.company_id)
        .eq('status', 'processed')
        .in('payroll_entries.jamaicanShadowNetPay', [null, ''])
        .not('payroll_entries.jamaicanShadowNetPay', 'is', null)
        .order('period_end', { ascending: false })
        .limit(12);

      if (periodsError) throw periodsError;

      // Transform data to include shadow calculation info
      const transformedPeriods = periods?.map(period => ({
        ...period,
        hasShadowCalculations: period.payroll_entries?.some((entry: any) => 
          entry.jamaicanShadowNetPay != null
        ) || false
      })) || [];

      setPayrollPeriods(transformedPeriods);
      
      // Auto-select the most recent period with shadow calculations
      const latestWithShadow = transformedPeriods.find(p => p.hasShadowCalculations);
      if (latestWithShadow) {
        setSelectedPeriod(latestWithShadow.id);
      }

    } catch (err) {
      console.error('Failed to load payroll periods:', err);
      setError('Failed to load payroll periods');
    } finally {
      setLoading(false);
    }
  };

  const loadComparisonData = async () => {
    if (!selectedPeriod) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('company_id')
        .eq('id', user.id)
        .single();

      if (!profile?.company_id) throw new Error('Company not found');

      // Get monitoring summary using existing helper
      const monitoringSummary = await payrollMonitor.getMonitoringSummary({
        companyId: profile.company_id,
        payrollPeriodId: selectedPeriod,
      });

      // Fetch detailed worker comparisons
      const { data: workerComparisons, error: workersError } = await supabase
        .from('payroll_entries')
        .select(`
          id,
          worker_id,
          workers!inner(
            first_name,
            last_name,
            employee_id
          ),
          regular_hours,
          overtime_hours,
          regular_pay,
          overtime_pay,
          gross_pay,
          net_pay,
          jamaicanShadowNetPay,
          jamaicanValidationStatus,
          jamaicanValidationWarnings,
          jamaicanShadowVersion
        `)
        .eq('company_id', profile.company_id)
        .eq('payroll_period_id', selectedPeriod)
        .not('jamaicanShadowNetPay', 'is', null)
        .order('workers.last_name', { ascending: true });

      if (workersError) throw workersError;

      // Calculate additional metrics
      const netPayDifferences = workerComparisons?.map((entry: any) => {
        const usNetPay = entry.net_pay || 0;
        const jamaicanNetPay = entry.jamaicanShadowNetPay || 0;
        return Math.abs(usNetPay - jamaicanNetPay);
      }) || [];

      const averageNetPayDifference = netPayDifferences.length > 0 
        ? netPayDifferences.reduce((sum, diff) => sum + diff, 0) / netPayDifferences.length 
        : 0;

      const largestNetPayDifference = netPayDifferences.length > 0 
        ? Math.max(...netPayDifferences) 
        : 0;

      // Transform worker data for table
      const transformedWorkers = workerComparisons?.map((entry: any) => {
        const usNetPay = entry.net_pay || 0;
        const jamaicanNetPay = entry.jamaicanShadowNetPay || 0;
        const difference = jamaicanNetPay - usNetPay;
        const differencePercentage = usNetPay !== 0 ? (difference / usNetPay) * 100 : 0;
        const warnings = entry.jamaicanValidationWarnings || [];
        
        return {
          id: entry.id,
          workerId: entry.worker_id,
          workerName: `${entry.workers.first_name} ${entry.workers.last_name}`,
          employeeId: entry.workers.employee_id,
          usNetPay,
          jamaicanNetPay,
          difference,
          differencePercentage,
          validationStatus: entry.jamaicanValidationStatus || 'not_available',
          warningCount: Array.isArray(warnings) ? warnings.length : 0,
          payrollCountry: 'JM', // Would come from worker_tax_info in full implementation
          regularHours: entry.regular_hours || 0,
          overtimeHours: entry.overtime_hours || 0,
          grossPay: entry.gross_pay || 0,
        };
      }) || [];

      setComparisonData({
        periodId: selectedPeriod,
        totalWorkers: monitoringSummary.totalEmployees || 0,
        averageNetPayDifference,
        largestNetPayDifference,
        validationStatusCounts: monitoringSummary.validationStatusCounts || {
          valid: 0,
          warning: 0,
          error: 0,
          not_available: 0
        },
        migrationReadinessScore: monitoringSummary.migrationReadiness?.score || 0,
        workerComparisons: transformedWorkers,
      });

    } catch (err) {
      console.error('Failed to load comparison data:', err);
      setError('Failed to load comparison data');
    } finally {
      setLoading(false);
    }
  };

  const handleWorkerClick = (worker: any) => {
    setSelectedWorker(worker);
    setShowDetailDrawer(true);
  };

  const handleCloseDetailDrawer = () => {
    setShowDetailDrawer(false);
    setSelectedWorker(null);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await loadPayrollPeriods();
      if (selectedPeriod) {
        await loadComparisonData();
      }
    } finally {
      setRefreshing(false);
    }
  };

  const selectedPeriodData = payrollPeriods.find(p => p.id === selectedPeriod);

  // Admin access check
  if (adminLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <Eye className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-slate-900 mb-2">Access Denied</h2>
          <p className="text-slate-600">You don't have permission to access payroll comparison reviews.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
                <Eye className="w-6 h-6 text-blue-600" />
                Payroll Comparison Review
              </h1>
              <p className="text-sm text-slate-600 mt-1">
                Read-only review of shadow Jamaican payroll calculations
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                {refreshing ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Period Selector */}
      <div className="bg-white border-b border-slate-200">
        <div className="px-6 py-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-500" />
              <label className="text-sm font-medium text-slate-700">Payroll Period:</label>
            </div>
            
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={loading}
            >
              <option value="">Select a payroll period</option>
              {payrollPeriods.map(period => (
                <option key={period.id} value={period.id}>
                  {new Date(period.period_start).toLocaleDateString()} - {new Date(period.period_end).toLocaleDateString()}
                  {period.hasShadowCalculations && ' (Shadow Calc Available)'}
                </option>
              ))}
            </select>

            {selectedPeriodData && (
              <div className="flex items-center gap-4 text-sm text-slate-600">
                <span>Workers: {selectedPeriodData.total_workers}</span>
                <span>Status: {selectedPeriodData.status}</span>
                {selectedPeriodData.hasShadowCalculations && (
                  <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">
                    Shadow Calculations Available
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="mx-6 mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <span className="text-sm text-red-700">{error}</span>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="mx-6 mt-6 p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600">Loading payroll comparison data...</p>
        </div>
      )}

      {/* Main Content */}
      {!loading && !error && comparisonData && (
        <div className="p-6 space-y-6">
          {/* Summary Cards */}
          <PayrollComparisonSummaryCards data={comparisonData} />

          {/* Worker Comparison Table */}
          <PayrollComparisonTable 
            workers={comparisonData.workerComparisons}
            periodData={selectedPeriodData}
            onWorkerClick={handleWorkerClick}
          />

          {/* Migration Approval Panel */}
          <PayrollMigrationApprovalPanel
            payrollPeriodId={selectedPeriod}
            companyId={currentCompanyId}
            isVisible={true}
          />
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && !comparisonData && (
        <div className="mx-6 mt-6 p-8 text-center bg-white rounded-lg border border-slate-200">
          <Eye className="w-16 h-16 text-slate-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 mb-2">No Comparison Data Available</h3>
          <p className="text-slate-600 mb-4">
            Select a payroll period with shadow Jamaican calculations to view comparison data.
          </p>
          {payrollPeriods.length === 0 && (
            <p className="text-sm text-slate-500">
              No processed payroll periods found with shadow calculations.
            </p>
          )}
        </div>
      )}

      {/* Worker Detail Drawer */}
      <PayrollComparisonDetailDrawer
        isOpen={showDetailDrawer}
        onClose={handleCloseDetailDrawer}
        worker={selectedWorker}
        periodData={selectedPeriodData || null}
      />
    </div>
  );
}
