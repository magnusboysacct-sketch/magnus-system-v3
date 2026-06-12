// Payroll Readiness Dashboard - Phase 2F
// Executive dashboard for migration and activation readiness
// PHASE 2F EXECUTIVE DASHBOARD ONLY — NOT ACTIVE PAYROLL

import React, { useState, useEffect } from 'react';
import {
  CheckCircle2, 
  AlertTriangle, 
  TrendingUp, 
  TrendingDown, 
  Shield, 
  Clock, 
  Activity,
  BarChart3,
  Target
} from 'lucide-react';

// Mock data for safe fallback
const mockReadinessData = {
  migrationReadiness: {
    score: 87,
    level: 'Good' as const,
    factors: {
      executiveCheckpoints: 92,
      governanceReadiness: 85,
      rollbackReadiness: 88,
      orchestrationReadiness: 84,
      duplicateExecutionProtection: 90
    },
    trend: 'improving' as const,
    lastEvaluated: new Date().toISOString()
  },
  activationReadiness: {
    score: 82,
    level: 'Good' as const,
    factors: {
      operationalHardening: 78,
      deploymentReadiness: 85,
      emergencyPreparedness: 80,
      simulationResults: 88
    },
    trend: 'stable' as const,
    lastEvaluated: new Date().toISOString()
  },
  operationalHardening: {
    concurrencyReadiness: 85,
    retryProtectionReadiness: 90,
    queueProtectionReadiness: 82,
    orchestrationStabilityReadiness: 78,
    emergencyStopReadiness: 88,
    recoveryReadinessScore: 86,
    overallScore: 85
  },
  deploymentReadiness: {
    infrastructureReady: true,
    monitoringReady: true,
    rollbackReady: true,
    governanceReady: false,
    overallScore: 75
  }
};

const mockReadinessTrends = [
  { date: '2024-01-01', migrationScore: 75, activationScore: 70 },
  { date: '2024-01-08', migrationScore: 78, activationScore: 73 },
  { date: '2024-01-15', migrationScore: 82, activationScore: 76 },
  { date: '2024-01-22', migrationScore: 85, activationScore: 79 },
  { date: '2024-01-29', migrationScore: 87, activationScore: 82 }
];

