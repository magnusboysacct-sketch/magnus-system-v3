// Payroll Rollback Readiness Panel - Phase 2F
// Executive rollback readiness and recovery monitoring dashboard
// PHASE 2F EXECUTIVE DASHBOARD ONLY — NOT ACTIVE PAYROLL

import React, { useState, useEffect } from 'react';
import {
  Shield, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  RotateCcw,
  Database,
  Activity,
  Zap,
  Timer,
  BarChart3,
  Eye
} from 'lucide-react';

// Mock data for safe fallback
const mockRollbackData = {
  overallReadiness: {
    score: 88,
    status: 'ready' as const,
    level: 'High' as const,
    lastAssessed: new Date().toISOString()
  },
  recoveryPoints: {
    lastBackup: {
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      status: 'valid' as const,
      size: '2.3 GB',
      location: 'Primary'
    },
    backupFrequency: {
      current: '6 hours',
      target: '4 hours',
      compliance: 'within_threshold' as const
    },
    recoveryPointCount: 12
  },
  rollbackSafety: {
    duplicateExecutionProtection: {
      status: 'passed' as const,
      score: 95,
      lastChecked: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString()
    },
    rollbackSpeed: {
      status: 'passed' as const,
      score: 88,
      lastChecked: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    },
    dataIntegrity: {
      status: 'passed' as const,
      score: 92,
      lastChecked: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString()
    },
    rollbackValidation: {
      status: 'passed' as const,
      score: 85,
      lastChecked: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()
    }
  },
  emergencyProcedures: {
    emergencyStop: {
      enabled: true,
      lastTested: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      responseTime: '< 30 seconds'
    },
    dataBackup: {
      status: 'active' as const,
      lastBackup: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      retentionPeriod: '90 days'
    },
    communicationPlan: {
      status: 'approved' as const,
      lastUpdated: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
      stakeholders: ['Executive Team', 'IT Operations', 'Payroll Team']
    }
  },
  performanceMetrics: {
    rollbackTestDuration: {
      average: '3.2 minutes',
      target: '< 5 minutes',
      trend: 'improving' as const
    },
    recoveryTimeObjective: {
      current: '4.5 minutes',
      target: '< 5 minutes',
      compliance: 'within_target' as const
    },
    rollbackSuccessRate: {
      current: 98.5,
      target: 99.0,
      trend: 'stable' as const
    }
  },
  rollbackHistory: [
    {
      id: '1',
      timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      type: 'test' as const,
      duration: '3.1 minutes',
      success: true,
      affectedWorkers: 0,
      reason: 'Scheduled rollback test'
    },
    {
      id: '2',
      timestamp: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
      type: 'test' as const,
      duration: '3.5 minutes',
      success: true,
      affectedWorkers: 0,
      reason: 'Monthly validation'
    }
  ],
  recommendations: [
    'Maintain current rollback readiness level',
    'Consider reducing backup frequency to 4 hours',
    'Continue monthly rollback testing',
    'Update communication plan with new stakeholders'
  ]
};

