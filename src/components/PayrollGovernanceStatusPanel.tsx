// Payroll Governance Status Panel - Phase 2F
// Governance approval and compliance dashboard
// PHASE 2F EXECUTIVE DASHBOARD ONLY — NOT ACTIVE PAYROLL

import React, { useState, useEffect } from 'react';
import { 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  Users, 
  Shield, 
  FileText,
  TrendingUp,
  Activity,
  Calendar,
  Eye
} from 'lucide-react';

// Mock data for safe fallback
const mockGovernanceData = {
  overallStatus: {
    level: 'in_progress' as const,
    completionPercentage: 78,
    totalApprovals: 12,
    completedApprovals: 9,
    pendingApprovals: 3,
    lastUpdated: new Date().toISOString()
  },
  approvalWorkflow: {
    executiveApproval: {
      status: 'approved' as const,
      approvedBy: 'John Smith',
      approvedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      comments: 'Executive approval granted for pilot phase'
    },
    directorApproval: {
      status: 'pending' as const,
      requestedBy: 'Jane Doe',
      requestedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
    },
    complianceReview: {
      status: 'in_progress' as const,
      reviewer: 'Compliance Team',
      startedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      estimatedCompletion: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString()
    },
    securityAudit: {
      status: 'completed' as const,
      completedBy: 'Security Team',
      completedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      findings: 'No critical security issues identified'
    }
  },
  workerReviews: {
    totalWorkers: 1247,
    reviewedWorkers: 1189,
    pendingReview: 58,
    varianceDetected: 12,
    approvedForMigration: 1177,
    reviewProgress: 95.3
  },
  complianceChecks: {
    dataPrivacy: {
      status: 'compliant' as const,
      lastChecked: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      score: 98
    },
    regulatoryCompliance: {
      status: 'compliant' as const,
      lastChecked: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      score: 95
    },
    auditReadiness: {
      status: 'in_progress' as const,
      lastChecked: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      score: 87
    },
    documentationComplete: {
      status: 'pending' as const,
      lastChecked: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      score: 72
    }
  },
  governanceMetrics: {
    averageApprovalTime: '2.3 days',
    complianceScore: 92.5,
    riskAssessmentComplete: true,
    stakeholderAlignment: 88,
    documentationCoverage: 76
  },
  recentActivity: [
    {
      id: '1',
      type: 'approval' as const,
      description: 'Executive approval completed',
      timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      user: 'John Smith'
    },
    {
      id: '2',
      type: 'review' as const,
      description: 'Worker variance analysis completed',
      timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      user: 'Payroll Team'
    },
    {
      id: '3',
      type: 'compliance' as const,
      description: 'Data privacy compliance verified',
      timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      user: 'Compliance Team'
    }
  ]
};

