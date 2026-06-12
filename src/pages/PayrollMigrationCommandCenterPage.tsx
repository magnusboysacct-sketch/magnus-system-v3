// Payroll Migration Command Center - Phase 2F
// Executive operational dashboards and rollout management UI
// PHASE 2F EXECUTIVE DASHBOARD ONLY — NOT ACTIVE PAYROLL

import React, { useState, useEffect } from 'react';
import { 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  TrendingUp, 
  Users, 
  Shield, 
  Activity,
  Calendar,
  BarChart3,
  Settings,
  Eye
} from 'lucide-react';

import PayrollReadinessDashboard from '../components/PayrollReadinessDashboard';
import PayrollExecutiveRiskPanel from '../components/PayrollExecutiveRiskPanel';
import PayrollGovernanceStatusPanel from '../components/PayrollGovernanceStatusPanel';
import PayrollPilotRolloutPanel from '../components/PayrollPilotRolloutPanel';
import PayrollRollbackReadinessPanel from '../components/PayrollRollbackReadinessPanel';
import PayrollExecutiveAlertsPanel from '../components/PayrollExecutiveAlertsPanel';
import PayrollActivationTimelinePanel from '../components/PayrollActivationTimelinePanel';

// Mock data for safe fallback
const mockExecutiveSummary = {
  migrationReadinessScore: 87,
  activationReadinessScore: 82,
  governanceStatus: 'in_progress' as const,
  pilotRolloutStatus: 'active' as const,
  orchestrationHealth: 'stable' as const,
  rollbackReadiness: 'ready' as const,
  deploymentHardeningScore: 78,
  productionRiskScore: 23,
  totalWorkers: 1247,
  pilotWorkers: 156,
  lastUpdated: new Date().toISOString()
};

const mockAlerts = [
  {
    id: '1',
    severity: 'medium' as const,
    title: 'Governance Approval Pending',
    description: 'Director approval required for pilot expansion',
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    status: 'open' as const
  },
  {
    id: '2',
    severity: 'low' as const,
    title: 'Variance Trend Improving',
    description: 'Net pay variance decreased by 15% this week',
    timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    status: 'resolved' as const
  }
];

