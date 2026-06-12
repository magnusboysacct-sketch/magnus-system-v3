// Payroll Simulation Status Panel - Phase 3E
// Real-time simulation monitoring and status tracking component
// PHASE 3E PAYROLL SIMULATION ONLY — SHADOW SAFE

import React, { useState, useEffect, useMemo } from "react";
import {
  Activity,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
  Play,
  Pause,
  Square,
  RefreshCw,
  Settings,
  Eye,
  Download,
  Zap,
  Shield,
  Cpu,
  HardDrive,
  Wifi,
  Database,
  Gauge,
  Target,
  TrendingUp,
  TrendingDown,
  BarChart3,
  LineChart,
  PieChart,
  Users,
  Calculator,
  FileText,
  Calendar,
  Timer,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Info,
  AlertCircle,
  CheckCircle2,
  Circle,
  Dot,
  Radio,
  ToggleLeft,
  ToggleRight,
  Power,
  PowerOff,
  Battery,
  BatteryCharging,
  Server,
  Cloud,
  CloudRain,
  CloudSnow,
  Sun,
  Moon,
  Wind,
  Thermometer,
  ThermometerSun
} from "lucide-react";
import { payrollSimulationEngine } from "../lib/payrollSimulationExecution";
import type {
  PayrollSimulationRun,
  PayrollSimulationStatus,
  PayrollSimulationProgress,
  PayrollSimulationHealth,
  PayrollSimulationAlert,
  PayrollSimulationNotification
} from "../lib/payrollSimulationExecution";