export default function PayrollRollbackReadinessPanel() {
  const [rollbackData, setRollbackData] = useState(mockRollbackData);
  const [loading, setLoading] = useState(false);
  const [selectedValidation, setSelectedValidation] = useState<string | null>(null);

  useEffect(() => {
    const loadRollbackData = async () => {
      setLoading(true);
      try {
        // Use mock data as safe fallback
        setRollbackData(mockRollbackData);
      } catch (err) {
        console.error('Failed to load rollback data:', err);
      } finally {
        setLoading(false);
      }
    };

    loadRollbackData();
  }, []);

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'ready': case 'valid': case 'active': case 'approved': case 'passed':
        return 'bg-green-100 text-green-800';
      case 'warning': case 'monitoring':
        return 'bg-yellow-100 text-yellow-800';
      case 'failed': case 'invalid':
        return 'bg-red-100 text-red-800';
      case 'disabled':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getTrendIcon = (trend: string) => {
    return trend === 'improving' ? 
      <Activity className="h-4 w-4 text-green-600" /> : 
      trend === 'declining' ? 
      <AlertTriangle className="h-4 w-4 text-red-600" /> : 
      <BarChart3 className="h-4 w-4 text-blue-600" />;
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
        <div className="flex items-center justify-center h-64">
          <div className="flex items-center space-x-2">
            <Activity className="h-6 w-6 animate-spin" />
            <span>Loading Rollback Readiness...</span>
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
              <RotateCcw className="h-5 w-5" />
              <span>Rollback Readiness Panel</span>
            </h3>
            <p className="text-sm text-gray-600">
              Executive rollback readiness and recovery monitoring
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeVariant(rollbackData.overallReadiness.status)}`}>
              {rollbackData.overallReadiness.status.toUpperCase()}
            </span>
          </div>
        </div>
      </div>
      <div className="px-6 py-4 space-y-6">
        {/* Overall Readiness Score */}
        <div className="text-center space-y-2">
          <div className="text-4xl font-bold">{rollbackData.overallReadiness.score}%</div>
          <div className="text-lg font-medium text-green-600">
            {rollbackData.overallReadiness.level} Readiness
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div 
              className="bg-green-600 h-3 rounded-full transition-all duration-300"
              style={{ width: `${rollbackData.overallReadiness.score}%` }}
            />
          </div>
        </div>

        {/* Recovery Points Status */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold flex items-center space-x-2">
            <Database className="h-5 w-5" />
            <span>Recovery Points</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 border rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Last Backup</span>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeVariant(rollbackData.recoveryPoints.lastBackup.status)}`}>
                  {rollbackData.recoveryPoints.lastBackup.status.toUpperCase()}
                </span>
              </div>
              <div className="text-sm text-gray-600">
                {new Date(rollbackData.recoveryPoints.lastBackup.timestamp).toLocaleString()}
              </div>
              <div className="text-xs text-gray-500">
                {rollbackData.recoveryPoints.lastBackup.size} • {rollbackData.recoveryPoints.lastBackup.location}
              </div>
            </div>
            
            <div className="p-4 border rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Backup Frequency</span>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeVariant(rollbackData.recoveryPoints.backupFrequency.compliance)}`}>
                  WITHIN TARGET
                </span>
              </div>
              <div className="text-sm text-gray-600">
                Current: {rollbackData.recoveryPoints.backupFrequency.current}
              </div>
              <div className="text-xs text-gray-500">
                Target: {rollbackData.recoveryPoints.backupFrequency.target}
              </div>
            </div>
            
            <div className="p-4 border rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Recovery Points</span>
                <span className="text-lg font-bold">{rollbackData.recoveryPoints.recoveryPointCount}</span>
              </div>
              <div className="text-sm text-gray-600">
                Available for rollback
              </div>
            </div>
          </div>
        </div>

        {/* Rollback Safety Validations */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold flex items-center space-x-2">
            <Shield className="h-5 w-5" />
            <span>Rollback Safety Validations</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(rollbackData.rollbackSafety).map(([key, data]) => (
              <div 
                key={key}
                className="p-4 border rounded-lg space-y-2 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => setSelectedValidation(selectedValidation === key ? null : key)}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium capitalize">
                    {key.replace(/([A-Z])/g, ' $1').trim()}
                  </span>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeVariant(data.status)}`}>
                    {data.status.toUpperCase()}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${data.score}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-gray-600">
                  <span>Score: {data.score}%</span>
                  <span>Checked: {new Date(data.lastChecked).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Emergency Procedures */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold flex items-center space-x-2">
            <Zap className="h-5 w-5" />
            <span>Emergency Procedures</span>
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <h4 className="font-medium">Emergency Stop</h4>
                <p className="text-sm text-gray-600">
                  Last tested: {new Date(rollbackData.emergencyProcedures.emergencyStop.lastTested).toLocaleDateString()}
                </p>
                <p className="text-xs text-gray-500">
                  Response time: {rollbackData.emergencyProcedures.emergencyStop.responseTime}
                </p>
              </div>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeVariant(rollbackData.emergencyProcedures.emergencyStop.enabled ? 'enabled' : 'disabled')}`}>
                {rollbackData.emergencyProcedures.emergencyStop.enabled ? 'ENABLED' : 'DISABLED'}
              </span>
            </div>
            
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <h4 className="font-medium">Data Backup</h4>
                <p className="text-sm text-gray-600">
                  Last backup: {new Date(rollbackData.emergencyProcedures.dataBackup.lastBackup).toLocaleString()}
                </p>
                <p className="text-xs text-gray-500">
                  Retention: {rollbackData.emergencyProcedures.dataBackup.retentionPeriod}
                </p>
              </div>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeVariant(rollbackData.emergencyProcedures.dataBackup.status)}`}>
                {rollbackData.emergencyProcedures.dataBackup.status.toUpperCase()}
              </span>
            </div>
            
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <h4 className="font-medium">Communication Plan</h4>
                <p className="text-sm text-gray-600">
                  Last updated: {new Date(rollbackData.emergencyProcedures.communicationPlan.lastUpdated).toLocaleDateString()}
                </p>
                <p className="text-xs text-gray-500">
                  Stakeholders: {rollbackData.emergencyProcedures.communicationPlan.stakeholders.length}
                </p>
              </div>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeVariant(rollbackData.emergencyProcedures.communicationPlan.status)}`}>
                {rollbackData.emergencyProcedures.communicationPlan.status.toUpperCase()}
              </span>
            </div>
          </div>
        </div>

        {/* Performance Metrics */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold flex items-center space-x-2">
            <Timer className="h-5 w-5" />
            <span>Performance Metrics</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 border rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Test Duration</span>
                {getTrendIcon(rollbackData.performanceMetrics.rollbackTestDuration.trend)}
              </div>
              <div className="text-lg font-bold">
                {rollbackData.performanceMetrics.rollbackTestDuration.average}
              </div>
              <div className="text-xs text-gray-500">
                Target: {rollbackData.performanceMetrics.rollbackTestDuration.target}
              </div>
            </div>
            
            <div className="p-4 border rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Recovery Time</span>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeVariant(rollbackData.performanceMetrics.recoveryTimeObjective.compliance)}`}>
                  WITHIN TARGET
                </span>
              </div>
              <div className="text-lg font-bold">
                {rollbackData.performanceMetrics.recoveryTimeObjective.current}
              </div>
              <div className="text-xs text-gray-500">
                Target: {rollbackData.performanceMetrics.recoveryTimeObjective.target}
              </div>
            </div>
            
            <div className="p-4 border rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Success Rate</span>
                {getTrendIcon(rollbackData.performanceMetrics.rollbackSuccessRate.trend)}
              </div>
              <div className="text-lg font-bold">
                {rollbackData.performanceMetrics.rollbackSuccessRate.current}%
              </div>
              <div className="text-xs text-gray-500">
                Target: {rollbackData.performanceMetrics.rollbackSuccessRate.target}%
              </div>
            </div>
          </div>
        </div>

        {/* Rollback History */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Recent Rollback Activity</h3>
          <div className="space-y-2">
            {rollbackData.rollbackHistory.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center space-x-3">
                  {entry.success ? 
                    <CheckCircle2 className="h-4 w-4 text-green-600" /> : 
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                  }
                  <div>
                    <div className="font-medium capitalize">{entry.type} Rollback</div>
                    <div className="text-sm text-gray-600">{entry.reason}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium">{entry.duration}</div>
                  <div className="text-xs text-gray-500">
                    {new Date(entry.timestamp).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recommendations */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Recommendations</h3>
          <div className="space-y-2">
            {rollbackData.recommendations.map((recommendation, index) => (
              <div key={index} className="flex items-start space-x-2 p-3 bg-gray-50 rounded-lg">
                <CheckCircle2 className="h-4 w-4 mt-0.5 text-green-600" />
                <span className="text-sm">{recommendation}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between border-t pt-4">
          <span className="text-sm text-gray-600">
            Last assessed: {new Date(rollbackData.overallReadiness.lastAssessed).toLocaleString()}
          </span>
          <div className="flex items-center space-x-2">
            <button className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md hover:bg-gray-50">
              <Eye className="h-4 w-4 mr-2" />
              View Details
            </button>
            <button className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md hover:bg-gray-50">
              <BarChart3 className="h-4 w-4 mr-2" />
              Performance Report
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
