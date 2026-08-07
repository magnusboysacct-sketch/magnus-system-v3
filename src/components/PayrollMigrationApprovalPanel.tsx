// Payroll Migration Approval Panel - Phase 2C-4
// PHASE 2C-4 RECOVERY PANEL — NOT ACTIVE PAYROLL

import React, { useState, useEffect } from 'react';
import { Shield, CheckCircle, XCircle, AlertTriangle, Clock, Users, TrendingUp, FileText, Calendar, Eye, Settings } from 'lucide-react';

interface MigrationApprovalData {
  migrationStatus: 'pending' | 'director_approved' | 'admin_approved' | 'fully_approved' | 'rejected';
  migrationReadinessScore: number;
  totalWorkers: number;
  readyWorkers: number;
  blockedWorkers: number;
  directorApprovalId?: string;
  directorApprovedAt?: string;
  directorNotes?: string;
  adminApprovalId?: string;
  adminApprovedAt?: string;
  adminNotes?: string;
  createdAt: string;
  updatedAt: string;
}

interface PayrollMigrationApprovalPanelProps {
  payrollPeriodId: string;
  companyId: string;
  isVisible: boolean;
}

export default function PayrollMigrationApprovalPanel({ 
  payrollPeriodId, 
  companyId, 
  isVisible 
}: PayrollMigrationApprovalPanelProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approvalData, setApprovalData] = useState<MigrationApprovalData | null>(null);

  useEffect(() => {
    if (isVisible && payrollPeriodId && companyId) {
      loadApprovalData();
    }
  }, [isVisible, payrollPeriodId, companyId]);

  const loadApprovalData = async () => {
    setLoading(true);
    setError(null);

    try {
      const { payrollMigrationApprovals } = await import('../lib/payrollMigrationApprovals');
      
      const approval = await payrollMigrationApprovals.getMigrationApproval(payrollPeriodId, companyId);
      
      if (approval) {
        setApprovalData(approval);
      } else {
        // Create initial approval record if none exists
        const readinessSummary = await payrollMigrationApprovals.getMigrationReadinessSummary(payrollPeriodId, companyId);
        
        const newApproval = await payrollMigrationApprovals.upsertMigrationApproval({
          companyId,
          payrollPeriodId,
          migrationStatus: 'pending',
          migrationReadinessScore: readinessSummary.readinessScore,
          totalWorkers: readinessSummary.totalWorkers,
          readyWorkers: readinessSummary.readyWorkers,
          blockedWorkers: readinessSummary.blockedWorkers,
        });
        
        setApprovalData(newApproval);
      }
    } catch (err) {
      console.error('Failed to load approval data:', err);
      setError('Failed to load migration approval data');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />;
      case 'director_approved':
        return <CheckCircle className="w-5 h-5 text-blue-600 dark:text-blue-400" />;
      case 'admin_approved':
        return <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />;
      case 'fully_approved':
        return <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />;
      case 'rejected':
        return <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />;
      default:
        return <AlertTriangle className="w-5 h-5 text-slate-400 dark:text-slate-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 dark:bg-yellow-500/20 text-yellow-800 dark:text-yellow-300';
      case 'director_approved':
        return 'px-3 py-1 rounded-full text-sm font-medium bg-blue-100 dark:bg-blue-500/20 text-blue-800 dark:text-blue-300';
      case 'admin_approved':
        return 'px-3 py-1 rounded-full text-sm font-medium bg-green-100 dark:bg-green-500/20 text-green-800 dark:text-green-300';
      case 'fully_approved':
        return 'px-3 py-1 rounded-full text-sm font-medium bg-green-100 dark:bg-green-500/20 text-green-800 dark:text-green-300';
      case 'rejected':
        return 'px-3 py-1 rounded-full text-sm font-medium bg-red-100 dark:bg-red-500/20 text-red-800 dark:text-red-300';
      default:
        return 'px-3 py-1 rounded-full text-sm font-medium bg-slate-100 dark:bg-white/[0.06] text-slate-800 dark:text-slate-200';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending':
        return 'Pending Review';
      case 'director_approved':
        return 'Director Approved';
      case 'admin_approved':
        return 'Admin Approved';
      case 'fully_approved':
        return 'Fully Approved';
      case 'rejected':
        return 'Rejected';
      default:
        return 'Unknown';
    }
  };

  const getReadinessColor = (score: number) => {
    if (score >= 90) return 'text-green-600 dark:text-green-400';
    if (score >= 70) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getReadinessLabel = (score: number) => {
    if (score >= 90) return 'Ready for Migration';
    if (score >= 70) return 'Needs Review';
    return 'Not Ready';
  };

  if (!isVisible) return null;

  return (
    <div className="bg-white dark:bg-[#0f1520] border border-slate-200 dark:border-white/[0.08] rounded-lg p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Shield className="w-6 h-6 text-blue-600 dark:text-blue-400" />
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Migration Approval Status</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400">Governance workflow for Jamaican payroll migration</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : error ? (
        <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
            <span className="text-sm text-red-700 dark:text-red-400">{error}</span>
          </div>
        </div>
      ) : approvalData ? (
        <div className="space-y-6">
          {/* Migration Status */}
          <div className="bg-slate-50 dark:bg-white/[0.04] rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {getStatusIcon(approvalData.migrationStatus)}
                <span className={getStatusColor(approvalData.migrationStatus)}>
                  {getStatusLabel(approvalData.migrationStatus)}
                </span>
              </div>
              <div className="text-sm text-slate-500 dark:text-slate-400">
                Created: {formatDate(approvalData.createdAt)}
              </div>
            </div>
          </div>

          {/* Readiness Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-[#0f1520] border border-slate-200 dark:border-white/[0.08] rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Readiness Score</span>
              </div>
              <div className={`text-2xl font-bold ${getReadinessColor(approvalData.migrationReadinessScore)}`}>
                {approvalData.migrationReadinessScore.toFixed(1)}%
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {getReadinessLabel(approvalData.migrationReadinessScore)}
              </div>
            </div>
            
            <div className="bg-white dark:bg-[#0f1520] border border-slate-200 dark:border-white/[0.08] rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-4 h-4 text-green-600 dark:text-green-400" />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Ready Workers</span>
              </div>
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {approvalData.readyWorkers}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                of {approvalData.totalWorkers} total
              </div>
            </div>
            
            <div className="bg-white dark:bg-[#0f1520] border border-slate-200 dark:border-white/[0.08] rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Blocked Workers</span>
              </div>
              <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                {approvalData.blockedWorkers}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                require attention
              </div>
            </div>
            
            <div className="bg-white dark:bg-[#0f1520] border border-slate-200 dark:border-white/[0.08] rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Total Workers</span>
              </div>
              <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {approvalData.totalWorkers}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                in this period
              </div>
            </div>
          </div>

          {/* Approval Timeline */}
          <div className="bg-white dark:bg-[#0f1520] border border-slate-200 dark:border-white/[0.08] rounded-lg p-4">
            <div className="flex items-center gap-2 mb-4">
              <Calendar className="w-5 h-5 text-slate-600 dark:text-slate-400" />
              <h4 className="text-md font-semibold text-slate-900 dark:text-slate-100">Approval Timeline</h4>
            </div>
            
            <div className="space-y-3">
              {/* Director Approval */}
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0">
                  {approvalData.directorApprovedAt ? (
                    <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                  ) : (
                    <Clock className="w-5 h-5 text-slate-400 dark:text-slate-600" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-900 dark:text-slate-100">Director Approval</span>
                    {approvalData.directorApprovedAt && (
                      <span className="px-2 py-1 bg-green-100 dark:bg-green-500/20 text-green-800 dark:text-green-300 rounded-full text-xs font-medium">
                        Completed
                      </span>
                    )}
                  </div>
                  {approvalData.directorApprovedAt && (
                    <div className="text-sm text-slate-600 dark:text-slate-400">
                      {formatDate(approvalData.directorApprovedAt)}
                    </div>
                  )}
                  {approvalData.directorNotes && (
                    <div className="mt-1 p-2 bg-slate-50 dark:bg-white/[0.04] rounded text-sm text-slate-700 dark:text-slate-300">
                      <p className="font-medium">Notes:</p>
                      <p>{approvalData.directorNotes}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Admin Approval */}
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0">
                  {approvalData.adminApprovedAt ? (
                    <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                  ) : (
                    <Clock className="w-5 h-5 text-slate-400 dark:text-slate-600" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-900 dark:text-slate-100">Admin Approval</span>
                    {approvalData.adminApprovedAt && (
                      <span className="px-2 py-1 bg-green-100 dark:bg-green-500/20 text-green-800 dark:text-green-300 rounded-full text-xs font-medium">
                        Completed
                      </span>
                    )}
                  </div>
                  {approvalData.adminApprovedAt && (
                    <div className="text-sm text-slate-600 dark:text-slate-400">
                      {formatDate(approvalData.adminApprovedAt)}
                    </div>
                  )}
                  {approvalData.adminNotes && (
                    <div className="mt-1 p-2 bg-slate-50 dark:bg-white/[0.04] rounded text-sm text-slate-700 dark:text-slate-300">
                      <p className="font-medium">Notes:</p>
                      <p>{approvalData.adminNotes}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Migration Requirements */}
          <div className="bg-white dark:bg-[#0f1520] border border-slate-200 dark:border-white/[0.08] rounded-lg p-4">
            <div className="flex items-center gap-2 mb-4">
              <Settings className="w-5 h-5 text-slate-600 dark:text-slate-400" />
              <h4 className="text-md font-semibold text-slate-900 dark:text-slate-100">Migration Requirements</h4>
            </div>
            
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle className={`w-4 h-4 ${approvalData.migrationStatus === 'fully_approved' ? 'text-green-600 dark:text-green-400' : 'text-slate-400 dark:text-slate-600'}`} />
                <span className="text-slate-700 dark:text-slate-300">Director and Admin approval completed</span>
              </div>
              
              <div className="flex items-center gap-2">
                <CheckCircle className={`w-4 h-4 ${approvalData.migrationReadinessScore >= 90 ? 'text-green-600 dark:text-green-400' : 'text-slate-400 dark:text-slate-600'}`} />
                <span className="text-slate-700 dark:text-slate-300">
                  Migration readiness score of 90% or higher
                  {approvalData.migrationReadinessScore < 90 && (
                    <span className="text-red-600 dark:text-red-400"> (Current: {approvalData.migrationReadinessScore.toFixed(1)}%)</span>
                  )}
                </span>
              </div>
              
              <div className="flex items-center gap-2">
                <CheckCircle className={`w-4 h-4 ${approvalData.blockedWorkers === 0 ? 'text-green-600 dark:text-green-400' : 'text-slate-400 dark:text-slate-600'}`} />
                <span className="text-slate-700 dark:text-slate-300">
                  No blocked workers requiring investigation
                  {approvalData.blockedWorkers > 0 && (
                    <span className="text-red-600 dark:text-red-400"> (Current: {approvalData.blockedWorkers})</span>
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