function formatDuration(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

function formatDateTime(dateString: string) {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

interface PayrollSimulationStatusPanelProps {
  companyId: string;
  payrollPeriodId: string;
  simulationId?: string;
  onStatusUpdate?: (status: PayrollSimulationStatus) => void;
  readOnly?: boolean;
}

export default function PayrollSimulationStatusPanel({
  companyId,
  payrollPeriodId,
  simulationId,
  onStatusUpdate,
  readOnly = false
}: PayrollSimulationStatusPanelProps) {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'progress' | 'health' | 'alerts'>('overview');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(5000); // 5 seconds

  // Load simulation status
  useEffect(() => {
    async function loadSimulationStatus() {
      try {
        setLoading(true);
        
        // Mock status data (in real implementation, would fetch from database)
        const mockStatus: PayrollSimulationStatus = {
          id: 'status_001',
          simulationId: simulationId || 'sim_001',
          status: {
            current: 'running',
            previous: 'pending',
            estimatedCompletion: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
            confidence: 0.85,
            blockers: [],
            dependencies: ['worker_data_loaded', 'calculation_engine_ready']
          },
          progress: {
            percentage: 65,
            currentStep: 'Executing payroll calculations',
            completedSteps: ['initialization', 'data_loading', 'validation'],
            totalSteps: 8,
            estimatedTimeRemaining: 8 * 60 * 1000,
            milestones: [
              {
                milestoneId: 'mile_001',
                name: 'Environment Setup',
                status: 'completed',
                estimatedTime: 2 * 60 * 1000,
                actualTime: 1.8 * 60 * 1000,
                dependencies: []
              },
              {
                milestoneId: 'mile_002',
                name: 'Data Loading',
                status: 'completed',
                estimatedTime: 5 * 60 * 1000,
                actualTime: 4.2 * 60 * 1000,
                dependencies: ['environment_setup']
              },
              {
                milestoneId: 'mile_003',
                name: 'Validation',
                status: 'completed',
                estimatedTime: 3 * 60 * 1000,
                actualTime: 2.5 * 60 * 1000,
                dependencies: ['data_loading']
              },
              {
                milestoneId: 'mile_004',
                name: 'Calculation',
                status: 'in_progress',
                estimatedTime: 10 * 60 * 1000,
                actualTime: undefined,
                dependencies: ['validation']
              }
            ]
          },
          health: {
            overall: 'healthy',
            components: [
              {
                component: 'calculation_engine',
                status: 'healthy',
                lastCheck: new Date(Date.now() - 30 * 1000).toISOString(),
                responseTime: 150,
                errorRate: 0.02,
                uptime: 0.999,
                issues: []
              },
              {
                component: 'database',
                status: 'healthy',
                lastCheck: new Date(Date.now() - 15 * 1000).toISOString(),
                responseTime: 85,
                errorRate: 0.01,
                uptime: 1.0,
                issues: []
              },
              {
                component: 'memory',
                status: 'degraded',
                lastCheck: new Date(Date.now() - 10 * 1000).toISOString(),
                responseTime: 200,
                errorRate: 0.05,
                uptime: 0.95,
                issues: ['Memory usage approaching threshold']
              },
              {
                component: 'network',
                status: 'healthy',
                lastCheck: new Date(Date.now() - 5 * 1000).toISOString(),
                responseTime: 45,
                errorRate: 0.0,
                uptime: 1.0,
                issues: []
              }
            ],
            resource: {
              cpu: {
                usage: 75,
                capacity: 100,
                status: 'normal',
                trend: 'stable'
              },
              memory: {
                usage: 85,
                capacity: 100,
                status: 'warning',
                trend: 'increasing'
              },
              disk: {
                usage: 45,
                capacity: 100,
                status: 'normal',
                trend: 'stable'
              },
              network: {
                usage: 25,
                capacity: 100,
                status: 'normal',
                trend: 'stable'
              },
              database: {
                usage: 60,
                capacity: 100,
                status: 'normal',
                trend: 'stable'
              }
            },
            performance: {
              throughput: {
                current: 2.5,
                target: 5,
                status: 'good',
                trend: 'stable'
              },
              latency: {
                current: 150,
                target: 250,
                status: 'good',
                trend: 'stable'
              },
              errorRate: {
                current: 0.02,
                target: 0.05,
                status: 'good',
                trend: 'stable'
              },
              queueDepth: {
                current: 5,
                target: 10,
                status: 'good',
                trend: 'stable'
              }
            },
            safety: {
              isolation: {
                status: 'pass',
                lastCheck: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
                details: 'Shadow isolation verified with container isolation method',
                confidence: 0.98
              },
              duplicatePrevention: {
                status: 'pass',
                lastCheck: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
                details: 'Duplicate prevention active and verified',
                confidence: 0.95
              },
              rollbackReadiness: {
                status: 'pass',
                lastCheck: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
                details: 'Rollback readiness verified with standard rollback plan',
                confidence: 0.97
              },
              validation: {
                status: 'pass',
                lastCheck: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
                details: 'Validation checks passed 122/125 with score 97.6%',
                confidence: 0.98
              }
            }
          },
          alerts: [
            {
              alertId: 'alert_001',
              type: 'warning',
              severity: 'medium',
              title: 'Memory Usage High',
              message: 'Memory usage is at 85% - consider monitoring closely',
              component: 'memory',
              timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
              acknowledged: false,
              resolved: false
            },
            {
              alertId: 'alert_002',
              type: 'info',
              severity: 'low',
              title: 'Calculation Progress',
              message: '65% of calculations completed successfully',
              component: 'calculation_engine',
              timestamp: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
              acknowledged: true,
              acknowledgedBy: 'system',
              acknowledgedAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
              resolved: false
            }
          ],
          notifications: [
            {
              notificationId: 'notif_001',
              type: 'status',
              channel: 'ui',
              recipients: ['current_user'],
              subject: 'Simulation Progress Update',
              message: '65% complete - ETA: 8 minutes',
              timestamp: new Date(Date.now() - 1 * 60 * 1000).toISOString(),
              sent: true,
              read: true,
              readAt: new Date(Date.now() - 1 * 60 * 1000).toISOString()
            }
          ],
          metadata: {
            updatedAt: new Date().toISOString(),
            updatedBy: 'system',
            nextUpdate: new Date(Date.now() + refreshInterval).toISOString(),
            refreshInterval: refreshInterval
          }
        };
        
        setStatus(mockStatus);
      } catch (error) {
        console.error("Error loading simulation status:", error);
      } finally {
        setLoading(false);
      }
    }

    loadSimulationStatus();
  }, [companyId, payrollPeriodId, simulationId]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh || !status) return;

    const interval = setInterval(() => {
      // In real implementation, would fetch updated status
      if (status) {
        setStatus((prev: any) => {
          if (!prev) return prev;
          return {
            ...prev,
            metadata: {
              ...prev.metadata,
              updatedAt: new Date().toISOString()
            }
          };
        });
      }
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, status, refreshInterval]);

  // Calculate overall health score
  const overallHealthScore = useMemo(() => {
    if (!status) return 0;
    
    const componentScores: number[] = status.health.components.map((comp: any) => 
      comp.status === 'healthy' ? 100 : 
      comp.status === 'degraded' ? 75 : 
      comp.status === 'unhealthy' ? 25 : 0
    );
    
    return componentScores.reduce((sum, score) => sum + score, 0) / componentScores.length;
  }, [status]);

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mr-3" />
          <span className="text-gray-600">Loading simulation status...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Status Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Simulation Status</h3>
            <p className="text-sm text-gray-600">Real-time monitoring and health status</p>
          </div>
          <div className="flex items-center space-x-2">
            <div className="flex items-center space-x-2">
              <div className={`w-3 h-3 rounded-full ${
                status?.status.current === 'running' ? 'bg-blue-600 animate-pulse' :
                status?.status.current === 'completed' ? 'bg-green-600' :
                status?.status.current === 'failed' ? 'bg-red-600' :
                status?.status.current === 'paused' ? 'bg-yellow-600' :
                'bg-gray-600'
              }`}></div>
              <span className="text-sm font-medium text-gray-900 capitalize">
                {status?.status.current || 'Unknown'}
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
            <span className="text-sm text-gray-600">Auto-refresh</span>
          </div>
          <button className="text-gray-600 hover:text-gray-900">
            <RefreshCw className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8 px-6" aria-label="Tabs">
          {[
            { id: 'overview', name: 'Overview', icon: Activity },
            { id: 'progress', name: 'Progress', icon: BarChart3 },
            { id: 'health', name: 'Health', icon: Gauge },
            { id: 'alerts', name: 'Alerts', icon: AlertTriangle }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2`}
            >
              <tab.icon className="h-4 w-4" />
              <span>{tab.name}</span>
            </button>
          ))}
        </nav>
      </div>

      <div className="p-6">
        {/* Overview Tab */}
        {activeTab === 'overview' && status && (
          <div className="space-y-6">
            {/* Status Overview */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <div className="text-sm text-gray-600">Current Status</div>
                <div className="text-2xl font-bold text-gray-900 capitalize">
                  {status.status.current}
                </div>
              </div>
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <div className="text-sm text-blue-600">Progress</div>
                <div className="text-2xl font-bold text-blue-900">
                  {status.progress.percentage}%
                </div>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <div className="text-sm text-green-600">Confidence</div>
                <div className="text-2xl font-bold text-green-900">
                  {formatPercent(status.status.confidence * 100)}
                </div>
              </div>
              <div className="text-center p-4 bg-purple-50 rounded-lg">
                <div className="text-sm text-purple-600">Health Score</div>
                <div className="text-2xl font-bold text-purple-900">
                  {formatPercent(overallHealthScore)}
                </div>
              </div>
            </div>

            {/* Current Step */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="text-md font-semibold text-gray-900 mb-2">Current Step</h4>
              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                    <span className="text-white text-sm font-bold">
                      {status.progress.completedSteps.length + 1}
                    </span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-600" />
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900">{status.progress.currentStep}</div>
                  <div className="text-sm text-gray-600">
                    Step {status.progress.completedSteps.length + 1} of {status.progress.totalSteps}
                  </div>
                </div>
              </div>
            </div>

            {/* Estimated Completion */}
            <div className="bg-blue-50 rounded-lg p-4">
              <h4 className="text-md font-semibold text-gray-900 mb-2">Estimated Completion</h4>
              <div className="flex items-center space-x-3">
                <Clock className="h-5 w-5 text-blue-600" />
                <div>
                  <div className="text-sm font-medium text-gray-900">
                    {status.status.estimatedCompletion ? formatDateTime(status.status.estimatedCompletion) : 'Not available'}
                  </div>
                  <div className="text-sm text-gray-600">
                    ({formatDuration(status.progress.estimatedTimeRemaining)} remaining)
                  </div>
                </div>
              </div>
            </div>

            {/* Resource Usage */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="text-md font-semibold text-gray-900 mb-3">Resource Usage</h4>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">CPU</span>
                    <div className="flex items-center space-x-2">
                      <div className="w-20 bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-blue-600 h-2 rounded-full" 
                          style={{ width: `${status.health.resource.cpu.usage}%` }}
                        ></div>
                      </div>
                      <span className="text-sm font-medium text-gray-900">
                        {status.health.resource.cpu.usage}%
                      </span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Memory</span>
                    <div className="flex items-center space-x-2">
                      <div className="w-20 bg-gray-200 rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full ${
                            status.health.resource.memory.status === 'normal' ? 'bg-green-600' :
                            status.health.resource.memory.status === 'warning' ? 'bg-yellow-600' :
                            'bg-red-600'
                          }`}
                          style={{ width: `${status.health.resource.memory.usage}%` }}
                        ></div>
                      </div>
                      <span className={`text-sm font-medium ${
                        status.health.resource.memory.status === 'normal' ? 'text-green-900' :
                        status.health.resource.memory.status === 'warning' ? 'text-yellow-900' :
                        'text-red-900'
                      }`}>
                        {status.health.resource.memory.usage}%
                      </span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Database</span>
                    <div className="flex items-center space-x-2">
                      <div className="w-20 bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-purple-600 h-2 rounded-full" 
                          style={{ width: `${status.health.resource.database.usage}%` }}
                        ></div>
                      </div>
                      <span className="text-sm font-medium text-purple-900">
                        {status.health.resource.database.usage}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-md font-semibold text-gray-900 mb-3">Performance Metrics</h4>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Throughput</span>
                    <span className="text-sm font-medium text-gray-900">
                      {status.health.performance.throughput.current} workers/sec
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Avg Latency</span>
                    <span className="text-sm font-medium text-gray-900">
                      {status.health.performance.latency.current}ms
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Error Rate</span>
                    <span className="text-sm font-medium text-gray-900">
                      {formatPercent(status.health.performance.errorRate.current * 100)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Progress Tab */}
        {activeTab === 'progress' && status && (
          <div className="space-y-6">
            {/* Progress Overview */}
            <div className="bg-gray-50 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-md font-semibold text-gray-900">Overall Progress</h4>
                <div className="text-2xl font-bold text-blue-900">
                  {status.progress.percentage}%
                </div>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-4">
                <div 
                  className="bg-blue-600 h-4 rounded-full transition-all duration-300" 
                  style={{ width: `${status.progress.percentage}%` }}
                ></div>
              </div>
            </div>

            {/* Milestones */}
            <div>
              <h4 className="text-md font-semibold text-gray-900 mb-4">Milestones</h4>
              <div className="space-y-4">
                {status.progress.milestones.map((milestone: any, index: any) => (
                  <div key={milestone.milestoneId} className="flex items-center space-x-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      milestone.status === 'completed' ? 'bg-green-600' :
                      milestone.status === 'in_progress' ? 'bg-blue-600' :
                      'bg-gray-400'
                    }`}>
                      {milestone.status === 'completed' && <CheckCircle className="h-4 w-4 text-white" />}
                      {milestone.status === 'in_progress' && <Loader2 className="h-4 w-4 text-white animate-spin" />}
                      {milestone.status === 'pending' && <Circle className="h-4 w-4 text-gray-300" />}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900">{milestone.name}</div>
                      <div className="text-xs text-gray-600">
                        {milestone.estimatedTime ? `Est: ${formatDuration(milestone.estimatedTime)}` : 'No estimate'}
                        {milestone.actualTime && ` | Actual: ${formatDuration(milestone.actualTime)}`}
                      </div>
                      {milestone.dependencies.length > 0 && (
                        <div className="text-xs text-gray-500">
                          Depends on: {milestone.dependencies.join(', ')}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Health Tab */}
        {activeTab === 'health' && status && (
          <div className="space-y-6">
            {/* Health Overview */}
            <div className="bg-gray-50 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-md font-semibold text-gray-900">Overall Health</h4>
                <div className="text-2xl font-bold text-green-900">
                  {formatPercent(overallHealthScore)}
                </div>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-4">
                <div 
                  className={`h-4 rounded-full ${
                    overallHealthScore >= 90 ? 'bg-green-600' :
                    overallHealthScore >= 70 ? 'bg-yellow-600' :
                    overallHealthScore >= 50 ? 'bg-orange-600' :
                    'bg-red-600'
                  }`}
                  style={{ width: `${overallHealthScore}%` }}
                ></div>
              </div>
            </div>

            {/* Component Health */}
            <div>
              <h4 className="text-md font-semibold text-gray-900 mb-4">Component Health</h4>
              <div className="space-y-4">
                {status.health.components.map((component: any, index: any) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <h5 className="text-sm font-medium text-gray-900">{component.component}</h5>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            component.status === 'healthy' ? 'bg-green-100 text-green-800' :
                            component.status === 'degraded' ? 'bg-yellow-100 text-yellow-800' :
                            component.status === 'unhealthy' ? 'bg-red-100 text-red-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {component.status}
                          </span>
                        </div>
                        <div className="text-sm text-gray-600">
                          Last check: {formatDateTime(component.lastCheck)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium text-gray-900">
                          {formatPercent(component.uptime * 100)} uptime
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs mt-2">
                      <div>
                        <span className="text-gray-600">Response Time</span>
                        <div className="font-medium text-gray-900">{component.responseTime}ms</div>
                      </div>
                      <div>
                        <span className="text-gray-600">Error Rate</span>
                        <div className="font-medium text-gray-900">{formatPercent(component.errorRate * 100)}</div>
                      </div>
                      <div>
                        <span className="text-gray-600">Issues</span>
                        <div className="font-medium text-gray-900">{component.issues.length}</div>
                      </div>
                    </div>
                    {component.issues.length > 0 && (
                      <div className="mt-2 text-xs text-gray-600">
                        {component.issues.map((issue: any, index: any) => (
                          <div key={index}>• {issue}</div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Resource Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="text-md font-semibold text-gray-900 mb-3">Resource Details</h4>
                <div className="space-y-3">
                  <div className="text-sm">
                    <div className="font-medium text-gray-900 mb-1">CPU</div>
                    <div className="text-gray-600">
                      Usage: {status.health.resource.cpu.usage}% (Capacity: {status.health.resource.cpu.capacity})
                    </div>
                    <div className="text-gray-600">
                      Status: {status.health.resource.cpu.status}
                    </div>
                  </div>
                  <div className="text-sm">
                    <div className="font-medium text-gray-900 mb-1">Memory</div>
                    <div className="text-gray-600">
                      Usage: {status.health.resource.memory.usage}% (Capacity: {status.health.resource.memory.capacity})
                    </div>
                    <div className="text-gray-600">
                      Status: {status.health.resource.memory.status}
                    </div>
                    <div className="text-gray-600">
                      Trend: {status.health.resource.memory.trend}
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-md font-semibold text-gray-900 mb-3">Safety Status</h4>
                <div className="space-y-3">
                  <div className="text-sm">
                    <div className="font-medium text-gray-900 mb-1">Isolation</div>
                    <div className="text-gray-600">
                    </div>
                    <div className="text-gray-600">
                      Last Execution: {status.health.safety.duplicatePrevention.details}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Alerts Tab */}
        {activeTab === 'alerts' && status && (
          <div className="space-y-6">
            {/* Active Alerts */}
            <div>
              <h4 className="text-md font-semibold text-gray-900 mb-4">Active Alerts</h4>
              <div className="space-y-3">
                {status.alerts.filter((alert: any) => !alert.resolved).map((alert: any) => (
                  <div key={alert.alertId} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-start space-x-3">
                      <div className={`mt-1 w-2 h-2 rounded-full ${
                        alert.severity === 'critical' ? 'bg-red-600' :
                        alert.severity === 'high' ? 'bg-orange-600' :
                        alert.severity === 'medium' ? 'bg-yellow-600' :
                        'bg-blue-600'
                      }`}></div>
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-2">
                          <h5 className="text-sm font-medium text-gray-900">{alert.title}</h5>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            alert.severity === 'critical' ? 'bg-red-100 text-red-800' :
                            alert.severity === 'high' ? 'bg-orange-100 text-orange-800' :
                            alert.severity === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-blue-100 text-blue-800'
                          }`}>
                            {alert.severity}
                          </span>
                          {!alert.acknowledged && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                              NEW
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-gray-600 mb-2">{alert.message}</div>
                        <div className="text-xs text-gray-500">
                          Component: {alert.component} | {formatDateTime(alert.timestamp)}
                        </div>
                        {!alert.acknowledged && (
                          <div className="mt-2 flex items-center space-x-2">
                            <button className="text-blue-600 hover:text-blue-700 text-sm">
                              Acknowledge
                            </button>
                            <button className="text-gray-600 hover:text-gray-700 text-sm">
                              Dismiss
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Resolved Alerts */}
            {status.alerts.filter((alert: any) => alert.resolved).length > 0 && (
              <div>
                <h4 className="text-md font-semibold text-gray-900 mb-4">Resolved Alerts</h4>
                <div className="space-y-3">
                  {status.alerts.filter((alert: any) => alert.resolved).map((alert: any) => (
                    <div key={alert.alertId} className="border border-gray-200 rounded-lg p-4 opacity-60">
                      <div className="flex items-start space-x-3">
                        <div className="mt-1 w-2 h-2 rounded-full bg-green-600"></div>
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-2">
                            <h5 className="text-sm font-medium text-gray-900 line-through">{alert.title}</h5>
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              RESOLVED
                            </span>
                          </div>
                          <div className="text-sm text-gray-600 mb-2">{alert.message}</div>
                          <div className="text-xs text-gray-500">
                            {alert.acknowledgedBy && `Acknowledged by ${alert.acknowledgedBy} at ${formatDateTime(alert.acknowledgedAt || '')}`}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