export default function PayrollMigrationCommandCenterPage() {
  const [activeTab, setActiveTab] = useState('overview');
  const [executiveData, setExecutiveData] = useState(mockExecutiveSummary);
  const [alerts, setAlerts] = useState(mockAlerts);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadDashboardData = async () => {
      setLoading(true);
      try {
        // Use mock data as safe fallback
        setExecutiveData(mockExecutiveSummary);
        setError(null);
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
        setError('Failed to load dashboard data. Using cached information.');
      } finally {
        setLoading(false);
      }
    };

    loadDashboardData();
  }, []);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-500';
      case 'high': return 'bg-orange-500';
      case 'medium': return 'bg-yellow-500';
      case 'low': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ready': case 'stable': case 'completed': return 'text-green-600';
      case 'partial': case 'in_progress': case 'active': return 'text-yellow-600';
      case 'insufficient': case 'unstable': case 'failed': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getReadinessLevel = (score: number) => {
    if (score >= 90) return { level: 'Excellent', color: 'text-green-600' };
    if (score >= 80) return { level: 'Good', color: 'text-blue-600' };
    if (score >= 70) return { level: 'Fair', color: 'text-yellow-600' };
    return { level: 'Poor', color: 'text-red-600' };
  };

  const migrationReadiness = getReadinessLevel(executiveData.migrationReadinessScore);
  const activationReadiness = getReadinessLevel(executiveData.activationReadinessScore);

  if (loading && !executiveData) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="flex items-center space-x-2">
            <Activity className="h-6 w-6 animate-spin" />
            <span>Loading Command Center...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Payroll Migration Command Center</h1>
          <p className="text-gray-600">
            Executive operational dashboard for Jamaican payroll migration oversight
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            <Eye className="h-4 w-4 mr-1" />
            Read-Only
          </span>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            <Shield className="h-4 w-4 mr-1" />
            Phase 2F
          </span>
        </div>
      </div>

      {error && (
        <div className="border border-orange-200 bg-orange-50 p-4 rounded-lg">
          <div className="flex items-start space-x-2">
            <AlertTriangle className="h-4 w-4 mt-0.5" />
            <div>
              <h4 className="font-medium">Dashboard Warning</h4>
              <p className="text-sm">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Executive Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
          <div className="flex flex-row items-center justify-between space-y-0 pb-2">
            <h3 className="text-sm font-medium">Migration Readiness</h3>
            <TrendingUp className="h-4 w-4 text-gray-600" />
          </div>
          <div className="text-2xl font-bold">{executiveData.migrationReadinessScore}%</div>
          <p className={`text-xs ${migrationReadiness.color}`}>
            {migrationReadiness.level}
          </p>
          <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${executiveData.migrationReadinessScore}%` }}
            />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
          <div className="flex flex-row items-center justify-between space-y-0 pb-2">
            <h3 className="text-sm font-medium">Activation Readiness</h3>
            <Shield className="h-4 w-4 text-gray-600" />
          </div>
          <div className="text-2xl font-bold">{executiveData.activationReadinessScore}%</div>
          <p className={`text-xs ${activationReadiness.color}`}>
            {activationReadiness.level}
          </p>
          <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${executiveData.activationReadinessScore}%` }}
            />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
          <div className="flex flex-row items-center justify-between space-y-0 pb-2">
            <h3 className="text-sm font-medium">Production Risk</h3>
            <AlertTriangle className="h-4 w-4 text-gray-600" />
          </div>
          <div className="text-2xl font-bold">{executiveData.productionRiskScore}%</div>
          <p className="text-xs text-gray-600">
            {executiveData.productionRiskScore < 30 ? 'Low Risk' : 
             executiveData.productionRiskScore < 60 ? 'Moderate Risk' : 'High Risk'}
          </p>
          <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${100 - executiveData.productionRiskScore}%` }}
            />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
          <div className="flex flex-row items-center justify-between space-y-0 pb-2">
            <h3 className="text-sm font-medium">Pilot Coverage</h3>
            <Users className="h-4 w-4 text-gray-600" />
          </div>
          <div className="text-2xl font-bold">
            {Math.round((executiveData.pilotWorkers / executiveData.totalWorkers) * 100)}%
          </div>
          <p className="text-xs text-gray-600">
            {executiveData.pilotWorkers} of {executiveData.totalWorkers} workers
          </p>
          <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${(executiveData.pilotWorkers / executiveData.totalWorkers) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
          <h3 className="text-lg font-semibold mb-4">Governance Status</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Current Status</span>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(executiveData.governanceStatus)}`}>
                {executiveData.governanceStatus.replace('_', ' ').toUpperCase()}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Orchestration Health</span>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(executiveData.orchestrationHealth)}`}>
                {executiveData.orchestrationHealth.toUpperCase()}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Rollback Readiness</span>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(executiveData.rollbackReadiness)}`}>
                {executiveData.rollbackReadiness.toUpperCase()}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
          <h3 className="text-lg font-semibold mb-4">Operational Status</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Pilot Rollout</span>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(executiveData.pilotRolloutStatus)}`}>
                {executiveData.pilotRolloutStatus.replace('_', ' ').toUpperCase()}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Deployment Hardening</span>
              <span className={`text-sm font-medium ${getReadinessLevel(executiveData.deploymentHardeningScore).color}`}>
                {executiveData.deploymentHardeningScore}%
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Last Updated</span>
              <span className="text-sm text-gray-600">
                {new Date(executiveData.lastUpdated).toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
          <h3 className="text-lg font-semibold mb-4">Recent Alerts</h3>
          <div className="space-y-3">
            {alerts.slice(0, 3).map((alert) => (
              <div key={alert.id} className="flex items-start space-x-2">
                <div className={`w-2 h-2 rounded-full mt-1.5 ${getSeverityColor(alert.severity)}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{alert.title}</p>
                  <p className="text-xs text-gray-600">
                    {new Date(alert.timestamp).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
            {alerts.length === 0 && (
              <p className="text-sm text-gray-600">No recent alerts</p>
            )}
          </div>
        </div>
      </div>

      {/* Detailed Dashboard Tabs */}
      <div className="space-y-4">
        <div className="flex space-x-1 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2 text-sm font-medium ${
              activeTab === 'overview'
                ? 'border-b-2 border-blue-500 text-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('readiness')}
            className={`px-4 py-2 text-sm font-medium ${
              activeTab === 'readiness'
                ? 'border-b-2 border-blue-500 text-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Readiness
          </button>
          <button
            onClick={() => setActiveTab('governance')}
            className={`px-4 py-2 text-sm font-medium ${
              activeTab === 'governance'
                ? 'border-b-2 border-blue-500 text-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Governance
          </button>
          <button
            onClick={() => setActiveTab('rollout')}
            className={`px-4 py-2 text-sm font-medium ${
              activeTab === 'rollout'
                ? 'border-b-2 border-blue-500 text-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Rollout
          </button>
        </div>

        <div className="space-y-4">
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <PayrollReadinessDashboard />
              <PayrollExecutiveRiskPanel />
            </div>
          )}

          {activeTab === 'readiness' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <PayrollRollbackReadinessPanel />
              <PayrollActivationTimelinePanel />
            </div>
          )}

          {activeTab === 'governance' && (
            <PayrollGovernanceStatusPanel />
          )}

          {activeTab === 'rollout' && (
            <PayrollPilotRolloutPanel />
          )}
        </div>
      </div>

      {/* Executive Alerts Footer */}
      <PayrollExecutiveAlertsPanel />
    </div>
  );
}