export default function PayrollReadinessDashboard() {
  const [readinessData, setReadinessData] = useState(mockReadinessData);
  const [trends, setTrends] = useState(mockReadinessTrends);
  const [loading, setLoading] = useState(false);
  const [selectedTimeframe, setSelectedTimeframe] = useState('30d');

  useEffect(() => {
    const loadReadinessData = async () => {
      setLoading(true);
      try {
        // Use mock data as safe fallback
        setReadinessData(mockReadinessData);
        setTrends(mockReadinessTrends);
      } catch (err) {
        console.error('Failed to load readiness data:', err);
      } finally {
        setLoading(false);
      }
    };

    loadReadinessData();
  }, [selectedTimeframe]);

  const getReadinessColor = (score: number) => {
    if (score >= 90) return 'text-green-600';
    if (score >= 80) return 'text-blue-600';
    if (score >= 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getReadinessBadgeVariant = (score: number) => {
    if (score >= 90) return 'bg-green-100 text-green-800';
    if (score >= 80) return 'bg-blue-100 text-blue-800';
    if (score >= 70) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  const getTrendIcon = (trend: string) => {
    return trend === 'improving' ? 
      <TrendingUp className="h-4 w-4 text-green-600" /> : 
      trend === 'declining' ? 
      <TrendingDown className="h-4 w-4 text-red-600" /> : 
      <Activity className="h-4 w-4 text-blue-600" />;
  };

  if (loading && !readinessData) {
    return (
      <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
        <div className="flex items-center justify-center h-64">
          <div className="flex items-center space-x-2">
            <Activity className="h-6 w-6 animate-spin" />
            <span>Loading Readiness Dashboard...</span>
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
              <span>Readiness Dashboard</span>
            </h3>
            <p className="text-sm text-gray-600">
              Migration and activation readiness metrics with operational hardening status
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <button 
              className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md hover:bg-gray-50"
              onClick={() => setSelectedTimeframe(selectedTimeframe === '30d' ? '7d' : '30d')}
            >
              {selectedTimeframe === '30d' ? '30 Days' : '7 Days'}
            </button>
          </div>
        </div>
      </div>
      <div className="px-6 py-4 space-y-6">
        {/* Overall Readiness Scores */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Migration Readiness</h3>
              <div className="flex items-center space-x-2">
                {getTrendIcon(readinessData.migrationReadiness.trend)}
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getReadinessBadgeVariant(readinessData.migrationReadiness.score)}`}>
                  {readinessData.migrationReadiness.score}%
                </span>
              </div>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div 
                className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                style={{ width: `${readinessData.migrationReadiness.score}%` }}
              />
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Executive Checkpoints</span>
                <div className="font-medium">{readinessData.migrationReadiness.factors.executiveCheckpoints}%</div>
              </div>
              <div>
                <span className="text-gray-600">Governance Readiness</span>
                <div className="font-medium">{readinessData.migrationReadiness.factors.governanceReadiness}%</div>
              </div>
              <div>
                <span className="text-gray-600">Rollback Readiness</span>
                <div className="font-medium">{readinessData.migrationReadiness.factors.rollbackReadiness}%</div>
              </div>
              <div>
                <span className="text-gray-600">Orchestration</span>
                <div className="font-medium">{readinessData.migrationReadiness.factors.orchestrationReadiness}%</div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Activation Readiness</h3>
              <div className="flex items-center space-x-2">
                {getTrendIcon(readinessData.activationReadiness.trend)}
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getReadinessBadgeVariant(readinessData.activationReadiness.score)}`}>
                  {readinessData.activationReadiness.score}%
                </span>
              </div>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div 
                className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                style={{ width: `${readinessData.activationReadiness.score}%` }}
              />
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Operational Hardening</span>
                <div className="font-medium">{readinessData.activationReadiness.factors.operationalHardening}%</div>
              </div>
              <div>
                <span className="text-gray-600">Deployment Readiness</span>
                <div className="font-medium">{readinessData.activationReadiness.factors.deploymentReadiness}%</div>
              </div>
              <div>
                <span className="text-gray-600">Emergency Preparedness</span>
                <div className="font-medium">{readinessData.activationReadiness.factors.emergencyPreparedness}%</div>
              </div>
              <div>
                <span className="text-gray-600">Simulation Results</span>
                <div className="font-medium">{readinessData.activationReadiness.factors.simulationResults}%</div>
              </div>
            </div>
          </div>
        </div>

        {/* Operational Hardening Details */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold flex items-center space-x-2">
            <Target className="h-5 w-5" />
            <span>Operational Hardening</span>
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Concurrency Readiness</span>
                <span className={`text-sm font-medium ${getReadinessColor(readinessData.operationalHardening.concurrencyReadiness)}`}>
                  {readinessData.operationalHardening.concurrencyReadiness}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${readinessData.operationalHardening.concurrencyReadiness}%` }}
                />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Retry Protection</span>
                <span className={`text-sm font-medium ${getReadinessColor(readinessData.operationalHardening.retryProtectionReadiness)}`}>
                  {readinessData.operationalHardening.retryProtectionReadiness}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${readinessData.operationalHardening.retryProtectionReadiness}%` }}
                />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Queue Protection</span>
                <span className={`text-sm font-medium ${getReadinessColor(readinessData.operationalHardening.queueProtectionReadiness)}`}>
                  {readinessData.operationalHardening.queueProtectionReadiness}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${readinessData.operationalHardening.queueProtectionReadiness}%` }}
                />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Orchestration Stability</span>
                <span className={`text-sm font-medium ${getReadinessColor(readinessData.operationalHardening.orchestrationStabilityReadiness)}`}>
                  {readinessData.operationalHardening.orchestrationStabilityReadiness}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${readinessData.operationalHardening.orchestrationStabilityReadiness}%` }}
                />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Emergency Stop</span>
                <span className={`text-sm font-medium ${getReadinessColor(readinessData.operationalHardening.emergencyStopReadiness)}`}>
                  {readinessData.operationalHardening.emergencyStopReadiness}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${readinessData.operationalHardening.emergencyStopReadiness}%` }}
                />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Recovery Readiness</span>
                <span className={`text-sm font-medium ${getReadinessColor(readinessData.operationalHardening.recoveryReadinessScore)}`}>
                  {readinessData.operationalHardening.recoveryReadinessScore}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${readinessData.operationalHardening.recoveryReadinessScore}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Deployment Readiness Status */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold flex items-center space-x-2">
            <CheckCircle2 className="h-5 w-5" />
            <span>Deployment Readiness</span>
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex items-center space-x-2">
              {readinessData.deploymentReadiness.infrastructureReady ? 
                <CheckCircle2 className="h-4 w-4 text-green-600" /> : 
                <AlertTriangle className="h-4 w-4 text-red-600" />
              }
              <span className="text-sm">Infrastructure Ready</span>
            </div>
            <div className="flex items-center space-x-2">
              {readinessData.deploymentReadiness.monitoringReady ? 
                <CheckCircle2 className="h-4 w-4 text-green-600" /> : 
                <AlertTriangle className="h-4 w-4 text-red-600" />
              }
              <span className="text-sm">Monitoring Ready</span>
            </div>
            <div className="flex items-center space-x-2">
              {readinessData.deploymentReadiness.rollbackReady ? 
                <CheckCircle2 className="h-4 w-4 text-green-600" /> : 
                <AlertTriangle className="h-4 w-4 text-red-600" />
              }
              <span className="text-sm">Rollback Ready</span>
            </div>
            <div className="flex items-center space-x-2">
              {readinessData.deploymentReadiness.governanceReady ? 
                <CheckCircle2 className="h-4 w-4 text-green-600" /> : 
                <AlertTriangle className="h-4 w-4 text-red-600" />
              }
              <span className="text-sm">Governance Ready</span>
            </div>
          </div>
        </div>

        {/* Last Updated */}
        <div className="flex items-center justify-between text-sm text-gray-600 border-t pt-4">
          <span>Last evaluated: {new Date(readinessData.migrationReadiness.lastEvaluated).toLocaleString()}</span>
          <button className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md hover:bg-gray-50">
            <BarChart3 className="h-4 w-4 mr-2" />
            View Detailed Report
          </button>
        </div>
      </div>
    </div>
  );
}
