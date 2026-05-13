// Payroll Simulation Comparison Panel - Phase 3E
// Comprehensive simulation comparison and variance analysis component
// PHASE 3E PAYROLL SIMULATION ONLY — SHADOW SAFE

import React, { useState, useEffect, useMemo } from "react";
import {
  GitCompare,
  GitBranch,
  GitMerge,
  TrendingUp,
  TrendingDown,
  Minus,
  Plus,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Search,
  Filter,
  Download,
  Eye,
  RefreshCw,
  BarChart3,
  LineChart,
  PieChart,
  Activity,
  Target,
  Scale,
  Calculator,
  Users,
  FileText,
  Settings,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Info,
  Loader2,
  Database,
  Zap,
  Shield,
  Clock,
  Calendar,
  DollarSign,
  Percent,
  ArrowUpRight,
  ArrowDownRight,
  ArrowRight,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  EqualNot,
  Equal,
  Gauge,
  Crosshair,
  Ruler,
  Compass,
  Map,
  Layers,
  Box,
  Package,
  Truck,
  Building,
  Briefcase,
  CreditCard,
  Receipt,
  FileSearch,
  FileCheck,
  FileX,
  AlertCircle,
  CheckCircle2,
  TrendingDown as TrendingDownIcon
} from "lucide-react";
import { payrollSimulationEngine, compareSimulationResults } from "../lib/payrollSimulationExecution";
import type {
  PayrollSimulationRun,
  PayrollSimulationResult,
  PayrollSimulationComparison,
  PayrollComparisonSummary,
  PayrollComparisonVariance,
  PayrollComparisonTrend
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

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

interface PayrollSimulationComparisonPanelProps {
  companyId: string;
  payrollPeriodId: string;
  onComparisonSelect?: (comparison: PayrollSimulationComparison) => void;
  readOnly?: boolean;
}

export default function PayrollSimulationComparisonPanel({
  companyId,
  payrollPeriodId,
  onComparisonSelect,
  readOnly = false
}: PayrollSimulationComparisonPanelProps) {
  const [loading, setLoading] = useState(true);
  const [comparing, setComparing] = useState(false);
  const [simulations, setSimulations] = useState<PayrollSimulationRun[]>([]);
  const [comparisons, setComparisons] = useState<PayrollSimulationComparison[]>([]);
  const [selectedBaseline, setSelectedBaseline] = useState<string>("");
  const [selectedComparison, setSelectedComparison] = useState<string>("");
  const [currentComparison, setCurrentComparison] = useState<PayrollSimulationComparison | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'variances' | 'trends' | 'details'>('overview');
  const [varianceFilter, setVarianceFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("significance");
  const [showDetails, setShowDetails] = useState<string | null>(null);

  // Load available simulations
  useEffect(() => {
    async function loadSimulations() {
      try {
        setLoading(true);
        
        // Mock simulation data (in real implementation, would fetch from database)
        const mockSimulations: PayrollSimulationRun[] = [
          {
            id: 'sim_001',
            companyId,
            payrollPeriodId,
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
              companyId,
              payrollPeriodId,
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
              createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
              startedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
              completedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 + 30 * 60 * 1000).toISOString(),
              duration: 30 * 60 * 1000,
              estimatedDuration: 30 * 60 * 1000,
              retryCount: 0,
              maxRetries: 3
            }
          },
          {
            id: 'sim_002',
            companyId,
            payrollPeriodId,
            simulationType: {
              category: 'scenario',
              type: 'edge_case_testing',
              description: 'Edge case scenario testing',
              isDestructive: false,
              requiresApproval: false,
              estimatedDuration: 15
            },
            executionMode: 'scenario_test',
            status: 'completed',
            priority: 'high',
            configuration: {
              companyId,
              payrollPeriodId,
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
              createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
              startedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
              completedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000 + 18 * 60 * 1000).toISOString(),
              duration: 18 * 60 * 1000,
              estimatedDuration: 15 * 60 * 1000,
              retryCount: 0,
              maxRetries: 2
            }
          },
          {
            id: 'sim_003',
            companyId,
            payrollPeriodId,
            simulationType: {
              category: 'worker_group',
              type: 'department_simulation',
              description: 'Department-specific simulation',
              isDestructive: false,
              requiresApproval: false,
              estimatedDuration: 20
            },
            executionMode: 'shadow_only',
            status: 'completed',
            priority: 'medium',
            configuration: {
              companyId,
              payrollPeriodId,
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
              createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
              startedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
              completedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000 + 22 * 60 * 1000).toISOString(),
              duration: 22 * 60 * 1000,
              estimatedDuration: 20 * 60 * 1000,
              retryCount: 0,
              maxRetries: 3
            }
          }
        ];
        
        setSimulations(mockSimulations);

        // Mock comparison data
        const mockComparisons: PayrollSimulationComparison[] = [
          {
            id: 'comp_001',
            simulationId: 'sim_002',
            baselineId: 'sim_001',
            comparisonType: 'baseline',
            status: 'completed',
            summary: {
              totalComparisons: 150,
              matchingResults: 142,
              varianceDetected: 8,
              significantVariances: 3,
              accuracyScore: 94.7,
              confidenceScore: 92.3,
              averageVariance: 0.023,
              maxVariance: 0.087,
              varianceTrend: 'stable',
              overallStatus: 'good'
            },
            details: {
              workerComparisons: [],
              scenarioComparisons: [],
              accountingComparisons: [],
              complianceComparisons: [],
              reconciliationComparisons: []
            },
            variances: [
              {
                varianceId: 'var_001',
                type: 'worker',
                entityId: 'worker_001',
                entityName: 'John Doe',
                baselineValue: 2500.00,
                currentValue: 2545.50,
                variance: 45.50,
                variancePercentage: 1.82,
                significance: 'medium',
                impact: 'medium',
                investigation: true,
                recommendation: 'Review overtime calculation for this worker'
              },
              {
                varianceId: 'var_002',
                type: 'accounting',
                entityId: 'acc_001',
                entityName: 'Wages Expense',
                baselineValue: 125000.00,
                currentValue: 126750.00,
                variance: 1750.00,
                variancePercentage: 1.4,
                significance: 'low',
                impact: 'low',
                investigation: false,
                recommendation: 'Monitor for consistency'
              },
              {
                varianceId: 'var_003',
                type: 'compliance',
                entityId: 'nis_compliance',
                entityName: 'NIS Compliance',
                baselineValue: 1,
                currentValue: 0,
                variance: 0,
                variancePercentage: 0,
                significance: 'high',
                impact: 'critical',
                investigation: true,
                recommendation: 'Immediate review of NIS calculation required'
              }
            ],
            trends: [
              {
                metric: 'accuracy',
                period: '2024-05',
                value: 94.7,
                trend: 'improving',
                changePercentage: 2.3,
                significance: 'medium'
              },
              {
                metric: 'variance_rate',
                period: '2024-05',
                value: 5.3,
                trend: 'stable',
                changePercentage: 0.1,
                significance: 'low'
              }
            ],
            recommendations: [
              {
                recommendationId: 'rec_001',
                type: 'accuracy',
                priority: 'medium',
                title: 'Improve Overtime Calculations',
                description: 'Review and update overtime calculation logic for edge cases',
                impact: 'Reduces variance in overtime calculations by 80%',
                effort: 'medium',
                timeline: '2 weeks',
                dependencies: ['payroll_calculation_review']
              }
            ],
            metadata: {
              comparedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
              comparedBy: 'system',
              comparisonMethod: 'detailed',
              confidence: 0.92
            }
          }
        ];
        
        setComparisons(mockComparisons);
      } catch (error) {
        console.error("Error loading simulations:", error);
      } finally {
        setLoading(false);
      }
    }

    loadSimulations();
  }, [companyId, payrollPeriodId]);

  // Execute comparison
  const executeComparison = async () => {
    if (!selectedBaseline || !selectedComparison) {
      alert('Please select both baseline and comparison simulations');
      return;
    }

    if (selectedBaseline === selectedComparison) {
      alert('Baseline and comparison cannot be the same simulation');
      return;
    }

    try {
      setComparing(true);
      
      const comparison = await compareSimulationResults(
        selectedBaseline,
        selectedComparison,
        'current_user'
      );
      
      setCurrentComparison(comparison);
      setActiveTab('overview');
      
      if (onComparisonSelect) {
        onComparisonSelect(comparison);
      }
    } catch (error: any) {
      console.error("Error executing comparison:", error);
      alert('Comparison failed: ' + (error?.message || String(error)));
    } finally {
      setComparing(false);
    }
  };

  // Filter variances
  const filteredVariances = useMemo(() => {
    if (!currentComparison) return [];
    
    return currentComparison.variances.filter(variance => {
      if (varianceFilter === "all") return true;
      if (varianceFilter === "significant") return variance.significance === 'high' || variance.significance === 'critical';
      if (varianceFilter === "investigation") return variance.investigation;
      return variance.type === varianceFilter;
    });
  }, [currentComparison, varianceFilter]);

  // Sort variances
  const sortedVariances = useMemo(() => {
    return [...filteredVariances].sort((a, b) => {
      switch (sortBy) {
        case 'significance':
          const significanceOrder = { critical: 4, high: 3, medium: 2, low: 1 };
          return (significanceOrder[b.significance as keyof typeof significanceOrder] || 0) - 
                 (significanceOrder[a.significance as keyof typeof significanceOrder] || 0);
        case 'variance':
          return Math.abs(b.variance) - Math.abs(a.variance);
        case 'percentage':
          return Math.abs(b.variancePercentage) - Math.abs(a.variancePercentage);
        case 'entity':
          return a.entityName.localeCompare(b.entityName);
        default:
          return 0;
      }
    });
  }, [filteredVariances, sortBy]);

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mr-3" />
          <span className="text-gray-600">Loading comparison data...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Comparison Setup */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Simulation Comparison</h3>
            <p className="text-sm text-gray-600">Compare simulation results to identify variances and trends</p>
          </div>
          <div className="flex items-center space-x-2">
            <GitCompare className="h-5 w-5 text-blue-600" />
            <span className="text-sm font-medium text-blue-600">Shadow Safe Comparison</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Baseline Simulation</label>
            <select
              value={selectedBaseline}
              onChange={(e) => setSelectedBaseline(e.target.value)}
              disabled={comparing}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select baseline simulation</option>
              {simulations.filter(s => s.status === 'completed').map((simulation) => (
                <option key={simulation.id} value={simulation.id}>
                  {simulation.simulationType.description} - {formatDateTime(simulation.metadata.createdAt)}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">The baseline serves as the reference point</p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Comparison Simulation</label>
            <select
              value={selectedComparison}
              onChange={(e) => setSelectedComparison(e.target.value)}
              disabled={comparing}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select comparison simulation</option>
              {simulations.filter(s => s.status === 'completed').map((simulation) => (
                <option key={simulation.id} value={simulation.id}>
                  {simulation.simulationType.description} - {formatDateTime(simulation.metadata.createdAt)}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">The simulation to compare against baseline</p>
          </div>
        </div>

        <div className="mt-6 flex items-center space-x-3">
          <button
            onClick={executeComparison}
            disabled={!selectedBaseline || !selectedComparison || comparing || selectedBaseline === selectedComparison}
            className="flex items-center space-x-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {comparing ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Comparing...</span>
              </>
            ) : (
              <>
                <GitCompare className="h-5 w-5" />
                <span>Compare Simulations</span>
              </>
            )}
          </button>
          <button className="flex items-center space-x-2 bg-gray-100 text-gray-700 px-4 py-3 rounded-lg hover:bg-gray-200">
            <FileSearch className="h-5 w-5" />
            <span>View History</span>
          </button>
        </div>
      </div>

      {/* Comparison Results */}
      {currentComparison && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Comparison Results</h3>
              <div className="flex items-center space-x-2">
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                  currentComparison.summary.overallStatus === 'excellent' ? 'bg-green-100 text-green-800' :
                  currentComparison.summary.overallStatus === 'good' ? 'bg-blue-100 text-blue-800' :
                  currentComparison.summary.overallStatus === 'acceptable' ? 'bg-yellow-100 text-yellow-800' :
                  currentComparison.summary.overallStatus === 'needs_attention' ? 'bg-orange-100 text-orange-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  {currentComparison.summary.overallStatus.replace('_', ' ').toUpperCase()}
                </span>
                <button className="text-gray-600 hover:text-gray-900">
                  <Download className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="border-b border-gray-200">
            <nav className="flex space-x-8 px-6" aria-label="Tabs">
              {[
                { id: 'overview', name: 'Overview', icon: BarChart3 },
                { id: 'variances', name: 'Variances', icon: AlertTriangle },
                { id: 'trends', name: 'Trends', icon: LineChart },
                { id: 'details', name: 'Details', icon: FileText }
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
            {activeTab === 'overview' && (
              <div className="space-y-6">
                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="text-center p-4 bg-gray-50 rounded-lg">
                    <div className="text-sm text-gray-600">Total Comparisons</div>
                    <div className="text-2xl font-bold text-gray-900">{currentComparison.summary.totalComparisons}</div>
                  </div>
                  <div className="text-center p-4 bg-green-50 rounded-lg">
                    <div className="text-sm text-green-600">Matching Results</div>
                    <div className="text-2xl font-bold text-green-900">{currentComparison.summary.matchingResults}</div>
                  </div>
                  <div className="text-center p-4 bg-yellow-50 rounded-lg">
                    <div className="text-sm text-yellow-600">Variances Detected</div>
                    <div className="text-2xl font-bold text-yellow-900">{currentComparison.summary.varianceDetected}</div>
                  </div>
                  <div className="text-center p-4 bg-blue-50 rounded-lg">
                    <div className="text-sm text-blue-600">Accuracy Score</div>
                    <div className="text-2xl font-bold text-blue-900">{formatPercent(currentComparison.summary.accuracyScore)}</div>
                  </div>
                </div>

                {/* Detailed Metrics */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <h4 className="text-md font-semibold text-gray-900">Performance Metrics</h4>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Significant Variances</span>
                        <span className="text-sm font-medium text-gray-900">{currentComparison.summary.significantVariances}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Average Variance</span>
                        <span className="text-sm font-medium text-gray-900">{formatPercent(currentComparison.summary.averageVariance * 100)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Max Variance</span>
                        <span className="text-sm font-medium text-gray-900">{formatPercent(currentComparison.summary.maxVariance * 100)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Confidence Score</span>
                        <span className="text-sm font-medium text-gray-900">{formatPercent(currentComparison.summary.confidenceScore)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-md font-semibold text-gray-900">Trend Analysis</h4>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Variance Trend</span>
                        <div className="flex items-center space-x-2">
                          {currentComparison.summary.varianceTrend === 'improving' && <TrendingUp className="h-4 w-4 text-green-600" />}
                          {currentComparison.summary.varianceTrend === 'declining' && <TrendingDownIcon className="h-4 w-4 text-red-600" />}
                          {currentComparison.summary.varianceTrend === 'stable' && <ArrowRight className="h-4 w-4 text-blue-600" />}
                          <span className="text-sm font-medium capitalize text-gray-900">
                            {currentComparison.summary.varianceTrend}
                          </span>
                        </div>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Compared At</span>
                        <span className="text-sm font-medium text-gray-900">
                          {formatDateTime(currentComparison.metadata.comparedAt)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Comparison Method</span>
                        <span className="text-sm font-medium text-gray-900">
                          {currentComparison.metadata.comparisonMethod}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Confidence Level</span>
                        <div className="flex items-center space-x-2">
                          <div className="w-20 bg-gray-200 rounded-full h-2">
                            <div 
                              className="bg-blue-600 h-2 rounded-full" 
                              style={{ width: `${currentComparison.metadata.confidence * 100}%` }}
                            ></div>
                          </div>
                          <span className="text-sm font-medium text-gray-900">
                            {formatPercent(currentComparison.metadata.confidence * 100)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Variances Tab */}
            {activeTab === 'variances' && (
              <div className="space-y-6">
                {/* Variance Filters */}
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <Filter className="h-4 w-4 text-gray-500" />
                    <select
                      value={varianceFilter}
                      onChange={(e) => setVarianceFilter(e.target.value)}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="all">All Variances</option>
                      <option value="significant">Significant Only</option>
                      <option value="investigation">Requires Investigation</option>
                      <option value="worker">Worker Variances</option>
                      <option value="accounting">Accounting Variances</option>
                      <option value="compliance">Compliance Variances</option>
                    </select>
                  </div>
                  <div className="flex items-center space-x-2">
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value)}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="significance">Sort by Significance</option>
                      <option value="variance">Sort by Variance Amount</option>
                      <option value="percentage">Sort by Percentage</option>
                      <option value="entity">Sort by Entity</option>
                    </select>
                  </div>
                </div>

                {/* Variance List */}
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Entity
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Type
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Baseline
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Current
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Variance
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          % Change
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Significance
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {sortedVariances.map((variance) => (
                        <tr key={variance.varianceId} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            <div className="flex items-center space-x-2">
                              {variance.type === 'worker' && <Users className="h-4 w-4 text-blue-600" />}
                              {variance.type === 'accounting' && <Calculator className="h-4 w-4 text-green-600" />}
                              {variance.type === 'compliance' && <Shield className="h-4 w-4 text-red-600" />}
                              <span>{variance.entityName}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            <span className="capitalize">{variance.type}</span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {variance.baselineValue !== undefined ? formatCurrency(variance.baselineValue) : 'N/A'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatCurrency(variance.currentValue)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <div className="flex items-center space-x-2">
                              {variance.variance > 0 ? (
                                <ArrowUp className="h-4 w-4 text-red-600" />
                              ) : variance.variance < 0 ? (
                                <ArrowDown className="h-4 w-4 text-green-600" />
                              ) : (
                                <Minus className="h-4 w-4 text-gray-600" />
                              )}
                              <span className={variance.variance > 0 ? 'text-red-600' : variance.variance < 0 ? 'text-green-600' : 'text-gray-600'}>
                                {formatCurrency(Math.abs(variance.variance))}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <div className="flex items-center space-x-2">
                              {variance.variancePercentage > 0 ? (
                                <ArrowUp className="h-4 w-4 text-red-600" />
                              ) : variance.variancePercentage < 0 ? (
                                <ArrowDown className="h-4 w-4 text-green-600" />
                              ) : (
                                <Equal className="h-4 w-4 text-gray-600" />
                              )}
                              <span className={variance.variancePercentage > 0 ? 'text-red-600' : variance.variancePercentage < 0 ? 'text-green-600' : 'text-gray-600'}>
                                {formatPercent(variance.variancePercentage)}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              variance.significance === 'critical' ? 'bg-red-100 text-red-800' :
                              variance.significance === 'high' ? 'bg-orange-100 text-orange-800' :
                              variance.significance === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {variance.significance}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            <div className="flex items-center space-x-2">
                              {variance.investigation && (
                                <button className="text-blue-600 hover:text-blue-700">
                                  <Search className="h-4 w-4" />
                                </button>
                              )}
                              <button className="text-gray-600 hover:text-gray-700">
                                <Eye className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {sortedVariances.length === 0 && (
                  <div className="text-center py-8">
                    <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h5 className="text-lg font-medium text-gray-900 mb-2">No variances found</h5>
                    <p className="text-sm text-gray-600">
                      {varianceFilter === 'all' ? 'No variances detected in this comparison' : 'No variances match the selected filter'}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Trends Tab */}
            {activeTab === 'trends' && (
              <div className="space-y-6">
                <h4 className="text-md font-semibold text-gray-900 mb-4">Trend Analysis</h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {currentComparison.trends.map((trend, index) => (
                    <div key={index} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h5 className="text-md font-medium text-gray-900 capitalize">{trend.metric}</h5>
                        <div className="flex items-center space-x-2">
                          {trend.trend === 'improving' && <TrendingUp className="h-4 w-4 text-green-600" />}
                          {trend.trend === 'declining' && <TrendingDownIcon className="h-4 w-4 text-red-600" />}
                          {trend.trend === 'stable' && <ArrowRight className="h-4 w-4 text-blue-600" />}
                          <span className="text-sm font-medium capitalize text-gray-900">
                            {trend.trend}
                          </span>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">Current Value</span>
                          <span className="text-sm font-medium text-gray-900">
                            {typeof trend.value === 'number' ? formatPercent(trend.value) : trend.value}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">Change</span>
                          <div className="flex items-center space-x-2">
                            {trend.changePercentage > 0 ? (
                              <ArrowUp className="h-4 w-4 text-green-600" />
                            ) : trend.changePercentage < 0 ? (
                              <ArrowDown className="h-4 w-4 text-red-600" />
                            ) : (
                              <Minus className="h-4 w-4 text-gray-600" />
                            )}
                            <span className={`text-sm font-medium ${
                              trend.changePercentage > 0 ? 'text-green-600' : 
                              trend.changePercentage < 0 ? 'text-red-600' : 'text-gray-600'
                            }`}>
                              {formatPercent(trend.changePercentage)}
                            </span>
                          </div>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">Significance</span>
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            trend.significance === 'high' ? 'bg-red-100 text-red-800' :
                            trend.significance === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {trend.significance}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">Period</span>
                          <span className="text-sm font-medium text-gray-900">{trend.period}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Details Tab */}
            {activeTab === 'details' && (
              <div className="space-y-6">
                <h4 className="text-md font-semibold text-gray-900 mb-4">Comparison Details</h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h5 className="text-sm font-medium text-gray-900 mb-3">Comparison Information</h5>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Comparison ID</span>
                        <span className="font-medium text-gray-900">{currentComparison.id}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Type</span>
                        <span className="font-medium text-gray-900 capitalize">{currentComparison.comparisonType}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Status</span>
                        <span className="font-medium text-gray-900 capitalize">{currentComparison.status}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Compared By</span>
                        <span className="font-medium text-gray-900">{currentComparison.metadata.comparedBy}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Compared At</span>
                        <span className="font-medium text-gray-900">{formatDateTime(currentComparison.metadata.comparedAt)}</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h5 className="text-sm font-medium text-gray-900 mb-3">Methodology</h5>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Method</span>
                        <span className="font-medium text-gray-900">{currentComparison.metadata.comparisonMethod}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Confidence</span>
                        <div className="flex items-center space-x-2">
                          <div className="w-20 bg-gray-200 rounded-full h-2">
                            <div 
                              className="bg-blue-600 h-2 rounded-full" 
                              style={{ width: `${currentComparison.metadata.confidence * 100}%` }}
                            ></div>
                          </div>
                          <span className="font-medium text-gray-900">
                            {formatPercent(currentComparison.metadata.confidence * 100)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Recommendations */}
                {currentComparison.recommendations.length > 0 && (
                  <div>
                    <h5 className="text-sm font-medium text-gray-900 mb-3">Recommendations</h5>
                    <div className="space-y-3">
                      {currentComparison.recommendations.map((rec, index) => (
                        <div key={rec.recommendationId} className="border border-gray-200 rounded-lg p-4">
                          <div className="flex items-start space-x-3">
                            <div className={`mt-1 w-2 h-2 rounded-full ${
                              rec.priority === 'critical' ? 'bg-red-600' :
                              rec.priority === 'high' ? 'bg-orange-600' :
                              rec.priority === 'medium' ? 'bg-yellow-600' :
                              'bg-gray-600'
                            }`}></div>
                            <div className="flex-1">
                              <div className="flex items-center space-x-2 mb-2">
                                <h6 className="text-sm font-medium text-gray-900">{rec.title}</h6>
                                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                  rec.priority === 'critical' ? 'bg-red-100 text-red-800' :
                                  rec.priority === 'high' ? 'bg-orange-100 text-orange-800' :
                                  rec.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-gray-100 text-gray-800'
                                }`}>
                                  {rec.priority}
                                </span>
                              </div>
                              <p className="text-sm text-gray-600 mb-2">{rec.description}</p>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                                <div>
                                  <span className="text-gray-600">Impact: </span>
                                  <span className="font-medium text-gray-900">{rec.impact}</span>
                                </div>
                                <div>
                                  <span className="text-gray-600">Effort: </span>
                                  <span className="font-medium text-gray-900 capitalize">{rec.effort}</span>
                                </div>
                                <div>
                                  <span className="text-gray-600">Timeline: </span>
                                  <span className="font-medium text-gray-900">{rec.timeline}</span>
                                </div>
                                <div>
                                  <span className="text-gray-600">Type: </span>
                                  <span className="font-medium text-gray-900 capitalize">{rec.type}</span>
                                </div>
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
      )}

      {/* Recent Comparisons */}
      {!currentComparison && comparisons.length > 0 && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Recent Comparisons</h3>
          </div>
          <div className="divide-y divide-gray-200">
            {comparisons.map((comparison) => (
              <div key={comparison.id} className="p-6 hover:bg-gray-50">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <h4 className="text-md font-medium text-gray-900">
                        {comparison.simulationId} vs {comparison.baselineId}
                      </h4>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        comparison.summary.overallStatus === 'excellent' ? 'bg-green-100 text-green-800' :
                        comparison.summary.overallStatus === 'good' ? 'bg-blue-100 text-blue-800' :
                        comparison.summary.overallStatus === 'acceptable' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {comparison.summary.overallStatus.replace('_', ' ').toUpperCase()}
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <div className="text-gray-600">Accuracy Score</div>
                        <div className="font-medium text-gray-900">{formatPercent(comparison.summary.accuracyScore)}</div>
                      </div>
                      <div>
                        <div className="text-gray-600">Variances</div>
                        <div className="font-medium text-gray-900">{comparison.summary.varianceDetected}</div>
                      </div>
                      <div>
                        <div className="text-gray-600">Confidence</div>
                        <div className="font-medium text-gray-900">{formatPercent(comparison.summary.confidenceScore)}</div>
                      </div>
                      <div>
                        <div className="text-gray-600">Compared</div>
                        <div className="font-medium text-gray-900">{formatDateTime(comparison.metadata.comparedAt)}</div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 ml-4">
                    <button
                      onClick={() => {
                        setCurrentComparison(comparison);
                        setActiveTab('overview');
                      }}
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
      )}

      {/* Empty State */}
      {!currentComparison && comparisons.length === 0 && (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <GitCompare className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h5 className="text-lg font-medium text-gray-900 mb-2">No comparisons available</h5>
          <p className="text-sm text-gray-600 mb-6">
            Select two completed simulations to compare and identify variances
          </p>
        </div>
      )}
    </div>
  );
}
