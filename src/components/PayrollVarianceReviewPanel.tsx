// Payroll Variance Review Panel - Phase 3D
// Variance detection and review component
// PHASE 3D PAYROLL REVIEW UI ONLY — NO LIVE PAYROLL

import React, { useState, useEffect } from "react";
import {
  AlertTriangle,
  CheckCircle,
  XCircle,
  TrendingUp,
  TrendingDown,
  Filter,
  Search,
  RefreshCw,
  Download,
  Eye,
  Edit,
  MessageSquare,
  Clock,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Info,
  Loader2,
  Zap,
  AlertCircle
} from "lucide-react";
import { payrollAccountingIntegration } from "../lib/payrollAccountingIntegration";
import type { PayrollVariance, PayrollVarianceReconciliation } from "../lib/payrollAccountingIntegration";

function formatCurrency(value: number) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
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

interface PayrollVarianceReviewPanelProps {
  companyId: string;
  payrollPeriodId: string;
  onVarianceSelect?: (variance: PayrollVariance) => void;
  readOnly?: boolean;
}

export default function PayrollVarianceReviewPanel({
  companyId,
  payrollPeriodId,
  onVarianceSelect,
  readOnly = false
}: PayrollVarianceReviewPanelProps) {
  const [loading, setLoading] = useState(true);
  const [variances, setVariances] = useState<PayrollVariance[]>([]);
  const [reconciliation, setReconciliation] = useState<PayrollVarianceReconciliation | null>(null);
  const [selectedVariance, setSelectedVariance] = useState<PayrollVariance | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterSeverity, setFilterSeverity] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("severity");

  // Load variances
  useEffect(() => {
    async function loadVariances() {
      try {
        setLoading(true);
        
        // Get reconciliation data which contains variances
        const reconciliationData = await payrollAccountingIntegration.generatePayrollVarianceReconciliation(
          companyId,
          payrollPeriodId,
          'automatic'
        );
        
        setReconciliation(reconciliationData);
        
        // Extract variances from reconciliation (mock implementation)
        const mockVariances: PayrollVariance[] = [
          {
            id: 'var_001',
            type: 'calculation_error',
            description: 'NIS calculation variance detected',
            expectedAmount: 1581.25,
            actualAmount: 1585.50,
            varianceAmount: 4.25,
            variancePercent: 0.27,
            severity: 'low',
            employeeId: 'emp001',
            accountId: 'acc_002',
            projectId: 'proj_001',
            department: 'Engineering',
            detectedAt: new Date().toISOString(),
            resolution: 'Under review',
            resolvedAt: undefined,
            resolvedBy: undefined
          },
          {
            id: 'var_002',
            type: 'rounding_difference',
            description: 'PAYE tax rounding difference',
            expectedAmount: 8750.00,
            actualAmount: 8751.50,
            varianceAmount: 1.50,
            variancePercent: 0.02,
            severity: 'low',
            employeeId: 'emp002',
            accountId: 'acc_003',
            projectId: 'proj_001',
            department: 'Sales',
            detectedAt: new Date().toISOString(),
            resolution: 'Accepted as rounding tolerance',
            resolvedAt: new Date().toISOString(),
            resolvedBy: 'system'
          },
          {
            id: 'var_003',
            type: 'account_mapping_error',
            description: 'Incorrect account mapping for overtime',
            expectedAmount: 7500.00,
            actualAmount: 7000.00,
            varianceAmount: -500.00,
            variancePercent: -6.67,
            severity: 'high',
            employeeId: 'emp003',
            accountId: 'acc_004',
            projectId: 'proj_002',
            department: 'Production',
            detectedAt: new Date().toISOString(),
            resolution: undefined,
            resolvedAt: undefined,
            resolvedBy: undefined
          }
        ];
        
        setVariances(mockVariances);
      } catch (error) {
        console.error("Error loading variances:", error);
      } finally {
        setLoading(false);
      }
    }

    loadVariances();
  }, [companyId, payrollPeriodId]);

  // Filter and sort variances
  const filteredVariances = variances
    .filter(variance => {
      const matchesSearch = searchTerm === "" || 
                           variance.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           variance.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           variance.employeeId?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = filterType === "all" || variance.type === filterType;
      const matchesSeverity = filterSeverity === "all" || variance.severity === filterSeverity;
      return matchesSearch && matchesType && matchesSeverity;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'severity':
          const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
          return (severityOrder[b.severity as keyof typeof severityOrder] || 0) - 
                 (severityOrder[a.severity as keyof typeof severityOrder] || 0);
        case 'varianceAmount':
          return Math.abs(b.varianceAmount) - Math.abs(a.varianceAmount);
        case 'variancePercent':
          return Math.abs(b.variancePercent) - Math.abs(a.variancePercent);
        case 'detectedAt':
          return new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime();
        default:
          return 0;
      }
    });

  // Get unique types and severity levels
  const uniqueTypes = Array.from(new Set(variances.map(v => v.type)));
  const uniqueSeverities = Array.from(new Set(variances.map(v => v.severity)));

  // Calculate variance statistics
  const varianceStats = {
    total: variances.length,
    critical: variances.filter(v => v.severity === 'critical').length,
    high: variances.filter(v => v.severity === 'high').length,
    medium: variances.filter(v => v.severity === 'medium').length,
    low: variances.filter(v => v.severity === 'low').length,
    resolved: variances.filter(v => v.resolution).length,
    unresolved: variances.filter(v => !v.resolution).length,
    totalVarianceAmount: variances.reduce((sum, v) => sum + Math.abs(v.varianceAmount), 0),
    averageVarianceAmount: variances.length > 0 ? variances.reduce((sum, v) => sum + Math.abs(v.varianceAmount), 0) / variances.length : 0
  };

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
      {/* Variance Summary */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Variance Analysis</h3>
            <p className="text-sm text-gray-600">
              {varianceStats.total} variances detected • {formatCurrency(varianceStats.totalVarianceAmount)} total variance
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <button className="flex items-center space-x-2 bg-gray-100 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-200">
              <RefreshCw className="h-4 w-4" />
              <span className="text-sm">Refresh</span>
            </button>
            <button className="flex items-center space-x-2 bg-gray-100 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-200">
              <Download className="h-4 w-4" />
              <span className="text-sm">Export</span>
            </button>
          </div>
        </div>

        {/* Variance Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="text-center p-4 bg-red-50 rounded-lg">
            <div className="text-2xl font-bold text-red-900">{varianceStats.critical}</div>
            <div className="text-sm text-red-700">Critical</div>
          </div>
          <div className="text-center p-4 bg-orange-50 rounded-lg">
            <div className="text-2xl font-bold text-orange-900">{varianceStats.high}</div>
            <div className="text-sm text-orange-700">High</div>
          </div>
          <div className="text-center p-4 bg-yellow-50 rounded-lg">
            <div className="text-2xl font-bold text-yellow-900">{varianceStats.medium}</div>
            <div className="text-sm text-yellow-700">Medium</div>
          </div>
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <div className="text-2xl font-bold text-blue-900">{varianceStats.low}</div>
            <div className="text-sm text-blue-700">Low</div>
          </div>
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <div className="text-2xl font-bold text-green-900">{varianceStats.resolved}</div>
            <div className="text-sm text-green-700">Resolved</div>
          </div>
        </div>

        {/* Additional Stats */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-600">Unresolved</div>
            <div className="text-lg font-bold text-gray-900">{varianceStats.unresolved}</div>
          </div>
          <div className="p-4 bg-purple-50 rounded-lg">
            <div className="text-sm text-purple-600">Average Variance</div>
            <div className="text-lg font-bold text-purple-900">{formatCurrency(varianceStats.averageVarianceAmount)}</div>
          </div>
          <div className="p-4 bg-indigo-50 rounded-lg">
            <div className="text-sm text-indigo-600">Resolution Rate</div>
            <div className="text-lg font-bold text-indigo-900">
              {varianceStats.total > 0 ? formatPercent((varianceStats.resolved / varianceStats.total) * 100) : '0%'}
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Filter className="h-4 w-4 text-gray-500" />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Types</option>
              {uniqueTypes.map((type) => (
                <option key={type} value={type}>
                  {type.replace('_', ' ').replace(/\b\w/g, char => char.toUpperCase())}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center space-x-2">
            <select
              value={filterSeverity}
              onChange={(e) => setFilterSeverity(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Severities</option>
              {uniqueSeverities.map((severity) => (
                <option key={severity} value={severity}>
                  {severity.charAt(0).toUpperCase() + severity.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center space-x-2">
            <input
              type="text"
              placeholder="Search variances..."
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
              <option value="severity">Sort by Severity</option>
              <option value="varianceAmount">Sort by Amount</option>
              <option value="variancePercent">Sort by Percentage</option>
              <option value="detectedAt">Sort by Date</option>
            </select>
          </div>
        </div>
      </div>

      {/* Variance List */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h4 className="text-md font-semibold text-gray-900">
            Variances ({filteredVariances.length})
          </h4>
        </div>
        <div className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
          {filteredVariances.map((variance) => (
            <div
              key={variance.id}
              className="p-4 hover:bg-gray-50 cursor-pointer transition-colors"
              onClick={() => {
                setSelectedVariance(variance);
                onVarianceSelect && onVarianceSelect(variance);
              }}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <h5 className="font-medium text-gray-900">{variance.description}</h5>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      variance.severity === 'critical' ? 'bg-red-100 text-red-800' :
                      variance.severity === 'high' ? 'bg-orange-100 text-orange-800' :
                      variance.severity === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-blue-100 text-blue-800'
                    }`}>
                      {variance.severity.toUpperCase()}
                    </span>
                    {variance.resolution && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        RESOLVED
                      </span>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-gray-600">Type</div>
                      <div className="font-medium text-gray-900">
                        {variance.type.replace('_', ' ').replace(/\b\w/g, char => char.toUpperCase())}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-600">Expected</div>
                      <div className="font-medium text-gray-900">{formatCurrency(variance.expectedAmount)}</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Actual</div>
                      <div className="font-medium text-gray-900">{formatCurrency(variance.actualAmount)}</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Variance</div>
                      <div className={`font-medium ${
                        variance.varianceAmount > 0 ? 'text-red-600' : 'text-green-600'
                      }`}>
                        {variance.varianceAmount > 0 ? '+' : ''}{formatCurrency(variance.varianceAmount)}
                        <span className="text-gray-500 ml-1">
                          ({variance.variancePercent > 0 ? '+' : ''}{formatPercent(variance.variancePercent)})
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Additional Details */}
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="text-gray-600">Employee</div>
                      <div className="font-medium text-gray-900">{variance.employeeId || 'N/A'}</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Department</div>
                      <div className="font-medium text-gray-900">{variance.department || 'N/A'}</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Detected</div>
                      <div className="font-medium text-gray-900">{formatDateTime(variance.detectedAt)}</div>
                    </div>
                  </div>

                  {/* Resolution Information */}
                  {variance.resolution && (
                    <div className="mt-3 p-3 bg-green-50 rounded-lg">
                      <div className="flex items-center space-x-2 mb-2">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                        <span className="font-medium text-green-900">Resolution</span>
                      </div>
                      <div className="text-sm text-green-800">{variance.resolution}</div>
                      <div className="text-xs text-green-600 mt-1">
                        Resolved by {variance.resolvedBy} on {formatDateTime(variance.resolvedAt!)}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center space-x-2 ml-4">
                  <button className="text-blue-600 hover:text-blue-700">
                    <Eye className="h-4 w-4" />
                  </button>
                  {!variance.resolution && !readOnly && (
                    <button className="text-green-600 hover:text-green-700">
                      <Edit className="h-4 w-4" />
                    </button>
                  )}
                  <button className="text-gray-600 hover:text-gray-700">
                    <MessageSquare className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Selected Variance Details */}
      {selectedVariance && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-md font-semibold text-gray-900">Variance Details</h4>
            <button
              onClick={() => setSelectedVariance(null)}
              className="text-gray-400 hover:text-gray-600"
            >
              <XCircle className="h-5 w-5" />
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h5 className="font-medium text-gray-900 mb-3">Variance Information</h5>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">ID:</span>
                  <span className="font-medium">{selectedVariance.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Type:</span>
                  <span className="font-medium">{selectedVariance.type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Severity:</span>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    selectedVariance.severity === 'critical' ? 'bg-red-100 text-red-800' :
                    selectedVariance.severity === 'high' ? 'bg-orange-100 text-orange-800' :
                    selectedVariance.severity === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-blue-100 text-blue-800'
                  }`}>
                    {selectedVariance.severity.toUpperCase()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Detected:</span>
                  <span className="font-medium">{formatDateTime(selectedVariance.detectedAt)}</span>
                </div>
              </div>
            </div>
            
            <div>
              <h5 className="font-medium text-gray-900 mb-3">Financial Impact</h5>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Expected:</span>
                  <span className="font-medium">{formatCurrency(selectedVariance.expectedAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Actual:</span>
                  <span className="font-medium">{formatCurrency(selectedVariance.actualAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Variance:</span>
                  <span className={`font-medium ${
                    selectedVariance.varianceAmount > 0 ? 'text-red-600' : 'text-green-600'
                  }`}>
                    {selectedVariance.varianceAmount > 0 ? '+' : ''}{formatCurrency(selectedVariance.varianceAmount)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Percentage:</span>
                  <span className={`font-medium ${
                    selectedVariance.variancePercent > 0 ? 'text-red-600' : 'text-green-600'
                  }`}>
                    {selectedVariance.variancePercent > 0 ? '+' : ''}{formatPercent(selectedVariance.variancePercent)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          {!selectedVariance.resolution && !readOnly && (
            <div className="mt-6 flex items-center space-x-3">
              <button className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
                <Edit className="h-4 w-4" />
                <span>Resolve Variance</span>
              </button>
              <button className="flex items-center space-x-2 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200">
                <MessageSquare className="h-4 w-4" />
                <span>Add Comment</span>
              </button>
              <button className="flex items-center space-x-2 bg-red-100 text-red-700 px-4 py-2 rounded-lg hover:bg-red-200">
                <AlertTriangle className="h-4 w-4" />
                <span>Escalate</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
