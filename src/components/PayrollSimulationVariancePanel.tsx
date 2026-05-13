// Payroll Simulation Variance Panel - Phase 3E
// Comprehensive variance detection and analysis component
// PHASE 3E PAYROLL SIMULATION ONLY — SHADOW SAFE

import React, { useState, useEffect, useMemo } from "react";
import {
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  Plus,
  Search,
  Filter,
  Download,
  Eye,
  RefreshCw,
  BarChart3,
  PieChart,
  LineChart,
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
  Equal,
  EqualNot,
  XCircle,
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
  TrendingDown as TrendingDownIcon,
  Zap as ZapIcon,
  Activity as ActivityIcon,
  BarChart3 as BarChart3Icon,
  PieChart as PieChartIcon,
  LineChart as LineChartIcon,
  AlertTriangle as AlertTriangleIcon
} from "lucide-react";
import { payrollSimulationEngine, generateSimulationVariance } from "../lib/payrollSimulationExecution";
import type {
  PayrollSimulationRun,
  PayrollSimulationResult,
  PayrollSimulationVariance,
  PayrollVarianceSummary,
  PayrollVarianceDetails,
  PayrollVarianceAnalysis,
  PayrollVarianceResolution
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

interface PayrollSimulationVariancePanelProps {
  companyId: string;
  payrollPeriodId: string;
  simulationId?: string;
  onVarianceSelect?: (variance: PayrollSimulationVariance) => void;
  readOnly?: boolean;
}

export default function PayrollSimulationVariancePanel({
  companyId,
  payrollPeriodId,
  simulationId,
  onVarianceSelect,
  readOnly = false
}: PayrollSimulationVariancePanelProps) {
  const [loading, setLoading] = useState(true);
  const [variances, setVariances] = useState<PayrollSimulationVariance[]>([]);
  const [selectedVariance, setSelectedVariance] = useState<PayrollSimulationVariance | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'details' | 'analysis' | 'resolution'>('overview');
  const [varianceFilter, setVarianceFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("significance");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [analyzing, setAnalyzing] = useState(false);

  // Load variance data
  useEffect(() => {
    async function loadVarianceData() {
      try {
        setLoading(true);
        
        // Mock variance data (in real implementation, would fetch from database)
        const mockVariances: PayrollSimulationVariance[] = [
          {
            id: 'var_001',
            simulationId: simulationId || 'sim_001',
            varianceType: 'calculation',
            severity: 'medium',
            summary: {
              totalVariances: 15,
              significantVariances: 3,
              criticalVariances: 0,
              averageVariance: 0.023,
              maxVariance: 0.087,
              varianceTrend: 'stable',
              overallImpact: 'medium'
            },
            details: {
              workerVariances: [
                {
                  workerId: 'worker_001',
                  component: 'overtime_calculation',
                  expectedValue: 2750.00,
                  actualValue: 2845.50,
                  variance: 95.50,
                  variancePercentage: 3.47,
                  significance: 'medium',
                  impact: 'medium',
                  investigation: true,
                  rootCause: 'Overtime rate calculation error'
                },
                {
                  workerId: 'worker_002',
                  component: 'tax_calculation',
                  expectedValue: 450.00,
                  actualValue: 435.00,
                  variance: -15.00,
                  variancePercentage: -3.33,
                  significance: 'low',
                  impact: 'low',
                  investigation: false,
                  rootCause: 'Tax bracket threshold difference'
                }
              ],
              scenarioVariances: [],
              accountingVariances: [
                {
                  accountId: 'acc_001',
                  accountName: 'Wages Expense',
                  component: 'total_wages',
                  expectedAmount: 125000.00,
                  actualAmount: 126750.00,
                  variance: 1750.00,
                  variancePercentage: 1.4,
                  significance: 'low',
                  impact: 'low',
                  investigation: false,
                  rootCause: 'Rounding differences in aggregation'
                }
              ],
              complianceVariances: [],
              reconciliationVariances: []
            },
            analysis: {
              patterns: [
                {
                  patternId: 'pat_001',
                  description: 'Overtime calculation variance pattern',
                  frequency: 3,
                  significance: 'medium',
                  affectedComponents: ['overtime_calculation', 'gross_pay'],
                  suggestedAction: 'Review overtime calculation logic'
                }
              ],
              correlations: [
                {
                  correlationId: 'cor_001',
                  factor1: 'overtime_hours',
                  factor2: 'variance_amount',
                  correlationStrength: 0.87,
                  significance: 'high',
                  description: 'Strong correlation between overtime hours and variance amount'
                }
              ],
              rootCauses: [
                {
                  causeId: 'cause_001',
                  category: 'calculation',
                  description: 'Overtime rate calculation logic error',
                  likelihood: 0.75,
                  impact: 'medium',
                  evidence: ['Consistent variance in overtime calculations', 'Pattern affects 15% of workers']
                }
              ],
              trends: [
                {
                  metric: 'variance_rate',
                  direction: 'stable',
                  changeRate: 0.02,
                  significance: 'low',
                  timeframe: 'last_30_days'
                }
              ],
              recommendations: [
                {
                  recommendationId: 'rec_001',
                  type: 'immediate',
                  priority: 'high',
                  description: 'Fix overtime calculation logic',
                  impact: 'Reduces overtime variance by 80%',
                  effort: 'medium',
                  timeline: '1 week'
                }
              ]
            },
            resolution: {
              resolutionId: 'res_001',
              strategy: 'automatic',
              actions: [
                {
                  actionId: 'act_001',
                  type: 'calculation_fix',
                  description: 'Update overtime calculation formula',
                  status: 'pending',
                  assignedTo: 'payroll_team',
                  dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
                }
              ],
              status: 'pending',
              progress: 0
            },
            metadata: {
              detectedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
              detectedBy: 'system',
              acknowledged: false,
              resolved: false
            }
          },
          {
            id: 'var_002',
            simulationId: simulationId || 'sim_002',
            varianceType: 'compliance',
            severity: 'high',
            summary: {
              totalVariances: 8,
              significantVariances: 2,
              criticalVariances: 1,
              averageVariance: 0.045,
              maxVariance: 0.125,
              varianceTrend: 'declining',
              overallImpact: 'high'
            },
            details: {
              workerVariances: [],
              scenarioVariances: [],
              accountingVariances: [],
              complianceVariances: [
                {
                  requirement: 'nis_compliance',
                  expectedStatus: true,
                  actualStatus: false,
                  variance: 'regression',
                  significance: 'high',
                  impact: 'critical',
                  investigation: true,
                  rootCause: 'NIS rate table outdated'
                },
                {
                  requirement: 'nht_compliance',
                  expectedStatus: true,
                  actualStatus: false,
                  variance: 'regression',
                  significance: 'high',
                  impact: 'high',
                  investigation: true,
                  rootCause: 'NHT contribution calculation error'
                }
              ],
              reconciliationVariances: []
            },
            analysis: {
              patterns: [
                {
                  patternId: 'pat_002',
                  description: 'Statutory compliance regression',
                  frequency: 2,
                  significance: 'high',
                  affectedComponents: ['nis_calculation', 'nht_calculation'],
                  suggestedAction: 'Update statutory rate tables'
                }
              ],
              correlations: [
                {
                  correlationId: 'cor_002',
                  factor1: 'statutory_rate_update',
                  factor2: 'compliance_variance',
                  correlationStrength: 0.95,
                  significance: 'high',
                  description: 'Perfect correlation between rate updates and compliance issues'
                }
              ],
              rootCauses: [
                {
                  causeId: 'cause_002',
                  category: 'data',
                  description: 'Outdated statutory rate tables',
                  likelihood: 0.95,
                  impact: 'critical',
                  evidence: ['NIS rates not updated for 6 months', 'NHT rates missing recent changes']
                }
              ],
              trends: [
                {
                  metric: 'compliance_variance_rate',
                  direction: 'declining',
                  changeRate: 0.15,
                  significance: 'high',
                  timeframe: 'last_30_days'
                }
              ],
              recommendations: [
                {
                  recommendationId: 'rec_002',
                  type: 'immediate',
                  priority: 'critical',
                  description: 'Update statutory rate tables immediately',
                  impact: 'Eliminates compliance variances',
                  effort: 'low',
                  timeline: '1 day'
                }
              ]
            },
            resolution: {
              resolutionId: 'res_002',
              strategy: 'manual',
              actions: [
                {
                  actionId: 'act_002',
                  type: 'data_correction',
                  description: 'Update NIS and NHT rate tables',
                  status: 'in_progress',
                  assignedTo: 'compliance_team',
                  dueDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString()
                }
              ],
              status: 'in_progress',
              progress: 75
            },
            metadata: {
              detectedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
              detectedBy: 'system',
              acknowledged: true,
              acknowledgedBy: 'compliance_manager',
              acknowledgedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
              resolved: false
            }
          }
        ];
        
        setVariances(mockVariances);
      } catch (error) {
        console.error("Error loading variance data:", error);
      } finally {
        setLoading(false);
      }
    }

    loadVarianceData();
  }, [companyId, payrollPeriodId, simulationId]);

  // Analyze variances
  const analyzeVariance = async () => {
    if (!simulationId) {
      alert('Please select a simulation to analyze');
      return;
    }

    try {
      setAnalyzing(true);
      
      const variance = await generateSimulationVariance(simulationId);
      
      // Add to variances list
      setVariances(prev => [variance, ...prev]);
      setSelectedVariance(variance);
      setActiveTab('overview');
      
    } catch (error: any) {
      console.error("Error analyzing variance:", error);
      alert('Variance analysis failed: ' + (error?.message || String(error)));
    } finally {
      setAnalyzing(false);
    }
  };

  // Filter and sort variances
  const filteredVariances = useMemo(() => {
    return variances
      .filter(variance => {
        const matchesSearch = searchTerm === "" || 
                             variance.varianceType.toLowerCase().includes(searchTerm.toLowerCase()) ||
                             variance.id.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesSeverity = severityFilter === "all" || variance.severity === severityFilter;
        const matchesType = varianceFilter === "all" || variance.varianceType === varianceFilter;
        return matchesSearch && matchesSeverity && matchesType;
      })
      .sort((a, b) => {
        switch (sortBy) {
          case 'significance':
            const significanceOrder = { critical: 4, high: 3, medium: 2, low: 1 };
            return (significanceOrder[b.severity as keyof typeof significanceOrder] || 0) - 
                   (significanceOrder[a.severity as keyof typeof significanceOrder] || 0);
          case 'variance':
            return Math.abs(b.summary.averageVariance) - Math.abs(a.summary.averageVariance);
          case 'impact':
            const impactOrder = { critical: 4, high: 3, medium: 2, low: 1 };
            return (impactOrder[b.summary.overallImpact as keyof typeof impactOrder] || 0) - 
                   (impactOrder[a.summary.overallImpact as keyof typeof impactOrder] || 0);
          case 'detectedAt':
            return new Date(b.metadata.detectedAt).getTime() - new Date(a.metadata.detectedAt).getTime();
          default:
            return 0;
        }
      });
  }, [variances, searchTerm, varianceFilter, severityFilter, sortBy]);

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mr-3" />
          <span className="text-gray-600">Loading variance analysis...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Variance Analysis */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Variance Analysis</h3>
            <p className="text-sm text-gray-600">Detect and analyze simulation variances</p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={analyzeVariance}
              disabled={!simulationId || analyzing}
              className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {analyzing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Analyzing...</span>
                </>
              ) : (
                <>
                  <Target className="h-4 w-4" />
                  <span>Analyze Variance</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Variance Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-600">Total Variances</div>
            <div className="text-2xl font-bold text-gray-900">
              {variances.reduce((sum, v) => sum + v.summary.totalVariances, 0)}
            </div>
          </div>
          <div className="text-center p-4 bg-yellow-50 rounded-lg">
            <div className="text-sm text-yellow-600">Significant</div>
            <div className="text-2xl font-bold text-yellow-900">
              {variances.reduce((sum, v) => sum + v.summary.significantVariances, 0)}
            </div>
          </div>
          <div className="text-center p-4 bg-red-50 rounded-lg">
            <div className="text-sm text-red-600">Critical</div>
            <div className="text-2xl font-bold text-red-900">
              {variances.reduce((sum, v) => sum + v.summary.criticalVariances, 0)}
            </div>
          </div>
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <div className="text-sm text-blue-600">Avg Variance</div>
            <div className="text-2xl font-bold text-blue-900">
              {variances.length > 0 ? formatPercent(variances.reduce((sum, v) => sum + v.summary.averageVariance, 0) / variances.length * 100) : '0%'}
            </div>
          </div>
        </div>
      </div>

      {/* Variance List */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h4 className="text-md font-semibold text-gray-900">
              Detected Variances ({filteredVariances.length})
            </h4>
            <div className="flex items-center space-x-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search variances..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <select
                value={varianceFilter}
                onChange={(e) => setVarianceFilter(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Types</option>
                <option value="calculation">Calculation</option>
                <option value="compliance">Compliance</option>
                <option value="accounting">Accounting</option>
                <option value="reconciliation">Reconciliation</option>
              </select>
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Severities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="significance">Sort by Significance</option>
                <option value="variance">Sort by Variance</option>
                <option value="impact">Sort by Impact</option>
                <option value="detectedAt">Sort by Date</option>
              </select>
            </div>
          </div>
        </div>

        <div className="divide-y divide-gray-200">
          {filteredVariances.map((variance) => (
            <div key={variance.id} className="p-6 hover:bg-gray-50">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <h5 className="text-md font-medium text-gray-900">
                      {variance.varianceType.toUpperCase()} Variance
                    </h5>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      variance.severity === 'critical' ? 'bg-red-100 text-red-800' :
                      variance.severity === 'high' ? 'bg-orange-100 text-orange-800' :
                      variance.severity === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {variance.severity}
                    </span>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      variance.summary.overallImpact === 'critical' ? 'bg-red-100 text-red-800' :
                      variance.summary.overallImpact === 'high' ? 'bg-orange-100 text-orange-800' :
                      variance.summary.overallImpact === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-blue-100 text-blue-800'
                    }`}>
                      {variance.summary.overallImpact}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <div className="text-gray-600">Total Variances</div>
                      <div className="font-medium text-gray-900">{variance.summary.totalVariances}</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Significant</div>
                      <div className="font-medium text-gray-900">{variance.summary.significantVariances}</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Critical</div>
                      <div className="font-medium text-gray-900">{variance.summary.criticalVariances}</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Avg Variance</div>
                      <div className="font-medium text-gray-900">{formatPercent(variance.summary.averageVariance * 100)}</div>
                    </div>
                  </div>

                  {/* Trend */}
                  <div className="mt-2 flex items-center space-x-2">
                    <span className="text-sm text-gray-600">Trend:</span>
                    <div className="flex items-center space-x-2">
                      {variance.summary.varianceTrend === 'improving' && <TrendingUp className="h-4 w-4 text-green-600" />}
                      {variance.summary.varianceTrend === 'declining' && <TrendingDownIcon className="h-4 w-4 text-green-600" />}
                      {variance.summary.varianceTrend === 'stable' && <ArrowRight className="h-4 w-4 text-blue-600" />}
                      <span className="text-sm font-medium capitalize text-gray-900">
                        {variance.summary.varianceTrend}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-2 ml-4">
                  <button
                    onClick={() => setSelectedVariance(variance)}
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

        {/* Empty State */}
        {filteredVariances.length === 0 && (
          <div className="p-12 text-center">
            <Target className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h5 className="text-lg font-medium text-gray-900 mb-2">No variances detected</h5>
            <p className="text-sm text-gray-600">
              {searchTerm || varianceFilter !== 'all' || severityFilter !== 'all'
                ? 'Try adjusting your search or filters'
                : 'No variances have been detected yet'
              }
            </p>
          </div>
        )}
      </div>

      {/* Selected Variance Details */}
      {selectedVariance && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Variance Details</h3>
              <button
                onClick={() => setSelectedVariance(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <XCircle className="h-6 w-6" />
              </button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="border-b border-gray-200">
            <nav className="flex space-x-8 px-6" aria-label="Tabs">
              {[
                { id: 'overview', name: 'Overview', icon: BarChart3 },
                { id: 'details', name: 'Details', icon: FileText },
                { id: 'analysis', name: 'Analysis', icon: LineChart },
                { id: 'resolution', name: 'Resolution', icon: CheckCircle2 }
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
                    <div className="text-sm text-gray-600">Total Variances</div>
                    <div className="text-2xl font-bold text-gray-900">{selectedVariance.summary.totalVariances}</div>
                  </div>
                  <div className="text-center p-4 bg-yellow-50 rounded-lg">
                    <div className="text-sm text-yellow-600">Significant</div>
                    <div className="text-2xl font-bold text-yellow-900">{selectedVariance.summary.significantVariances}</div>
                  </div>
                  <div className="text-center p-4 bg-red-50 rounded-lg">
                    <div className="text-sm text-red-600">Critical</div>
                    <div className="text-2xl font-bold text-red-900">{selectedVariance.summary.criticalVariances}</div>
                  </div>
                  <div className="text-center p-4 bg-blue-50 rounded-lg">
                    <div className="text-sm text-blue-600">Max Variance</div>
                    <div className="text-2xl font-bold text-blue-900">{formatPercent(selectedVariance.summary.maxVariance * 100)}</div>
                  </div>
                </div>

                {/* Trend Analysis */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="text-md font-semibold text-gray-900 mb-3">Trend Analysis</h4>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Variance Trend</span>
                        <div className="flex items-center space-x-2">
                          {selectedVariance.summary.varianceTrend === 'improving' && <TrendingUp className="h-4 w-4 text-green-600" />}
                          {selectedVariance.summary.varianceTrend === 'declining' && <TrendingDownIcon className="h-4 w-4 text-red-600" />}
                          {selectedVariance.summary.varianceTrend === 'stable' && <ArrowRight className="h-4 w-4 text-blue-600" />}
                          <span className="text-sm font-medium capitalize text-gray-900">
                            {selectedVariance.summary.varianceTrend}
                          </span>
                        </div>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Overall Impact</span>
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          selectedVariance.summary.overallImpact === 'critical' ? 'bg-red-100 text-red-800' :
                          selectedVariance.summary.overallImpact === 'high' ? 'bg-orange-100 text-orange-800' :
                          selectedVariance.summary.overallImpact === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-blue-100 text-blue-800'
                        }`}>
                          {selectedVariance.summary.overallImpact}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-md font-semibold text-gray-900 mb-3">Detection Info</h4>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Detected At</span>
                        <span className="text-sm font-medium text-gray-900">{formatDateTime(selectedVariance.metadata.detectedAt)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Detected By</span>
                        <span className="text-sm font-medium text-gray-900">{selectedVariance.metadata.detectedBy}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Status</span>
                        <span className="text-sm font-medium text-gray-900 capitalize">
                          {selectedVariance.metadata.acknowledged ? 'Acknowledged' : 'Pending'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Details Tab */}
            {activeTab === 'details' && (
              <div className="space-y-6">
                <h4 className="text-md font-semibold text-gray-900 mb-4">Variance Details</h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h5 className="text-sm font-medium text-gray-900 mb-3">Worker Variances</h5>
                    <div className="space-y-2">
                      {selectedVariance.details.workerVariances.map((wv, index) => (
                        <div key={index} className="border border-gray-200 rounded-lg p-3">
                          <div className="flex items-start space-x-3">
                            <Users className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                            <div className="flex-1">
                              <div className="text-sm font-medium text-gray-900">{wv.component}</div>
                              <div className="text-sm text-gray-600 mb-2">
                                Worker: {wv.workerId}
                              </div>
                              <div className="grid grid-cols-2 gap-4 text-xs">
                                <div>
                                  <span className="text-gray-600">Expected:</span>
                                  <span className="font-medium text-gray-900">{formatCurrency(wv.expectedValue)}</span>
                                </div>
                                <div>
                                  <span className="text-gray-600">Actual:</span>
                                  <span className="font-medium text-gray-900">{formatCurrency(wv.actualValue)}</span>
                                </div>
                                <div>
                                  <span className="text-gray-600">Variance:</span>
                                  <div className="flex items-center space-x-2">
                                    {wv.variance > 0 ? (
                                      <ArrowUp className="h-3 w-3 text-red-600" />
                                    ) : wv.variance < 0 ? (
                                      <ArrowDown className="h-3 w-3 text-green-600" />
                                    ) : (
                                      <Minus className="h-3 w-3 text-gray-600" />
                                    )}
                                    <span className={`font-medium ${
                                      wv.variance > 0 ? 'text-red-600' : 
                                      wv.variance < 0 ? 'text-green-600' : 'text-gray-600'
                                    }`}>
                                      {formatCurrency(Math.abs(wv.variance))}
                                    </span>
                                  </div>
                                </div>
                                <div>
                                  <span className="text-gray-600">% Change:</span>
                                  <div className="flex items-center space-x-2">
                                    {wv.variancePercentage > 0 ? (
                                      <ArrowUp className="h-3 w-3 text-red-600" />
                                    ) : wv.variancePercentage < 0 ? (
                                      <ArrowDown className="h-3 w-3 text-green-600" />
                                    ) : (
                                      <Equal className="h-3 w-3 text-gray-600" />
                                    )}
                                    <span className={`font-medium ${
                                      wv.variancePercentage > 0 ? 'text-red-600' : 
                                      wv.variancePercentage < 0 ? 'text-green-600' : 'text-gray-600'
                                    }`}>
                                      {formatPercent(wv.variancePercentage)}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <div className="text-xs text-gray-600 mt-2">
                                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                  wv.significance === 'critical' ? 'bg-red-100 text-red-800' :
                                  wv.significance === 'high' ? 'bg-orange-100 text-orange-800' :
                                  wv.significance === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-gray-100 text-gray-800'
                                }`}>
                                  {wv.significance}
                                </span>
                                {wv.impact && (
                                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ml-2 ${
                                    wv.impact === 'critical' ? 'bg-red-100 text-red-800' :
                                    wv.impact === 'high' ? 'bg-orange-100 text-orange-800' :
                                    wv.impact === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                                    'bg-blue-100 text-blue-800'
                                  }`}>
                                    {wv.impact}
                                  </span>
                                )}
                              </div>
                              {wv.rootCause && (
                                <div className="text-xs text-gray-900 mt-2">
                                  <strong>Root Cause:</strong> {wv.rootCause}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h5 className="text-sm font-medium text-gray-900 mb-3">Accounting Variances</h5>
                    <div className="space-y-2">
                      {selectedVariance.details.accountingVariances.map((av, index) => (
                        <div key={index} className="border border-gray-200 rounded-lg p-3">
                          <div className="flex items-start space-x-3">
                            <Calculator className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                            <div className="flex-1">
                              <div className="text-sm font-medium text-gray-900">{av.accountName}</div>
                              <div className="text-sm text-gray-600 mb-2">
                                Account: {av.accountId}
                              </div>
                              <div className="grid grid-cols-2 gap-4 text-xs">
                                <div>
                                  <span className="text-gray-600">Expected:</span>
                                  <span className="font-medium text-gray-900">{formatCurrency(av.expectedAmount)}</span>
                                </div>
                                <div>
                                  <span className="text-gray-600">Actual:</span>
                                  <span className="font-medium text-gray-900">{formatCurrency(av.actualAmount)}</span>
                                </div>
                                <div>
                                  <span className="text-gray-600">Variance:</span>
                                  <div className="flex items-center space-x-2">
                                    {av.variance > 0 ? (
                                      <ArrowUp className="h-3 w-3 text-red-600" />
                                    ) : av.variance < 0 ? (
                                      <ArrowDown className="h-3 w-3 text-green-600" />
                                    ) : (
                                      <Minus className="h-3 w-3 text-gray-600" />
                                    )}
                                    <span className={`font-medium ${
                                      av.variance > 0 ? 'text-red-600' : 
                                      av.variance < 0 ? 'text-green-600' : 'text-gray-600'
                                    }`}>
                                      {formatCurrency(Math.abs(av.variance))}
                                    </span>
                                  </div>
                                </div>
                                <div>
                                  <span className="text-gray-600">% Change:</span>
                                  <div className="flex items-center space-x-2">
                                    {av.variancePercentage > 0 ? (
                                      <ArrowUp className="h-3 w-3 text-red-600" />
                                    ) : av.variancePercentage < 0 ? (
                                      <ArrowDown className="h-3 w-3 text-green-600" />
                                    ) : (
                                      <Equal className="h-3 w-3 text-gray-600" />
                                    )}
                                    <span className={`font-medium ${
                                      av.variancePercentage > 0 ? 'text-red-600' : 
                                      av.variancePercentage < 0 ? 'text-green-600' : 'text-gray-600'
                                    }`}>
                                      {formatPercent(av.variancePercentage)}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <div className="text-xs text-gray-600 mt-2">
                                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                  av.significance === 'critical' ? 'bg-red-100 text-red-800' :
                                  av.significance === 'high' ? 'bg-orange-100 text-orange-800' :
                                  av.significance === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-gray-100 text-gray-800'
                                }`}>
                                  {av.significance}
                                </span>
                                {av.impact && (
                                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ml-2 ${
                                    av.impact === 'critical' ? 'bg-red-100 text-red-800' :
                                    av.impact === 'high' ? 'bg-orange-100 text-orange-800' :
                                    av.impact === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                                    'bg-blue-100 text-blue-800'
                                  }`}>
                                    {av.impact}
                                  </span>
                                )}
                              </div>
                              {av.rootCause && (
                                <div className="text-xs text-gray-900 mt-2">
                                  <strong>Root Cause:</strong> {av.rootCause}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Analysis Tab */}
            {activeTab === 'analysis' && (
              <div className="space-y-6">
                <h4 className="text-md font-semibold text-gray-900 mb-4">Variance Analysis</h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h5 className="text-sm font-medium text-gray-900 mb-3">Detected Patterns</h5>
                    <div className="space-y-3">
                      {selectedVariance.analysis.patterns.map((pattern, index) => (
                        <div key={index} className="border border-gray-200 rounded-lg p-3">
                          <div className="flex items-start space-x-3">
                            <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                            <div className="flex-1">
                              <div className="text-sm font-medium text-gray-900">{pattern.description}</div>
                              <div className="grid grid-cols-2 gap-4 text-xs mt-2">
                                <div>
                                  <span className="text-gray-600">Frequency:</span>
                                  <span className="font-medium text-gray-900">{pattern.frequency}</span>
                                </div>
                                <div>
                                  <span className="text-gray-600">Significance:</span>
                                  <span className="font-medium text-gray-900 capitalize">{pattern.significance}</span>
                                </div>
                                <div>
                                  <span className="text-gray-600">Affected:</span>
                                  <span className="font-medium text-gray-900">{pattern.affectedComponents.length}</span>
                                </div>
                              </div>
                              <div className="text-xs text-gray-900 mt-2">
                                <strong>Suggested Action:</strong> {pattern.suggestedAction}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h5 className="text-sm font-medium text-gray-900 mb-3">Root Causes</h5>
                    <div className="space-y-3">
                      {selectedVariance.analysis.rootCauses.map((cause, index) => (
                        <div key={index} className="border border-gray-200 rounded-lg p-3">
                          <div className="flex items-start space-x-3">
                            <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                            <div className="flex-1">
                              <div className="text-sm font-medium text-gray-900">{cause.description}</div>
                              <div className="grid grid-cols-2 gap-4 text-xs mt-2">
                                <div>
                                  <span className="text-gray-600">Category:</span>
                                  <span className="font-medium text-gray-900 capitalize">{cause.category}</span>
                                </div>
                                <div>
                                  <span className="text-gray-600">Likelihood:</span>
                                  <span className="font-medium text-gray-900">{(cause.likelihood * 100).toFixed(0)}%</span>
                                </div>
                                <div>
                                  <span className="text-gray-600">Impact:</span>
                                  <span className="font-medium text-gray-900 capitalize">{cause.impact}</span>
                                </div>
                              </div>
                              <div className="text-xs text-gray-900 mt-2">
                                <strong>Evidence:</strong>
                                <ul className="mt-1 space-y-1">
                                  {cause.evidence.map((evidence, index) => (
                                    <li key={index}>• {evidence}</li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Resolution Tab */}
            {activeTab === 'resolution' && (
              <div className="space-y-6">
                <h4 className="text-md font-semibold text-gray-900 mb-4">Resolution Plan</h4>
                
                <div className="space-y-4">
                  <div className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center space-x-3 mb-3">
                      <div className={`w-3 h-3 rounded-full ${
                        selectedVariance.resolution.status === 'completed' ? 'bg-green-600' :
                        selectedVariance.resolution.status === 'in_progress' ? 'bg-blue-600' :
                        selectedVariance.resolution.status === 'pending' ? 'bg-yellow-600' :
                        'bg-gray-600'
                      }`}></div>
                      <div>
                        <h5 className="text-sm font-medium text-gray-900">
                          Resolution Status: {selectedVariance.resolution.status.replace('_', ' ').toUpperCase()}
                        </h5>
                        <div className="text-sm text-gray-600">
                          Strategy: {selectedVariance.resolution.strategy}
                        </div>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-gray-600">Progress</span>
                        <span className="text-sm text-gray-900">{selectedVariance.resolution.progress}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                          style={{ width: `${selectedVariance.resolution.progress}%` }}
                        ></div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="space-y-3">
                      <h6 className="text-sm font-medium text-gray-900">Resolution Actions</h6>
                      {selectedVariance.resolution.actions.map((action, index) => (
                        <div key={action.actionId} className="flex items-start space-x-3 border border-gray-200 rounded-lg p-3">
                          <div className={`w-2 h-2 rounded-full mt-1 ${
                            action.status === 'completed' ? 'bg-green-600' :
                            action.status === 'in_progress' ? 'bg-blue-600' :
                            'bg-gray-400'
                          }`}></div>
                          <div className="flex-1">
                            <div className="text-sm font-medium text-gray-900">{action.description}</div>
                            <div className="grid grid-cols-2 gap-4 text-xs mt-2">
                              <div>
                                <span className="text-gray-600">Type:</span>
                                <span className="font-medium text-gray-900 capitalize">{action.type}</span>
                              </div>
                              <div>
                                <span className="text-gray-600">Assigned To:</span>
                                <span className="font-medium text-gray-900">{action.assignedTo || 'Unassigned'}</span>
                              </div>
                              <div>
                                <span className="text-gray-600">Due Date:</span>
                                <span className="font-medium text-gray-900">
                                  {action.dueDate ? formatDateTime(action.dueDate) : 'Not set'}
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-600">Completed:</span>
                                <span className="font-medium text-gray-900">
                                  {action.completedAt ? formatDateTime(action.completedAt) : 'Pending'}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
