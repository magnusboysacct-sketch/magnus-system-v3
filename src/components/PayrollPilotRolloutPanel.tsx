// Payroll Pilot Rollout Panel - Phase 2F
// Pilot rollout management and monitoring dashboard
// PHASE 2F EXECUTIVE DASHBOARD ONLY — NOT ACTIVE PAYROLL

import React, { useState, useEffect } from 'react';
import { 
  Users, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  TrendingUp, 
  TrendingDown, 
  Activity,
  Target,
  BarChart3,
  Calendar,
  Eye,
  Zap
} from 'lucide-react';

// Mock data for safe fallback
const mockPilotData = {
  overallStatus: {
    status: 'active' as const,
    phase: 'phase_2' as const,
    totalWorkers: 1247,
    pilotWorkers: 156,
    completionPercentage: 12.5,
    lastUpdated: new Date().toISOString()
  },
  rolloutPhases: [
    {
      id: 'phase_1',
      name: 'Phase 1 - Core Team',
      status: 'completed' as const,
      workers: 25,
      startDate: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
      endDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      success: true,
      variance: 0.2
    },
    {
      id: 'phase_2',
      name: 'Phase 2 - Department Heads',
      status: 'active' as const,
      workers: 156,
      startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      endDate: null,
      success: null,
      variance: 0.8
    },
    {
      id: 'phase_3',
      name: 'Phase 3 - Full Department',
      status: 'pending' as const,
      workers: 312,
      startDate: null,
      endDate: null,
      success: null,
      variance: null
    },
    {
      id: 'phase_4',
      name: 'Phase 4 - Organization Wide',
      status: 'planned' as const,
      workers: 1247,
      startDate: null,
      endDate: null,
      success: null,
      variance: null
    }
  ],
  pilotGroups: [
    {
      id: 'executive',
      name: 'Executive Team',
      workers: 8,
      status: 'completed' as const,
      activatedDate: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
      variance: 0.1,
      issues: 0
    },
    {
      id: 'finance',
      name: 'Finance Department',
      workers: 45,
      status: 'active' as const,
      activatedDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      variance: 0.3,
      issues: 2
    },
    {
      id: 'hr',
      name: 'HR Department',
      workers: 12,
      status: 'active' as const,
      activatedDate: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
      variance: 0.2,
      issues: 0
    },
    {
      id: 'operations',
      name: 'Operations Team',
      workers: 91,
      status: 'active' as const,
      activatedDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      variance: 1.1,
      issues: 3
    }
  ],
  executionMetrics: {
    accuracyRate: 99.2,
    processingTime: '2.3 seconds',
    errorRate: 0.8,
    userSatisfaction: 4.6,
    systemUptime: 99.9,
    dataIntegrity: 99.7
  },
  confidenceMetrics: {
    overallConfidence: 87,
    technicalConfidence: 92,
    businessConfidence: 85,
    userAdoptionConfidence: 78,
    riskMitigationConfidence: 90
  },
  varianceAnalysis: {
    netPayVariance: {
      average: 0.8,
      threshold: 2.0,
      workersAboveThreshold: 3,
      trend: 'improving' as const
    },
    deductionVariance: {
      average: 1.2,
      threshold: 3.0,
      workersAboveThreshold: 5,
      trend: 'stable' as const
    },
    taxVariance: {
      average: 0.3,
      threshold: 1.0,
      workersAboveThreshold: 1,
      trend: 'improving' as const
    }
  },
  recentActivity: [
    {
      id: '1',
      type: 'activation' as const,
      description: 'Operations Team activated for pilot',
      timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      user: 'System Admin'
    },
    {
      id: '2',
      type: 'issue' as const,
      description: 'Variance detected for 3 workers in Finance',
      timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      user: 'Payroll System'
    },
    {
      id: '3',
      type: 'resolution' as const,
      description: 'Variance issues resolved for Finance Department',
      timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      user: 'Payroll Team'
    }
  ]
};

