// Payroll Simulation History Panel - Phase 3E
// Comprehensive simulation history and management component
// PHASE 3E PAYROLL SIMULATION ONLY — SHADOW SAFE

import React, { useState, useEffect, useMemo } from "react";
import {
  History,
  Search,
  Filter,
  Download,
  Eye,
  Archive,
  Trash2,
  RefreshCw,
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Play,
  Pause,
  Square,
  FileText,
  BarChart3,
  Users,
  Calculator,
  Settings,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Info,
  Loader2,
  Database,
  HardDrive,
  Cpu,
  Activity,
  TrendingUp,
  TrendingDown,
  Zap,
  Shield,
  Target,
  Gauge,
  FileSearch,
  Copy,
  Share,
  Star,
  Flag,
  Tag,
  Folder,
  FolderOpen,
  Grid,
  List,
  MoreHorizontal,
  DownloadCloud,
  FileCheck,
  AlertCircle,
  CheckCircle2
} from "lucide-react";
import { payrollSimulationEngine, archiveSimulationRun } from "../lib/payrollSimulationExecution";
import type {
  PayrollSimulationRun,
  PayrollSimulationResult,
  PayrollSimulationConfig,
  PayrollSimulationParameters
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

interface PayrollSimulationHistoryPanelProps {
  companyId: string;
  payrollPeriodId: string;
  onSimulationSelect?: (simulation: PayrollSimulationRun) => void;
  readOnly?: boolean;
}

export default function PayrollSimulationHistoryPanel({
  companyId,
  payrollPeriodId,
  onSimulationSelect,
  readOnly = false
}: PayrollSimulationHistoryPanelProps) {
  const [loading, setLoading] = useState(true);
  const [simulations, setSimulations] = useState<PayrollSimulationRun[]>([]);
  const [selectedSimulations, setSelectedSimulations] = useState<string[]>([]);
  const [expandedSimulation, setExpandedSimulation] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterDateRange, setFilterDateRange] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("createdAt");
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [showFilters, setShowFilters] = useState(false);
  const [archiving, setArchiving] = useState<string | null>(null);

  // Load simulation history
  useEffect(() => {
    async function loadSimulationHistory() {
      try {
        setLoading(true);
        
        // Mock simulation history data (in real implementation, would fetch from database)
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
            status: 'failed',
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
              completedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000 + 10 * 60 * 1000).toISOString(),
              duration: 10 * 60 * 1000,
              estimatedDuration: 20 * 60 * 1000,
              retryCount: 2,
              maxRetries: 3
            }
          },
          {
            id: 'sim_004',
            companyId,
            payrollPeriodId,
            simulationType: {
              category: 'comparison',
              type: 'baseline_comparison',
              description: 'Baseline comparison simulation',
              isDestructive: false,
              requiresApproval: false,
              estimatedDuration: 25
            },
            executionMode: 'comparison',
            status: 'completed',
            priority: 'low',
            configuration: {
              companyId,
              payrollPeriodId,
              executionMode: 'comparison',
              safetyLevel: 'moderate',
              enableTelemetry: true,
              enableAudit: true,
              enableValidation: true,
              enableComparison: true,
              timeoutMinutes: 40,
              retryAttempts: 2,
              isolationLevel: 'moderate',
              duplicatePrevention: true,
              rollbackPreparation: false
            },
            parameters: {
              comparisonBaseline: 'sim_001',
              precisionLevel: 'detailed',
              includeAccountingPreview: true,
              includeComplianceValidation: true,
              includeReconciliation: true,
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
              safetyScore: 90,
              safetyChecks: [],
              warnings: ['Comparison mode - moderate isolation'],
              blocked: false
            },
            metadata: {
              createdBy: 'user_003',
              createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
              startedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
              completedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000 + 22 * 60 * 1000).toISOString(),
              duration: 22 * 60 * 1000,
              estimatedDuration: 25 * 60 * 1000,
              retryCount: 0,
              maxRetries: 2
            }
          }
        ];
        
        setSimulations(mockSimulations);
      } catch (error) {
        console.error("Error loading simulation history:", error);
      } finally {
        setLoading(false);
      }
    }

    loadSimulationHistory();
  }, [companyId, payrollPeriodId]);

  // Filter and sort simulations
  const filteredSimulations = useMemo(() => {
    return simulations
      .filter(simulation => {
        const matchesSearch = searchTerm === "" || 
                           simulation.simulationType.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           simulation.id.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = filterStatus === "all" || simulation.status === filterStatus;
        const matchesType = filterType === "all" || simulation.simulationType.category === filterType;
        const matchesDateRange = filterDateRange === "all" || 
                               (filterDateRange === "week" && new Date(simulation.metadata.createdAt) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)) ||
                               (filterDateRange === "month" && new Date(simulation.metadata.createdAt) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
        return matchesSearch && matchesStatus && matchesType && matchesDateRange;
      })
      .sort((a, b) => {
        let comparison = 0;
        switch (sortBy) {
          case 'createdAt':
            comparison = new Date(a.metadata.createdAt).getTime() - new Date(b.metadata.createdAt).getTime();
            break;
          case 'status':
            comparison = a.status.localeCompare(b.status);
            break;
          case 'priority':
            const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 };
            comparison = (priorityOrder[a.priority as keyof typeof priorityOrder] || 0) - 
                       (priorityOrder[b.priority as keyof typeof priorityOrder] || 0);
            break;
          case 'duration':
            comparison = (a.metadata.duration || 0) - (b.metadata.duration || 0);
            break;
          case 'safetyScore':
            comparison = a.safety.safetyScore - b.safety.safetyScore;
            break;
          default:
            comparison = 0;
        }
        return sortOrder === 'asc' ? comparison : -comparison;
      });
  }, [simulations, searchTerm, filterStatus, filterType, filterDateRange, sortBy, sortOrder]);

  // Calculate statistics
  const statistics = useMemo(() => {
    const total = simulations.length;
    const completed = simulations.filter(s => s.status === 'completed').length;
    const failed = simulations.filter(s => s.status === 'failed').length;
    const running = simulations.filter(s => s.status === 'running').length;
    const pending = simulations.filter(s => s.status === 'pending').length;
    const avgSafetyScore = simulations.reduce((sum, s) => sum + s.safety.safetyScore, 0) / (total || 1);
    const totalDuration = simulations.reduce((sum, s) => sum + (s.metadata.duration || 0), 0);

    return {
      total,
      completed,
      failed,
      running,
      pending,
      avgSafetyScore,
      totalDuration,
      successRate: total > 0 ? (completed / total) * 100 : 0
    };
  }, [simulations]);

  // Archive simulation
  const archiveSimulation = async (simulationId: string) => {
    try {
      setArchiving(simulationId);
      
      const result = await archiveSimulationRun(simulationId, 'current_user');
      
      if (result.success) {
        // Remove from list
        setSimulations(prev => prev.filter(s => s.id !== simulationId));
        // Remove from selected if present
        setSelectedSimulations(prev => prev.filter(id => id !== simulationId));
      } else {
        alert('Archive failed: ' + result.message);
      }
    } catch (error: any) {
      console.error("Error archiving simulation:", error);
      alert('Archive failed: ' + (error?.message || String(error)));
    } finally {
      setArchiving(null);
    }
  };

  // Toggle simulation selection
  const toggleSimulationSelection = (simulationId: string) => {
    setSelectedSimulations(prev => 
      prev.includes(simulationId) 
        ? prev.filter(id => id !== simulationId)
        : [...prev, simulationId]
    );
  };

  // Select all simulations
  const selectAllSimulations = () => {
    setSelectedSimulations(filteredSimulations.map(s => s.id));
  };

  // Clear selection
  const clearSelection = () => {
    setSelectedSimulations([]);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mr-3" />
          <span className="text-gray-600">Loading simulation history...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Statistics Header */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <History className="h-8 w-8 text-blue-600 mr-3" />
            <div>
              <p className="text-sm text-gray-600">Total Simulations</p>
              <p className="text-xl font-bold text-gray-900">{statistics.total}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <CheckCircle className="h-8 w-8 text-green-600 mr-3" />
            <div>
              <p className="text-sm text-gray-600">Completed</p>
              <p className="text-xl font-bold text-green-600">{statistics.completed}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <XCircle className="h-8 w-8 text-red-600 mr-3" />
            <div>
              <p className="text-sm text-gray-600">Failed</p>
              <p className="text-xl font-bold text-red-600">{statistics.failed}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <Shield className="h-8 w-8 text-purple-600 mr-3" />
            <div>
              <p className="text-sm text-gray-600">Avg Safety Score</p>
              <p className="text-xl font-bold text-purple-600">{statistics.avgSafetyScore.toFixed(1)}%</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <Clock className="h-8 w-8 text-orange-600 mr-3" />
            <div>
              <p className="text-sm text-gray-600">Total Duration</p>
              <p className="text-xl font-bold text-orange-600">{formatDuration(statistics.totalDuration)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters and Controls */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Simulation History</h3>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setViewMode(viewMode === 'list' ? 'grid' : 'list')}
              className="p-2 text-gray-600 hover:text-gray-900"
            >
              {viewMode === 'list' ? <Grid className="h-5 w-5" /> : <List className="h-5 w-5" />}
            </button>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center space-x-2 p-2 text-gray-600 hover:text-gray-900"
            >
              <Filter className="h-5 w-5" />
              <span className="text-sm">Filters</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
            </button>
            <button className="flex items-center space-x-2 p-2 text-gray-600 hover:text-gray-900">
              <RefreshCw className="h-5 w-5" />
              <span className="text-sm">Refresh</span>
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search simulations..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Expanded Filters */}
        {showFilters && (
          <div className="mb-4 p-4 bg-gray-50 rounded-lg">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Status</option>
                  <option value="completed">Completed</option>
                  <option value="failed">Failed</option>
                  <option value="running">Running</option>
                  <option value="pending">Pending</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Types</option>
                  <option value="payroll_period">Payroll Period</option>
                  <option value="scenario">Scenario</option>
                  <option value="worker_group">Worker Group</option>
                  <option value="comparison">Comparison</option>
                  <option value="reconciliation">Reconciliation</option>
                  <option value="liability">Liability</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Date Range</label>
                <select
                  value={filterDateRange}
                  onChange={(e) => setFilterDateRange(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Time</option>
                  <option value="week">Last Week</option>
                  <option value="month">Last Month</option>
                  <option value="quarter">Last Quarter</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Sort By</label>
                <div className="flex space-x-2">
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="createdAt">Created Date</option>
                    <option value="status">Status</option>
                    <option value="priority">Priority</option>
                    <option value="duration">Duration</option>
                    <option value="safetyScore">Safety Score</option>
                  </select>
                  <button
                    onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                    className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    {sortOrder === 'asc' ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Selection Controls */}
        {selectedSimulations.length > 0 && (
          <div className="mb-4 p-3 bg-blue-50 rounded-lg flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={selectedSimulations.length === filteredSimulations.length}
                onChange={(e) => e.target.checked ? selectAllSimulations() : clearSelection()}
                className="rounded border-blue-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-blue-900">
                {selectedSimulations.length} of {filteredSimulations.length} selected
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <button className="flex items-center space-x-1 px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">
                <Download className="h-4 w-4" />
                Export
              </button>
              <button className="flex items-center space-x-1 px-3 py-1 text-sm bg-gray-600 text-white rounded hover:bg-gray-700">
                <Archive className="h-4 w-4" />
                Archive
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Simulation List */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h4 className="text-md font-semibold text-gray-900">
              {filteredSimulations.length} Simulation{filteredSimulations.length !== 1 ? 's' : ''}
            </h4>
            {selectedSimulations.length > 0 && (
              <button
                onClick={clearSelection}
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                Clear selection
              </button>
            )}
          </div>
        </div>

        {/* List View */}
        {viewMode === 'list' && (
          <div className="divide-y divide-gray-200">
            {filteredSimulations.map((simulation) => (
              <div key={simulation.id} className="p-6 hover:bg-gray-50">
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3 flex-1">
                    <input
                      type="checkbox"
                      checked={selectedSimulations.includes(simulation.id)}
                      onChange={() => toggleSimulationSelection(simulation.id)}
                      className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <h5 className="text-md font-medium text-gray-900">
                          {simulation.simulationType.description}
                        </h5>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          simulation.status === 'completed' ? 'bg-green-100 text-green-800' :
                          simulation.status === 'failed' ? 'bg-red-100 text-red-800' :
                          simulation.status === 'running' ? 'bg-blue-100 text-blue-800' :
                          simulation.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {simulation.status}
                        </span>
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                          {simulation.executionMode}
                        </span>
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {simulation.simulationType.category}
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

                      {/* Expanded Details */}
                      {expandedSimulation === simulation.id && (
                        <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                            <div>
                              <div className="text-gray-600">Execution Mode</div>
                              <div className="font-medium text-gray-900">{simulation.executionMode}</div>
                            </div>
                            <div>
                              <div className="text-gray-600">Safety Level</div>
                              <div className="font-medium text-gray-900">{simulation.configuration.safetyLevel}</div>
                            </div>
                            <div>
                              <div className="text-gray-600">Max Workers</div>
                              <div className="font-medium text-gray-900">{simulation.configuration.maxWorkers || 'Unlimited'}</div>
                            </div>
                            <div>
                              <div className="text-gray-600">Precision Level</div>
                              <div className="font-medium text-gray-900">{simulation.parameters.precisionLevel}</div>
                            </div>
                            <div>
                              <div className="text-gray-600">Created By</div>
                              <div className="font-medium text-gray-900">{simulation.metadata.createdBy}</div>
                            </div>
                            <div>
                              <div className="text-gray-600">Retry Count</div>
                              <div className="font-medium text-gray-900">
                                {simulation.metadata.retryCount} / {simulation.metadata.maxRetries}
                              </div>
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
                                      <li key={index}>• {warning}</li>
                                    ))}
                                  </ul>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 ml-4">
                    <button
                      onClick={() => setExpandedSimulation(
                        expandedSimulation === simulation.id ? null : simulation.id
                      )}
                      className="text-gray-600 hover:text-gray-900"
                    >
                      {expandedSimulation === simulation.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                    <button
                      onClick={() => onSimulationSelect && onSimulationSelect(simulation)}
                      className="text-blue-600 hover:text-blue-700"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                    <button className="text-gray-600 hover:text-gray-700">
                      <Download className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => archiveSimulation(simulation.id)}
                      disabled={archiving === simulation.id || readOnly}
                      className="text-orange-600 hover:text-orange-700 disabled:opacity-50"
                    >
                      {archiving === simulation.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Archive className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Grid View */}
        {viewMode === 'grid' && (
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredSimulations.map((simulation) => (
              <div key={simulation.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-lg transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={selectedSimulations.includes(simulation.id)}
                      onChange={() => toggleSimulationSelection(simulation.id)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      simulation.status === 'completed' ? 'bg-green-100 text-green-800' :
                      simulation.status === 'failed' ? 'bg-red-100 text-red-800' :
                      simulation.status === 'running' ? 'bg-blue-100 text-blue-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {simulation.status}
                    </span>
                  </div>
                  <button className="text-gray-400 hover:text-gray-600">
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </div>

                <h5 className="text-md font-medium text-gray-900 mb-2">
                  {simulation.simulationType.description}
                </h5>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Created:</span>
                    <span className="font-medium">{formatDateTime(simulation.metadata.createdAt)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Duration:</span>
                    <span className="font-medium">
                      {simulation.metadata.duration ? formatDuration(simulation.metadata.duration) : 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Safety:</span>
                    <span className="font-medium">{simulation.safety.safetyScore}%</span>
                  </div>
                </div>

                <div className="mt-4 flex items-center space-x-2">
                  <button
                    onClick={() => onSimulationSelect && onSimulationSelect(simulation)}
                    className="flex-1 flex items-center justify-center space-x-1 px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    <Eye className="h-4 w-4" />
                    <span className="text-sm">View</span>
                  </button>
                  <button className="p-2 text-gray-600 hover:text-gray-700">
                    <Download className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {filteredSimulations.length === 0 && (
          <div className="p-12 text-center">
            <FileSearch className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h5 className="text-lg font-medium text-gray-900 mb-2">No simulations found</h5>
            <p className="text-sm text-gray-600">
              {searchTerm || filterStatus !== 'all' || filterType !== 'all' || filterDateRange !== 'all'
                ? 'Try adjusting your search or filters'
                : 'No simulations have been executed yet'
              }
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