export default function PayrollGovernanceStatusPanel() {
  const [governanceData, setGovernanceData] = useState(mockGovernanceData);
  const [loading, setLoading] = useState(false);
  const [selectedTab, setSelectedTab] = useState('overview');

  useEffect(() => {
    const loadGovernanceData = async () => {
      setLoading(true);
      try {
        // Use mock data as safe fallback
        setGovernanceData(mockGovernanceData);
      } catch (err) {
        console.error('Failed to load governance data:', err);
      } finally {
        setLoading(false);
      }
    };

    loadGovernanceData();
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': case 'completed': case 'compliant': return 'text-green-600';
      case 'in_progress': case 'pending': return 'text-yellow-600';
      case 'failed': case 'non_compliant': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'approved': case 'completed': case 'compliant': return 'bg-green-100 text-green-800';
      case 'in_progress': case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'failed': case 'non_compliant': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved': case 'completed': case 'compliant': return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case 'in_progress': case 'pending': return <Clock className="h-4 w-4 text-yellow-600" />;
      case 'failed': case 'non_compliant': return <AlertTriangle className="h-4 w-4 text-red-600" />;
      default: return <Activity className="h-4 w-4 text-gray-600" />;
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
        <div className="flex items-center justify-center h-64">
          <div className="flex items-center space-x-2">
            <Activity className="h-6 w-6 animate-spin" />
            <span>Loading Governance Status...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow border border-gray-200">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold flex items-center space-x-2">
              <Shield className="h-5 w-5" />
              <span>Governance Status Panel</span>
            </h3>
            <p className="text-sm text-gray-600">
              Governance approval workflow and compliance monitoring
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeVariant(governanceData.overallStatus.level)}`}>
              {governanceData.overallStatus.level.replace('_', ' ').toUpperCase()}
            </span>
          </div>
        </div>
      </div>
      <div className="px-6 py-4 space-y-6">
        {/* Overall Status */}
        <div className="text-center space-y-2">
          <div className="text-4xl font-bold">{governanceData.overallStatus.completionPercentage}%</div>
          <div className="text-lg font-medium text-blue-600">
            Governance Progress
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div 
              className="bg-blue-600 h-3 rounded-full transition-all duration-300"
              style={{ width: `${governanceData.overallStatus.completionPercentage}%` }}
            />
          </div>
          <div className="flex items-center justify-center space-x-4 text-sm text-gray-600">
            <span>{governanceData.overallStatus.completedApprovals} completed</span>
            <span>{governanceData.overallStatus.pendingApprovals} pending</span>
            <span>{governanceData.overallStatus.totalApprovals} total</span>
          </div>
        </div>

        {/* Approval Workflow */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Approval Workflow</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(governanceData.approvalWorkflow).map(([key, approval]) => (
              <div key={key} className="p-4 border rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium capitalize">
                    {key.replace(/([A-Z])/g, ' $1').trim()}
                  </span>
                  <div className="flex items-center space-x-2">
                    {getStatusIcon(approval.status)}
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeVariant(approval.status)}`}>
                      {approval.status.replace('_', ' ').toUpperCase()}
                    </span>
                  </div>
                </div>
                <div className="text-sm text-gray-600">
                  {approval.status === 'approved' && approval.approvedBy && (
                    <span>Approved by {approval.approvedBy}</span>
                  )}
                  {approval.status === 'pending' && approval.dueDate && (
                    <span>Due: {new Date(approval.dueDate).toLocaleDateString()}</span>
                  )}
                  {approval.status === 'in_progress' && approval.estimatedCompletion && (
                    <span>Est. completion: {new Date(approval.estimatedCompletion).toLocaleDateString()}</span>
                  )}
                  {approval.status === 'completed' && approval.completedBy && (
                    <span>Completed by {approval.completedBy}</span>
                  )}
                </div>
                {'comments' in approval && approval.comments && (
                  <p className="text-xs text-gray-500 italic">{approval.comments}</p>
                )}
                {'findings' in approval && approval.findings && (
                  <p className="text-xs text-gray-500 italic">{approval.findings}</p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Worker Reviews */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold flex items-center space-x-2">
            <Users className="h-5 w-5" />
            <span>Worker Reviews</span>
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <div className="text-center p-4 border rounded-lg">
              <div className="text-2xl font-bold">{governanceData.workerReviews.totalWorkers.toLocaleString()}</div>
              <div className="text-sm text-gray-600">Total Workers</div>
            </div>
            <div className="text-center p-4 border rounded-lg">
              <div className="text-2xl font-bold text-green-600">{governanceData.workerReviews.reviewedWorkers.toLocaleString()}</div>
              <div className="text-sm text-gray-600">Reviewed</div>
            </div>
            <div className="text-center p-4 border rounded-lg">
              <div className="text-2xl font-bold text-yellow-600">{governanceData.workerReviews.pendingReview}</div>
              <div className="text-sm text-gray-600">Pending</div>
            </div>
            <div className="text-center p-4 border rounded-lg">
              <div className="text-2xl font-bold text-orange-600">{governanceData.workerReviews.varianceDetected}</div>
              <div className="text-sm text-gray-600">Variance</div>
            </div>
            <div className="text-center p-4 border rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{governanceData.workerReviews.approvedForMigration.toLocaleString()}</div>
              <div className="text-sm text-gray-600">Approved</div>
            </div>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-green-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${governanceData.workerReviews.reviewProgress}%` }}
            />
          </div>
          <div className="text-center text-sm text-gray-600">
            Review Progress: {governanceData.workerReviews.reviewProgress}%
          </div>
        </div>

        {/* Compliance Checks */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold flex items-center space-x-2">
            <FileText className="h-5 w-5" />
            <span>Compliance Checks</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(governanceData.complianceChecks).map(([key, check]) => (
              <div key={key} className="p-4 border rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium capitalize">
                    {key.replace(/([A-Z])/g, ' $1').trim()}
                  </span>
                  <div className="flex items-center space-x-2">
                    {getStatusIcon(check.status)}
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeVariant(check.status)}`}>
                      {check.status.replace('_', ' ').toUpperCase()}
                    </span>
                  </div>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${check.score}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-gray-600">
                  <span>Score: {check.score}%</span>
                  <span>Checked: {new Date(check.lastChecked).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Governance Metrics */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold flex items-center space-x-2">
            <TrendingUp className="h-5 w-5" />
            <span>Governance Metrics</span>
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="p-4 border rounded-lg space-y-2">
              <div className="text-sm text-gray-600">Avg Approval Time</div>
              <div className="text-lg font-bold">{governanceData.governanceMetrics.averageApprovalTime}</div>
            </div>
            <div className="p-4 border rounded-lg space-y-2">
              <div className="text-sm text-gray-600">Compliance Score</div>
              <div className="text-lg font-bold">{governanceData.governanceMetrics.complianceScore}%</div>
            </div>
            <div className="p-4 border rounded-lg space-y-2">
              <div className="text-sm text-gray-600">Risk Assessment</div>
              <div className="text-lg font-bold">
                {governanceData.governanceMetrics.riskAssessmentComplete ? 'Complete' : 'Pending'}
              </div>
            </div>
            <div className="p-4 border rounded-lg space-y-2">
              <div className="text-sm text-gray-600">Stakeholder Alignment</div>
              <div className="text-lg font-bold">{governanceData.governanceMetrics.stakeholderAlignment}%</div>
            </div>
            <div className="p-4 border rounded-lg space-y-2">
              <div className="text-sm text-gray-600">Documentation Coverage</div>
              <div className="text-lg font-bold">{governanceData.governanceMetrics.documentationCoverage}%</div>
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Recent Governance Activity</h3>
          <div className="space-y-2">
            {governanceData.recentActivity.map((activity) => (
              <div key={activity.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center space-x-3">
                  {activity.type === 'approval' && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                  {activity.type === 'review' && <FileText className="h-4 w-4 text-blue-600" />}
                  {activity.type === 'compliance' && <Shield className="h-4 w-4 text-purple-600" />}
                  <div>
                    <div className="font-medium">{activity.description}</div>
                    <div className="text-sm text-gray-600">by {activity.user}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-600">
                    {new Date(activity.timestamp).toLocaleDateString()}
                  </div>
                  <div className="text-xs text-gray-500">
                    {new Date(activity.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between border-t pt-4">
          <span className="text-sm text-gray-600">
            Last updated: {new Date(governanceData.overallStatus.lastUpdated).toLocaleString()}
          </span>
          <div className="flex items-center space-x-2">
            <button className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md hover:bg-gray-50">
              <Eye className="h-4 w-4 mr-2" />
              View Details
            </button>
            <button className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md hover:bg-gray-50">
              <FileText className="h-4 w-4 mr-2" />
              Governance Report
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
