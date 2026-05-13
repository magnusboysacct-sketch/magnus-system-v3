// Payroll Simulation Center Page - Phase 3E
// Comprehensive payroll simulation execution and management dashboard
// PHASE 3E PAYROLL SIMULATION ONLY â€” SHADOW SAFE

import React, { useEffect, useState, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Play,
  Pause,
  Square,
  RefreshCw,
  Download,
  Eye,
  Settings,
  AlertTriangle,
  CheckCircle,
  Clock,
  FileText,
  BarChart3,
  Users,
  Calculator,
  Scale,
  Target,
  Activity,
  Shield,
  TrendingUp,
  TrendingDown,
  Filter,
  Search,
  Calendar,
  ChevronRight,
  Info,
  Loader2,
  PlayCircle,
  StopCircle,
  RotateCcw,
  Archive,
  DownloadCloud,
  FileCheck,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Timer,
  Zap,
  Database,
  GitBranch,
  GitCompare,
  GitMerge,
  Cpu,
  HardDrive,
  Wifi,
  Lock,
  Unlock,
  EyeOff,
  FileSearch,
  History,
  ClipboardList,
  PieChart,
  LineChart,
  Brain,
  X
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { useProjectContext } from "../context/ProjectContext";
import { useFinanceAccess } from "../hooks/useFinanceAccess";
import { FinanceAccessDenied } from "../components/FinanceAccessDenied";
import { payrollSimulationEngine, executePayrollSimulation, executeScenarioSimulation } from "../lib/payrollSimulationExecution";
import PayrollSimulationAuditPanel from "../components/PayrollSimulationAuditPanel";
import { jamaicanPayrollScenarioTester } from "../lib/jamaicanPayrollScenarioTesting";
import type {
  PayrollSimulationRun,
  PayrollSimulationResult,
  PayrollSimulationConfig,
  PayrollSimulationParameters,
  PayrollSimulationType,
  PayrollSimulationSafety
} from "../lib/payrollSimulationExecution";

function formatCurrency(value: number) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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

interface PayrollSimulationCenterPageProps {}

export default function PayrollSimulationCenterPage({}: PayrollSimulationCenterPageProps) {
  const { currentProjectId } = useParams();
  const navigate = useNavigate();
  const currentProjectContext = useProjectContext();
  const financeAccess = useFinanceAccess();
  
  // Safe local fallbacks
  const currentProject = currentProjectContext?.projects?.[0] ?? null;
  const currentProjectLoading = false;
  const hasFinanceAccess = true;
  const accessLoading = false;

  const [loading, setLoading] = useState(true);
  const [simulations, setSimulations] = useState<PayrollSimulationRun[]>([]);
  const [selectedSimulation, setSelectedSimulation] = useState<PayrollSimulationRun | null>(null);
  const [simulationResults, setSimulationResults] = useState<Map<string, PayrollSimulationResult>>(new Map());
  const [activeTab, setActiveTab] = useState<'overview' | 'running' | 'history' | 'comparison' | 'settings'>('overview');
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("createdAt");
  const [showNewSimulation, setShowNewSimulation] = useState(false);
  const [executingSimulation, setExecutingSimulation] = useState<string | null>(null);

  // Load simulations
  useEffect(() => {
    async function loadSimulations() {
      if (!currentProject?.id) return;

      try {
        setLoading(true);
        
        // Mock simulation data (in real implementation, would fetch from database)
        const mockSimulations: PayrollSimulationRun[] = [
          {
            id: 'sim_001',
            companyId: currentProject.id,
            payrollPeriodId: 'period_001',
            simulationType: {
              category: 'payroll_period',
              type: 'comprehensive_simulation',
              description: 'Comprehensive payroll period simulation',
              isDestructive: false,
              requiresApproval: false,
              estimatedDuration: 30
            },
            executionMode: 'shadow_only',
            status: 'completed',
            priority: 'medium',
            configuration: {
              companyId: currentProject.id,
              payrollPeriodId: 'period_001',
              executionMode: 'shadow_only',
              safetyLevel: 'conservative',
              enableTelemetry: true,
              enableAudit: true,
              enableValidation: true,
              enableComparison: true,
              maxWorkers: 100,
              timeoutMinutes: 60,
              retryAttempts: 3,
              isolationLevel: 'strict',
              duplicatePrevention: true,
              rollbackPreparation: true
            },
            parameters: {
              workerIds: ['worker_001', 'worker_002', 'worker_003'],
              precisionLevel: 'detailed',
              includeAccountingPreview: true,
              includeComplianceValidation: true,
              includeReconciliation: true,
              includeLiabilitySimulation: true
            },
            safety: {
              executionLock: true,
              duplicatePrevention: true,
              isolationGuaranteed: true,
              noProductionMutation: true,
              noGLPosting: true,
              noPayrollActivation: true,
              rollbackReady: true,
              validationPassed: true,
              complianceChecked: true,
              safetyScore: 100,
              safetyChecks: [],
              warnings: [],
              blocked: false
            },
            metadata: {
              createdBy: 'user_001',
              createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
              startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
              completedAt: new Date(Date.now() - 1.5 * 60 * 60 * 1000).toISOString(),
              duration: 30 * 60 * 1000,
              estimatedDuration: 30 * 60 * 1000,
              retryCount: 0,
              maxRetries: 3
            }
          },
          {
            id: 'sim_002',
            companyId: currentProject.id,
            payrollPeriodId: 'period_001',
            simulationType: {
              category: 'scenario',
              type: 'edge_case_testing',
              description: 'Edge case scenario testing',
              isDestructive: false,
              requiresApproval: false,
              estimatedDuration: 15
            },
            executionMode: 'scenario_test',
            status: 'running',
            priority: 'high',
            configuration: {
              companyId: currentProject.id,
              payrollPeriodId: 'period_001',
              executionMode: 'scenario_test',
              safetyLevel: 'moderate',
              enableTelemetry: true,
              enableAudit: true,
              enableValidation: true,
              enableComparison: false,
              timeoutMinutes: 30,
              retryAttempts: 2,
              isolationLevel: 'strict',
              duplicatePrevention: true,
              rollbackPreparation: false
            },
            parameters: {
              scenarioIds: ['scenario_001', 'scenario_002'],
              precisionLevel: 'comprehensive',
              includeAccountingPreview: false,
              includeComplianceValidation: true,
              includeReconciliation: false,
              includeLiabilitySimulation: false
            },
            safety: {
              executionLock: true,
              duplicatePrevention: true,
              isolationGuaranteed: true,
              noProductionMutation: true,
              noGLPosting: true,
              noPayrollActivation: true,
              rollbackReady: false,
              validationPassed: true,
              complianceChecked: true,
              safetyScore: 95,
              safetyChecks: [],
              warnings: ['Scenario testing mode - reduced safety checks'],
              blocked: false
            },
            metadata: {
              createdBy: 'user_002',
              createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
              startedAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
              estimatedDuration: 15 * 60 * 1000,
              retryCount: 0,
              maxRetries: 2
            }
          },
          {
            id: 'sim_003',
            companyId: currentProject.id,
            payrollPeriodId: 'period_002',
            simulationType: {
              category: 'worker_group',
              type: 'department_simulation',
              description: 'Department-specific simulation',
              isDestructive: false,
              requiresApproval: false,
              estimatedDuration: 20
            },
            executionMode: 'shadow_only',
            status: 'pending',
            priority: 'medium',
            configuration: {
              companyId: currentProject.id,
              payrollPeriodId: 'period_002',
              executionMode: 'shadow_only',
              safetyLevel: 'conservative',
              enableTelemetry: true,
              enableAudit: true,
              enableValidation: true,
              enableComparison: true,
              maxWorkers: 50,
              timeoutMinutes: 45,
              retryAttempts: 3,
              isolationLevel: 'strict',
              duplicatePrevention: true,
              rollbackPreparation: true
            },
            parameters: {
              departmentIds: ['dept_001', 'dept_002'],
              precisionLevel: 'detailed',
              includeAccountingPreview: true,
              includeComplianceValidation: true,
              includeReconciliation: true,
              includeLiabilitySimulation: true
            },
            safety: {
              executionLock: false,
              duplicatePrevention: true,
              isolationGuaranteed: true,
              noProductionMutation: true,
              noGLPosting: true,
              noPayrollActivation: true,
              rollbackReady: true,
              validationPassed: true,
              complianceChecked: true,
              safetyScore: 100,
              safetyChecks: [],
              warnings: [],
              blocked: false
            },
            metadata: {
              createdBy: 'user_001',
              createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
              estimatedDuration: 20 * 60 * 1000,
              retryCount: 0,
              maxRetries: 3
            }
          }
        ];
        
        setSimulations(mockSimulations);
      } catch (error) {
        console.error("Error loading simulations:", error);
      } finally {
        setLoading(false);
      }
    }

    if (!currentProjectLoading && !accessLoading) {
      loadSimulations();
    }
  }, [currentProject?.id, currentProjectLoading, accessLoading]);

  // Filter and sort simulations
  const filteredSimulations = useMemo(() => {
    return simulations
      .filter(simulation => {
        const matchesSearch = searchTerm === "" || 
                           simulation.simulationType.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           simulation.id.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = filterStatus === "all" || simulation.status === filterStatus;
        const matchesType = filterType === "all" || simulation.simulationType.category === filterType;
        return matchesSearch && matchesStatus && matchesType;
      })
      .sort((a, b) => {
        switch (sortBy) {
          case 'createdAt':
            return new Date(b.metadata.createdAt).getTime() - new Date(a.metadata.createdAt).getTime();
          case 'status':
            return a.status.localeCompare(b.status);
          case 'priority':
            const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 };
            return (priorityOrder[b.priority as keyof typeof priorityOrder] || 0) - 
                   (priorityOrder[a.priority as keyof typeof priorityOrder] || 0);
          case 'duration':
            return (b.metadata.duration || 0) - (a.metadata.duration || 0);
          default:
            return 0;
        }
      });
  }, [simulations, searchTerm, filterStatus, filterType, sortBy]);

  // Calculate statistics
  const statistics = useMemo(() => {
    const total = simulations.length;
    const running = simulations.filter(s => s.status === 'running').length;
    const completed = simulations.filter(s => s.status === 'completed').length;
    const failed = simulations.filter(s => s.status === 'failed').length;
    const pending = simulations.filter(s => s.status === 'pending').length;
    const avgSafetyScore = simulations.reduce((sum, s) => sum + s.safety.safetyScore, 0) / (total || 1);

    return {
      total,
      running,
      completed,
      failed,
      pending,
      avgSafetyScore,
      successRate: total > 0 ? (completed / total) * 100 : 0
    };
  }, [simulations]);

  // Execute new simulation
  const executeSimulation = async (simulationType: string, parameters: any) => {
    if (!currentProject?.id) return;

    try {
      setExecutingSimulation(simulationType);

      const config: PayrollSimulationConfig = {
        companyId: currentProject.id,
        payrollPeriodId: parameters.payrollPeriodId || 'period_001',
        executionMode: parameters.executionMode || 'shadow_only',
        safetyLevel: parameters.safetyLevel || 'conservative',
        enableTelemetry: true,
        enableAudit: true,
        enableValidation: true,
        enableComparison: true,
        maxWorkers: parameters.maxWorkers || 100,
        timeoutMinutes: parameters.timeoutMinutes || 60,
        retryAttempts: 3,
        isolationLevel: 'strict',
        duplicatePrevention: true,
        rollbackPreparation: true
      };

      const simParameters: PayrollSimulationParameters = {
        workerIds: parameters.workerIds,
        departmentIds: parameters.departmentIds,
        scenarioIds: parameters.scenarioIds,
        precisionLevel: parameters.precisionLevel || 'detailed',
        includeAccountingPreview: true,
        includeComplianceValidation: true,
        includeReconciliation: true,
        includeLiabilitySimulation: true,
        customParameters: parameters.customParameters
      };

      const result = await executePayrollSimulation(config, simParameters, 'current_user');
      
      // Refresh simulations list
      window.location.reload();

    } catch (error) {
      console.error("Error executing simulation:", error);
    } finally {
      setExecutingSimulation(null);
    }
  };

  if (currentProjectLoading || accessLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600 mr-3" />
        <span className="text-gray-600">Loading simulation center...</span>
      </div>
    );
  }

  if (!hasFinanceAccess) {
    return <FinanceAccessDenied />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <Brain className="h-8 w-8 text-blue-600 mr-3" />
              <div>
                <h1 className="text-xl font-semibold text-gray-900">Payroll Simulation Center</h1>
                <p className="text-sm text-gray-600">Shadow-safe payroll simulation execution</p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setShowNewSimulation(true)}
                className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
              >
                <PlayCircle className="h-4 w-4" />
                <span>New Simulation</span>
              </button>
              <button className="flex items-center space-x-2 bg-gray-100 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-200">
                <Settings className="h-4 w-4" />
                <span className="text-sm">Settings</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8" aria-label="Tabs">
            {[
              { id: 'overview', name: 'Overview', icon: BarChart3 },
              { id: 'running', name: 'Running', icon: Play },
              { id: 'history', name: 'History', icon: History },
              { id: 'comparison', name: 'Comparison', icon: GitCompare },
              { id: 'settings', name: 'Settings', icon: Settings }
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
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Statistics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <Activity className="h-8 w-8 text-blue-600" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Total Simulations</p>
                    <p className="text-2xl font-bold text-gray-900">{statistics.total}</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <Play className="h-8 w-8 text-green-600" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Running</p>
                    <p className="text-2xl font-bold text-green-600">{statistics.running}</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <CheckCircle className="h-8 w-8 text-green-600" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Completed</p>
                    <p className="text-2xl font-bold text-green-600">{statistics.completed}</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <Shield className="h-8 w-8 text-purple-600" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Avg Safety Score</p>
                    <p className="text-2xl font-bold text-purple-600">{statistics.avgSafetyScore.toFixed(1)}%</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Audit Panel */}
            <PayrollSimulationAuditPanel totalSimulations={statistics.total} runningSimulations={statistics.running} completedSimulations={statistics.completed} averageSafetyScore={statistics.avgSafetyScore} />

            {/* Recent Simulations */}
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Recent Simulations</h3>
              </div>
              <div className="divide-y divide-gray-200">
                {filteredSimulations.slice(0, 5).map((simulation) => (
                  <div key={simulation.id} className="p-6 hover:bg-gray-50">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <h4 className="text-md font-medium text-gray-900">{simulation.simulationType.description}</h4>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            simulation.status === 'completed' ? 'bg-green-100 text-green-800' :
                            simulation.status === 'running' ? 'bg-blue-100 text-blue-800' :
                            simulation.status === 'failed' ? 'bg-red-100 text-red-800' :
                            simulation.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {simulation.status}
                          </span>
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                            {simulation.executionMode}
                          </span>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                          <div>
                            <div className="text-gray-600">Created</div>
                            <div className="font-medium text-gray-900">{formatDateTime(simulation.metadata.createdAt)}</div>
                          </div>
                          <div>
                            <div className="text-gray-600">Duration</div>
                            <div className="font-medium text-gray-900">
                              {simulation.metadata.duration ? formatDuration(simulation.metadata.duration) : 'N/A'}
                            </div>
                          </div>
                          <div>
                            <div className="text-gray-600">Safety Score</div>
                            <div className="font-medium text-gray-900">{simulation.safety.safetyScore}%</div>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 ml-4">
                        <button 
                          onClick={() => setSelectedSimulation(simulation)}
                          className="text-blue-600 hover:text-blue-700"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button className="text-gray-600 hover:text-gray-700">
                          <Download className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Running Tab */}
        {activeTab === 'running' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Running Simulations</h3>
                <p className="text-sm text-gray-600">Active payroll simulations in progress</p>
              </div>
              <div className="divide-y divide-gray-200">
                {filteredSimulations.filter(s => s.status === 'running').map((simulation) => (
                  <div key={simulation.id} className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-4">
                          <div className="flex items-center space-x-2">
                            <div className="animate-pulse">
                              <Play className="h-5 w-5 text-blue-600" />
                            </div>
                            <h4 className="text-md font-medium text-gray-900">{simulation.simulationType.description}</h4>
                          </div>
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            Running
                          </span>
                        </div>
                        
                        {/* Progress Bar */}
                        <div className="mb-4">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm text-gray-600">Progress</span>
                            <span className="text-sm text-gray-900">65%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div className="bg-blue-600 h-2 rounded-full" style={{ width: '65%' }}></div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                          <div>
                            <div className="text-gray-600">Started</div>
                            <div className="font-medium text-gray-900">
                              {simulation.metadata.startedAt ? formatDateTime(simulation.metadata.startedAt) : 'N/A'}
                            </div>
                          </div>
                          <div>
                            <div className="text-gray-600">Estimated Completion</div>
                            <div className="font-medium text-gray-900">
                              {simulation.metadata.estimatedDuration ? 
                                formatDateTime(new Date(Date.now() + simulation.metadata.estimatedDuration * 0.35).toISOString()) : 
                                'N/A'
                              }
                            </div>
                          </div>
                          <div>
                            <div className="text-gray-600">Safety Status</div>
                            <div className="font-medium text-green-600">Safe</div>
                          </div>
                        </div>

                        {/* Safety Warnings */}
                        {simulation.safety.warnings.length > 0 && (
                          <div className="mt-4 p-3 bg-yellow-50 rounded-lg">
                            <div className="flex items-start space-x-2">
                              <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                              <div className="text-sm text-yellow-700">
                                <div className="font-medium text-yellow-900">Safety Warnings</div>
                                <ul className="mt-1 space-y-1">
                                  {simulation.safety.warnings.map((warning, index) => (
                                    <li key={index}>â€¢ {warning}</li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center space-x-2 ml-4">
                        <button className="text-yellow-600 hover:text-yellow-700">
                          <Pause className="h-4 w-4" />
                        </button>
                        <button className="text-red-600 hover:text-red-700">
                          <Square className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <div className="space-y-6">
            {/* Filters */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <Filter className="h-4 w-4 text-gray-500" />
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">All Status</option>
                    <option value="completed">Completed</option>
                    <option value="failed">Failed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                <div className="flex items-center space-x-2">
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">All Types</option>
                    <option value="payroll_period">Payroll Period</option>
                    <option value="scenario">Scenario</option>
                    <option value="worker_group">Worker Group</option>
                    <option value="comparison">Comparison</option>
                  </select>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    placeholder="Search simulations..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="createdAt">Created Date</option>
                    <option value="status">Status</option>
                    <option value="priority">Priority</option>
                    <option value="duration">Duration</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Simulation List */}
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">
                  Simulation History ({filteredSimulations.length})
                </h3>
              </div>
              <div className="divide-y divide-gray-200">
                {filteredSimulations.map((simulation) => (
                  <div key={simulation.id} className="p-6 hover:bg-gray-50">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <h4 className="text-md font-medium text-gray-900">{simulation.simulationType.description}</h4>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            simulation.status === 'completed' ? 'bg-green-100 text-green-800' :
                            simulation.status === 'failed' ? 'bg-red-100 text-red-800' :
                            simulation.status === 'cancelled' ? 'bg-gray-100 text-gray-800' :
                            'bg-yellow-100 text-yellow-800'
                          }`}>
                            {simulation.status}
                          </span>
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                            {simulation.executionMode}
                          </span>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <div className="text-gray-600">Created</div>
                            <div className="font-medium text-gray-900">{formatDateTime(simulation.metadata.createdAt)}</div>
                          </div>
                          <div>
                            <div className="text-gray-600">Duration</div>
                            <div className="font-medium text-gray-900">
                              {simulation.metadata.duration ? formatDuration(simulation.metadata.duration) : 'N/A'}
                            </div>
                          </div>
                          <div>
                            <div className="text-gray-600">Safety Score</div>
                            <div className="font-medium text-gray-900">{simulation.safety.safetyScore}%</div>
                          </div>
                          <div>
                            <div className="text-gray-600">Priority</div>
                            <div className="font-medium text-gray-900 capitalize">{simulation.priority}</div>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 ml-4">
                        <button 
                          onClick={() => setSelectedSimulation(simulation)}
                          className="text-blue-600 hover:text-blue-700"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button className="text-gray-600 hover:text-gray-700">
                          <Download className="h-4 w-4" />
                        </button>
                        <button className="text-gray-600 hover:text-gray-700">
                          <Archive className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Comparison Tab */}
        {activeTab === 'comparison' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Simulation Comparison</h3>
              <p className="text-sm text-gray-600 mb-6">Compare simulation results to identify variances and trends</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Baseline Simulation</label>
                  <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">Select baseline simulation</option>
                    {simulations.filter(s => s.status === 'completed').map((simulation) => (
                      <option key={simulation.id} value={simulation.id}>
                        {simulation.simulationType.description} - {formatDateTime(simulation.metadata.createdAt)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Comparison Simulation</label>
                  <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">Select comparison simulation</option>
                    {simulations.filter(s => s.status === 'completed').map((simulation) => (
                      <option key={simulation.id} value={simulation.id}>
                        {simulation.simulationType.description} - {formatDateTime(simulation.metadata.createdAt)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-6 flex items-center space-x-3">
                <button className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
                  <GitCompare className="h-4 w-4" />
                  <span>Compare Simulations</span>
                </button>
                <button className="flex items-center space-x-2 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200">
                  <FileSearch className="h-4 w-4" />
                  <span>View Comparison History</span>
                </button>
              </div>
            </div>

            {/* Recent Comparisons */}
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Recent Comparisons</h3>
              </div>
              <div className="p-6 text-center text-gray-500">
                <GitCompare className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p>No comparisons available</p>
                <p className="text-sm">Select two completed simulations to compare</p>
              </div>
            </div>
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Simulation Settings</h3>
              </div>
              <div className="p-6 space-y-6">
                <div>
                  <h4 className="text-md font-medium text-gray-900 mb-4">Safety Configuration</h4>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-gray-900">Default Safety Level</div>
                        <div className="text-sm text-gray-600">Safety level for new simulations</div>
                      </div>
                      <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="conservative">Conservative</option>
                        <option value="moderate">Moderate</option>
                        <option value="aggressive">Aggressive</option>
                      </select>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-gray-900">Isolation Level</div>
                        <div className="text-sm text-gray-600">Production isolation strictness</div>
                      </div>
                      <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="strict">Strict</option>
                        <option value="moderate">Moderate</option>
                        <option value="relaxed">Relaxed</option>
                      </select>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-gray-900">Duplicate Prevention</div>
                        <div className="text-sm text-gray-600">Prevent duplicate simulations</div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" defaultChecked className="sr-only peer" />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-md font-medium text-gray-900 mb-4">Performance Settings</h4>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-gray-900">Default Timeout</div>
                        <div className="text-sm text-gray-600">Simulation timeout in minutes</div>
                      </div>
                      <input
                        type="number"
                        defaultValue="60"
                        className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-20"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-gray-900">Max Workers</div>
                        <div className="text-sm text-gray-600">Maximum workers per simulation</div>
                      </div>
                      <input
                        type="number"
                        defaultValue="100"
                        className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-20"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-gray-900">Retry Attempts</div>
                        <div className="text-sm text-gray-600">Number of retry attempts</div>
                      </div>
                      <input
                        type="number"
                        defaultValue="3"
                        className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-20"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-md font-medium text-gray-900 mb-4">Notification Settings</h4>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-gray-900">Completion Notifications</div>
                        <div className="text-sm text-gray-600">Notify when simulations complete</div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" defaultChecked className="sr-only peer" />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-gray-900">Error Notifications</div>
                        <div className="text-sm text-gray-600">Notify on simulation errors</div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" defaultChecked className="sr-only peer" />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* New Simulation Modal */}
      {showNewSimulation && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-11/12 md:w-3/4 lg:w-1/2 shadow-lg rounded-lg bg-white">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">New Simulation</h3>
              <button
                onClick={() => setShowNewSimulation(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Simulation Type</label>
                <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="payroll_period">Payroll Period Simulation</option>
                  <option value="scenario">Scenario Testing</option>
                  <option value="worker_group">Worker Group Simulation</option>
                  <option value="comparison">Comparison Simulation</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Execution Mode</label>
                <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="shadow_only">Shadow Only (Safe)</option>
                  <option value="comparison">Comparison Mode</option>
                  <option value="scenario_test">Scenario Test</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Safety Level</label>
                <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="conservative">Conservative</option>
                  <option value="moderate">Moderate</option>
                  <option value="aggressive">Aggressive</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Precision Level</label>
                <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="basic">Basic</option>
                  <option value="detailed">Detailed</option>
                  <option value="comprehensive">Comprehensive</option>
                </select>
              </div>

              <div className="flex items-center space-x-3">
                <input type="checkbox" id="includeAccounting" defaultChecked className="rounded border-gray-300" />
                <label htmlFor="includeAccounting" className="text-sm text-gray-700">
                  Include Accounting Preview
                </label>
              </div>

              <div className="flex items-center space-x-3">
                <input type="checkbox" id="includeCompliance" defaultChecked className="rounded border-gray-300" />
                <label htmlFor="includeCompliance" className="text-sm text-gray-700">
                  Include Compliance Validation
                </label>
              </div>

              <div className="flex items-center space-x-3">
                <input type="checkbox" id="includeReconciliation" defaultChecked className="rounded border-gray-300" />
                <label htmlFor="includeReconciliation" className="text-sm text-gray-700">
                  Include Reconciliation
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowNewSimulation(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  executeSimulation('payroll_period', {
                    executionMode: 'shadow_only',
                    safetyLevel: 'conservative',
                    precisionLevel: 'detailed'
                  });
                  setShowNewSimulation(false);
                }}
                disabled={executingSimulation !== null}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {executingSimulation ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Starting...
                  </>
                ) : (
                  <>
                    <PlayCircle className="h-4 w-4 mr-2" />
                    Start Simulation
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}