export default function PayrollPilotRolloutPanel() {
  const [pilotData, setPilotData] = useState(mockPilotData);
  const [loading, setLoading] = useState(false);
  const [selectedTab, setSelectedTab] = useState('overview');

  useEffect(() => {
    const loadPilotData = async () => {
      setLoading(true);
      try {
        // Use mock data as safe fallback
        setPilotData(mockPilotData);
      } catch (err) {
        console.error('Failed to load pilot data:', err);
      } finally {
        setLoading(false);
      }
    };

    loadPilotData();
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': case 'active': return 'text-green-600';
      case 'pending': case 'planned': return 'text-yellow-600';
      case 'failed': case 'paused': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'completed': case 'active': return 'bg-green-100 text-green-800';
      case 'pending': case 'planned': return 'bg-yellow-100 text-yellow-800';
      case 'failed': case 'paused': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case 'active': return <Activity className="h-4 w-4 text-blue-600" />;
      case 'pending': return <Clock className="h-4 w-4 text-yellow-600" />;
      case 'planned': return <Calendar className="h-4 w-4 text-gray-600" />;
      case 'failed': return <AlertTriangle className="h-4 w-4 text-red-600" />;
      default: return <Activity className="h-4 w-4 text-gray-600" />;
    }
  };

  const getTrendIcon = (trend: string) => {
    return trend === 'improving' ? 
      <TrendingUp className="h-4 w-4 text-green-600" /> : 
      trend === 'declining' ? 
      <TrendingDown className="h-4 w-4 text-red-600" /> : 
      <Activity className="h-4 w-4 text-blue-600" />;
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
        <div className="flex items-center justify-center h-64">
          <div className="flex items-center space-x-2">
            <Activity className="h-6 w-6 animate-spin" />
            <span>Loading Pilot Rollout...</span>
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
              <Users className="h-5 w-5" />
              <span>Pilot Rollout Panel</span>
            </h3>
            <p className="text-sm text-gray-600">
              Pilot rollout management and execution monitoring
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeVariant(pilotData.overallStatus.status)}`}>
              {pilotData.overallStatus.status.toUpperCase()}
            </span>
          </div>
        </div>
      </div>
      <div className="px-6 py-4 space-y-6">
        {/* Overall Status */}
        <div className="text-center space-y-2">
          <div className="text-4xl font-bold">{pilotData.overallStatus.completionPercentage}%</div>
          <div className="text-lg font-medium text-blue-600">
            Rollout Progress
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div 
              className="bg-blue-600 h-3 rounded-full transition-all duration-300"
              style={{ width: `${pilotData.overallStatus.completionPercentage}%` }}
            />
          </div>
          <div className="flex items-center justify-center space-x-4 text-sm text-gray-600">
            <span>{pilotData.overallStatus.pilotWorkers} pilot workers</span>
            <span>{pilotData.overallStatus.totalWorkers} total workers</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex space-x-1 border-b border-gray-200">
          <button
            onClick={() => setSelectedTab('overview')}
            className={`px-4 py-2 text-sm font-medium ${
              selectedTab === 'overview'
                ? 'border-b-2 border-blue-500 text-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setSelectedTab('execution')}
            className={`px-4 py-2 text-sm font-medium ${
              selectedTab === 'execution'
                ? 'border-b-2 border-blue-500 text-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Execution
          </button>
          <button
            onClick={() => setSelectedTab('variance')}
            className={`px-4 py-2 text-sm font-medium ${
              selectedTab === 'variance'
                ? 'border-b-2 border-blue-500 text-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Variance
          </button>
        </div>

        {/* Overview Tab */}
        {selectedTab === 'overview' && (
          <div className="space-y-6">
            {/* Rollout Phases */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Rollout Phases</h3>
              <div className="space-y-3">
                {pilotData.rolloutPhases.map((phase) => (
                  <div key={phase.id} className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        {getStatusIcon(phase.status)}
                        <div>
                          <h4 className="font-medium">{phase.name}</h4>
                          <p className="text-sm text-gray-600">{phase.workers} workers</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeVariant(phase.status)}`}>
                          {phase.status.replace('_', ' ').toUpperCase()}
                        </span>
                        {phase.variance !== null && (
                          <span className="text-sm text-gray-600">
                            Variance: {phase.variance}%
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 text-sm text-gray-600">
                      {phase.startDate && (
                        <span>Started: {new Date(phase.startDate).toLocaleDateString()}</span>
                      )}
                      {phase.endDate && (
                        <span className="ml-4">Completed: {new Date(phase.endDate).toLocaleDateString()}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Pilot Groups */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Active Pilot Groups</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {pilotData.pilotGroups.map((group) => (
                  <div key={group.id} className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium">{group.name}</h4>
                        <p className="text-sm text-gray-600">{group.workers} workers</p>
                      </div>
                      <div className="flex items-center space-x-2">
                        {getStatusIcon(group.status)}
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeVariant(group.status)}`}>
                          {group.status.toUpperCase()}
                        </span>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-sm">
                      <span className="text-gray-600">
                        Variance: {group.variance}%
                      </span>
                      <span className={`${group.issues > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {group.issues} issues
                      </span>
                    </div>
                    {group.activatedDate && (
                      <div className="mt-1 text-xs text-gray-500">
                        Activated: {new Date(group.activatedDate).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Execution Tab */}
        {selectedTab === 'execution' && (
          <div className="space-y-6">
            {/* Execution Metrics */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center space-x-2">
                <Target className="h-5 w-5" />
                <span>Execution Metrics</span>
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="p-4 border rounded-lg text-center">
                  <div className="text-2xl font-bold text-green-600">{pilotData.executionMetrics.accuracyRate}%</div>
                  <div className="text-sm text-gray-600">Accuracy Rate</div>
                </div>
                <div className="p-4 border rounded-lg text-center">
                  <div className="text-2xl font-bold">{pilotData.executionMetrics.processingTime}</div>
                  <div className="text-sm text-gray-600">Processing Time</div>
                </div>
                <div className="p-4 border rounded-lg text-center">
                  <div className="text-2xl font-bold text-red-600">{pilotData.executionMetrics.errorRate}%</div>
                  <div className="text-sm text-gray-600">Error Rate</div>
                </div>
                <div className="p-4 border rounded-lg text-center">
                  <div className="text-2xl font-bold text-blue-600">{pilotData.executionMetrics.userSatisfaction}/5</div>
                  <div className="text-sm text-gray-600">User Satisfaction</div>
                </div>
                <div className="p-4 border rounded-lg text-center">
                  <div className="text-2xl font-bold text-green-600">{pilotData.executionMetrics.systemUptime}%</div>
                  <div className="text-sm text-gray-600">System Uptime</div>
                </div>
                <div className="p-4 border rounded-lg text-center">
                  <div className="text-2xl font-bold text-green-600">{pilotData.executionMetrics.dataIntegrity}%</div>
                  <div className="text-sm text-gray-600">Data Integrity</div>
                </div>
              </div>
            </div>

            {/* Confidence Metrics */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center space-x-2">
                <Zap className="h-5 w-5" />
                <span>Confidence Metrics</span>
              </h3>
              <div className="space-y-3">
                {Object.entries(pilotData.confidenceMetrics).map(([key, value]) => (
                  <div key={key} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium capitalize">
                        {key.replace(/([A-Z])/g, ' $1').trim()}
                      </span>
                      <span className="text-sm font-bold">{value}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${value}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Variance Tab */}
        {selectedTab === 'variance' && (
          <div className="space-y-6">
            {/* Variance Analysis */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Variance Analysis</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {Object.entries(pilotData.varianceAnalysis).map(([key, variance]) => (
                  <div key={key} className="p-4 border rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium capitalize">
                        {key.replace(/([A-Z])/g, ' $1').trim()}
                      </span>
                      {getTrendIcon(variance.trend)}
                    </div>
                    <div className="text-lg font-bold">{variance.average}%</div>
                    <div className="text-sm text-gray-600">
                      Threshold: {variance.threshold}%
                    </div>
                    <div className="text-sm">
                      <span className={`${variance.workersAboveThreshold > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {variance.workersAboveThreshold} workers above threshold
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Recent Activity */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Recent Activity</h3>
          <div className="space-y-2">
            {pilotData.recentActivity.map((activity) => (
              <div key={activity.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center space-x-3">
                  {activity.type === 'activation' && <Users className="h-4 w-4 text-blue-600" />}
                  {activity.type === 'issue' && <AlertTriangle className="h-4 w-4 text-red-600" />}
                  {activity.type === 'resolution' && <CheckCircle2 className="h-4 w-4 text-green-600" />}
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
            Last updated: {new Date(pilotData.overallStatus.lastUpdated).toLocaleString()}
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
