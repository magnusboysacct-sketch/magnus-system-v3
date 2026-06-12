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
        return <Clock className="w-5 h-5 text-yellow-600" />;
      case 'director_approved':
        return <CheckCircle className="w-5 h-5 text-blue-600" />;
      case 'admin_approved':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'fully_approved':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'rejected':
        return <XCircle className="w-5 h-5 text-red-600" />;
      default:
        return <AlertTriangle className="w-5 h-5 text-slate-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800';
      case 'director_approved':
        return 'px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800';
      case 'admin_approved':
        return 'px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800';
      case 'fully_approved':
        return 'px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800';
      case 'rejected':
        return 'px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-800';
      default:
        return 'px-3 py-1 rounded-full text-sm font-medium bg-slate-100 text-slate-800';
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
    if (score >= 90) return 'text-green-600';
    if (score >= 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getReadinessLabel = (score: number) => {
    if (score >= 90) return 'Ready for Migration';
    if (score >= 70) return 'Needs Review';
    return 'Not Ready';
  };

  if (!isVisible) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Shield className="w-6 h-6 text-blue-600" />
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Migration Approval Status</h3>
          <p className="text-sm text-slate-600">Governance workflow for Jamaican payroll migration</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <span className="text-sm text-red-700">{error}</span>
          </div>
        </div>
      ) : approvalData ? (
        <div className="space-y-6">
          {/* Migration Status */}
          <div className="bg-slate-50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {getStatusIcon(approvalData.migrationStatus)}
                <span className={getStatusColor(approvalData.migrationStatus)}>
                  {getStatusLabel(approvalData.migrationStatus)}
                </span>
              </div>
              <div className="text-sm text-slate-500">
                Created: {formatDate(approvalData.createdAt)}
              </div>
            </div>
          </div>

          {/* Readiness Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-medium text-slate-700">Readiness Score</span>
              </div>
              <div className={`text-2xl font-bold ${getReadinessColor(approvalData.migrationReadinessScore)}`}>
                {approvalData.migrationReadinessScore.toFixed(1)}%
              </div>
              <div className="text-xs text-slate-500">
                {getReadinessLabel(approvalData.migrationReadinessScore)}
              </div>
            </div>
            
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-4 h-4 text-green-600" />
                <span className="text-sm font-medium text-slate-700">Ready Workers</span>
              </div>
              <div className="text-2xl font-bold text-green-600">
                {approvalData.readyWorkers}
              </div>
              <div className="text-xs text-slate-500">
                of {approvalData.totalWorkers} total
              </div>
            </div>
            
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <XCircle className="w-4 h-4 text-red-600" />
                <span className="text-sm font-medium text-slate-700">Blocked Workers</span>
              </div>
              <div className="text-2xl font-bold text-red-600">
                {approvalData.blockedWorkers}
              </div>
              <div className="text-xs text-slate-500">
                require attention
              </div>
            </div>
            
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-4 h-4 text-slate-600" />
                <span className="text-sm font-medium text-slate-700">Total Workers</span>
              </div>
              <div className="text-2xl font-bold text-slate-900">
                {approvalData.totalWorkers}
              </div>
              <div className="text-xs text-slate-500">
                in this period
              </div>
            </div>
          </div>

          {/* Approval Timeline */}
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-4">
              <Calendar className="w-5 h-5 text-slate-600" />
              <h4 className="text-md font-semibold text-slate-900">Approval Timeline</h4>
            </div>
            
            <div className="space-y-3">
              {/* Director Approval */}
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0">
                  {approvalData.directorApprovedAt ? (
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  ) : (
                    <Clock className="w-5 h-5 text-slate-400" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-900">Director Approval</span>
                    {approvalData.directorApprovedAt && (
                      <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">
                        Completed
                      </span>
                    )}
                  </div>
                  {approvalData.directorApprovedAt && (
                    <div className="text-sm text-slate-600">
                      {formatDate(approvalData.directorApprovedAt)}
                    </div>
                  )}
                  {approvalData.directorNotes && (
                    <div className="mt-1 p-2 bg-slate-50 rounded text-sm text-slate-700">
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
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  ) : (
                    <Clock className="w-5 h-5 text-slate-400" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-900">Admin Approval</span>
                    {approvalData.adminApprovedAt && (
                      <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">
                        Completed
                      </span>
                    )}
                  </div>
                  {approvalData.adminApprovedAt && (
                    <div className="text-sm text-slate-600">
                      {formatDate(approvalData.adminApprovedAt)}
                    </div>
                  )}
                  {approvalData.adminNotes && (
                    <div className="mt-1 p-2 bg-slate-50 rounded text-sm text-slate-700">
                      <p className="font-medium">Notes:</p>
                      <p>{approvalData.adminNotes}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Migration Requirements */}
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-4">
              <Settings className="w-5 h-5 text-slate-600" />
              <h4 className="text-md font-semibold text-slate-900">Migration Requirements</h4>
            </div>
            
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle className={`w-4 h-4 ${approvalData.migrationStatus === 'fully_approved' ? 'text-green-600' : 'text-slate-400'}`} />
                <span className="text-slate-700">Director and Admin approval completed</span>
              </div>
              
              <div className="flex items-center gap-2">
                <CheckCircle className={`w-4 h-4 ${approvalData.migrationReadinessScore >= 90 ? 'text-green-600' : 'text-slate-400'}`} />
                <span className="text-slate-700">
                  Migration readiness score of 90% or higher
                  {approvalData.migrationReadinessScore < 90 && (
                    <span className="text-red-600"> (Current: {approvalData.migrationReadinessScore.toFixed(1)}%)</span>
                  )}
                </span>
              </div>
              
              <div className="flex items-center gap-2">
                <CheckCircle className={`w-4 h-4 ${approvalData.blockedWorkers === 0 ? 'text-green-600' : 'text-slate-400'}`} />
                <span className="text-slate-700">
                  No blocked workers requiring investigation
                  {approvalData.blockedWorkers > 0 && (
                    <span className="text-red-600"> (Current: {approvalData.blockedWorkers})</span>
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
