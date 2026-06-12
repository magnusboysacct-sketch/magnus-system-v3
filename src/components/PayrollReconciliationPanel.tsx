// Payroll Reconciliation Panel - Phase 3D
// Payroll reconciliation and balancing review component
// PHASE 3D PAYROLL REVIEW UI ONLY — NO LIVE PAYROLL

import React, { useState, useEffect } from "react";
import {
  Scale,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Download,
  Eye,
  Filter,
  Search,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Info,
  Settings,
  Clock,
  Target,
  Shield,
  Loader2,
  ChevronDown,
  ChevronUp,
  ArrowUpRight,
  ArrowDownRight
} from "lucide-react";
import { payrollAccountingIntegration } from "../lib/payrollAccountingIntegration";
import type { PayrollReconciliationResult, PayrollBalancingCheck, PayrollAccountMappingValidation } from "../lib/payrollAccountingIntegration";

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

interface PayrollReconciliationPanelProps {
  companyId: string;
  payrollPeriodId: string;
  onReconciliationSelect?: (reconciliation: PayrollReconciliationResult) => void;
  readOnly?: boolean;
}

export default function PayrollReconciliationPanel({
  companyId,
  payrollPeriodId,
  onReconciliationSelect,
  readOnly = false
}: PayrollReconciliationPanelProps) {
  const [loading, setLoading] = useState(true);
  const [reconciliation, setReconciliation] = useState<PayrollReconciliationResult | null>(null);
  const [expandedChecks, setExpandedChecks] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("checkType");

  // Load reconciliation data
  useEffect(() => {
    async function loadReconciliation() {
      try {
        setLoading(true);
        
        // Get reconciliation data
        const reconciliationData = await payrollAccountingIntegration.reconcilePayrollToGL(
          companyId,
          payrollPeriodId,
          [], // Mock posting lines
          { employees: [] } // Mock payroll data
        );
        
        setReconciliation(reconciliationData);
      } catch (error) {
        console.error("Error loading reconciliation:", error);
      } finally {
        setLoading(false);
      }
    }

    loadReconciliation();
  }, [companyId, payrollPeriodId]);

  // Refresh reconciliation
  const refreshReconciliation = async () => {
    if (loading) return;

    try {
      setLoading(true);
      
      const reconciliationData = await payrollAccountingIntegration.reconcilePayrollToGL(
        companyId,
        payrollPeriodId,
        [],
        { employees: [] }
      );
      
      setReconciliation(reconciliationData);
    } catch (error) {
      console.error("Error refreshing reconciliation:", error);
    } finally {
      setLoading(false);
    }
  };

  // Toggle check expansion
  const toggleCheckExpansion = (checkId: string) => {
    const newExpanded = new Set(expandedChecks);
    if (newExpanded.has(checkId)) {
      newExpanded.delete(checkId);
    } else {
      newExpanded.add(checkId);
    }
    setExpandedChecks(newExpanded);
  };

  // Filter and sort balancing checks
  const filteredChecks = reconciliation?.balancingChecks
    .filter(check => {
      const matchesSearch = searchTerm === "" || 
                           check.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           check.checkType.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = filterStatus === "all" || 
                           (filterStatus === "passed" && check.passed) ||
                           (filterStatus === "failed" && !check.passed);
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'checkType':
          return a.checkType.localeCompare(b.checkType);
        case 'variance':
          return Math.abs(b.variance) - Math.abs(a.variance);
        case 'description':
          return a.description.localeCompare(b.description);
        default:
          return 0;
      }
    }) || [];

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mr-3" />
          <span className="text-gray-600">Loading reconciliation data...</span>
        </div>
      </div>
    );
  }

  if (!reconciliation) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="text-center py-12">
          <XCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Reconciliation Data</h3>
          <p className="text-gray-600">Unable to load reconciliation data. Please try again.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Reconciliation Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Payroll Reconciliation</h3>
            <p className="text-sm text-gray-600">
              Period {reconciliation.payrollPeriodId} • {formatDateTime(reconciliation.reconciliationDate)}
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <div className={`px-3 py-1 rounded-full text-sm font-medium ${
              reconciliation.status === 'reconciled' ? 'bg-green-100 text-green-800' :
              reconciliation.status === 'variance_detected' ? 'bg-yellow-100 text-yellow-800' :
              reconciliation.status === 'failed' ? 'bg-red-100 text-red-800' :
              'bg-gray-100 text-gray-800'
            }`}>
              {reconciliation.status.replace('_', ' ').toUpperCase()}
            </div>
            <button
              onClick={refreshReconciliation}
              disabled={loading}
              className="flex items-center space-x-2 bg-gray-100 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-200 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              <span className="text-sm">Refresh</span>
            </button>
            <button className="flex items-center space-x-2 bg-gray-100 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-200">
              <Download className="h-4 w-4" />
              <span className="text-sm">Export</span>
            </button>
          </div>
        </div>

        {/* Reconciliation Summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-600">Confidence Score</div>
            <div className="text-lg font-bold text-gray-900">{formatPercent(reconciliation.confidenceScore)}</div>
          </div>
          <div className="p-4 bg-blue-50 rounded-lg">
            <div className="text-sm text-blue-600">Total Transactions</div>
            <div className="text-lg font-bold text-blue-900">{reconciliation.summary.totalPayrollTransactions}</div>
          </div>
          <div className="p-4 bg-green-50 rounded-lg">
            <div className="text-sm text-green-600">Reconciled</div>
            <div className="text-lg font-bold text-green-900">{reconciliation.summary.reconciledTransactions}</div>
          </div>
          <div className="p-4 bg-red-50 rounded-lg">
            <div className="text-sm text-red-600">Variances</div>
            <div className="text-lg font-bold text-red-900">{reconciliation.summary.varianceTransactions}</div>
          </div>
        </div>

        {/* Variance Analysis */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-orange-50 rounded-lg">
            <div className="text-sm text-orange-600">Total Variance</div>
            <div className="text-lg font-bold text-orange-900">{formatCurrency(reconciliation.summary.totalVarianceAmount)}</div>
          </div>
          <div className="p-4 bg-purple-50 rounded-lg">
            <div className="text-sm text-purple-600">Largest Variance</div>
            <div className="text-lg font-bold text-purple-900">{formatCurrency(reconciliation.summary.largestVariance)}</div>
          </div>
          <div className="p-4 bg-indigo-50 rounded-lg">
            <div className="text-sm text-indigo-600">Average Variance</div>
            <div className="text-lg font-bold text-indigo-900">{formatCurrency(reconciliation.summary.averageVariance)}</div>
          </div>
        </div>

        {/* Reconciliation Status */}
        <div className="mt-4 p-4 border border-gray-200 rounded-lg">
          <div className="flex items-center space-x-3">
            {reconciliation.status === 'reconciled' ? (
              <>
                <CheckCircle className="h-5 w-5 text-green-500" />
                <span className="font-medium text-green-900">Payroll successfully reconciled</span>
              </>
            ) : reconciliation.status === 'variance_detected' ? (
              <>
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
                <span className="font-medium text-yellow-900">Variances detected - review required</span>
              </>
            ) : (
              <>
                <XCircle className="h-5 w-5 text-red-500" />
                <span className="font-medium text-red-900">Reconciliation failed - action needed</span>
              </>
            )}
          </div>
        </div>
      </div>

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
              <option value="all">All Checks</option>
              <option value="passed">Passed Only</option>
              <option value="failed">Failed Only</option>
            </select>
          </div>
          <div className="flex items-center space-x-2">
            <input
              type="text"
              placeholder="Search checks..."
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
              <option value="checkType">Sort by Check Type</option>
              <option value="variance">Sort by Variance</option>
              <option value="description">Sort by Description</option>
            </select>
          </div>
        </div>
      </div>

      {/* Balancing Checks */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h4 className="text-md font-semibold text-gray-900">
              Balancing Checks ({filteredChecks.length})
            </h4>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setExpandedChecks(new Set(reconciliation.balancingChecks.map(c => c.checkType)))}
                className="text-blue-600 hover:text-blue-700 text-sm"
              >
                Expand All
              </button>
              <button
                onClick={() => setExpandedChecks(new Set())}
                className="text-blue-600 hover:text-blue-700 text-sm"
              >
                Collapse All
              </button>
            </div>
          </div>
        </div>
        <div className="divide-y divide-gray-200">
          {filteredChecks.map((check, index) => (
            <div key={check.checkType} className="p-4 hover:bg-gray-50">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    {check.passed ? (
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-500" />
                    )}
                    <h5 className="font-medium text-gray-900">{check.description}</h5>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      check.passed ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {check.passed ? 'PASSED' : 'FAILED'}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="text-gray-600">Expected</div>
                      <div className="font-medium text-gray-900">{formatCurrency(check.expected)}</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Actual</div>
                      <div className="font-medium text-gray-900">{formatCurrency(check.actual)}</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Variance</div>
                      <div className={`font-medium ${
                        Math.abs(check.variance) <= check.tolerance ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {formatCurrency(check.variance)}
                        <span className="text-gray-500 ml-1">
                          (tolerance: ±{formatCurrency(check.tolerance)})
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Additional Details */}
                  {check.details && (
                    <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-start space-x-2">
                        <Info className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                        <div className="text-sm text-gray-700">{check.details}</div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center space-x-2 ml-4">
                  <button
                    onClick={() => toggleCheckExpansion(check.checkType)}
                    className="text-blue-600 hover:text-blue-700"
                  >
                    {expandedChecks.has(check.checkType) ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </button>
                  <button className="text-blue-600 hover:text-blue-700">
                    <Eye className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Account Mapping Validation */}
      {reconciliation.accountMappingValidation && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h4 className="text-md font-semibold text-gray-900">Account Mapping Validation</h4>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <div className="text-sm text-gray-600">Total Accounts</div>
                <div className="text-lg font-bold text-gray-900">{reconciliation.accountMappingValidation.totalAccounts}</div>
              </div>
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <div className="text-sm text-blue-600">Mapped Accounts</div>
                <div className="text-lg font-bold text-blue-900">{reconciliation.accountMappingValidation.mappedAccounts}</div>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <div className="text-sm text-green-600">Coverage</div>
                <div className="text-lg font-bold text-green-900">{formatPercent(reconciliation.accountMappingValidation.mappingCoverage)}</div>
              </div>
              <div className="text-center p-4 bg-purple-50 rounded-lg">
                <div className="text-sm text-purple-600">Validation Status</div>
                <div className={`text-lg font-bold capitalize ${
                  reconciliation.accountMappingValidation.validationStatus === 'valid' ? 'text-green-900' :
                  reconciliation.accountMappingValidation.validationStatus === 'warning' ? 'text-yellow-900' :
                  'text-red-900'
                }`}>
                  {reconciliation.accountMappingValidation.validationStatus}
                </div>
              </div>
            </div>

            {/* Mapping Issues */}
            {(reconciliation.accountMappingValidation.unmappedAccounts.length > 0 || reconciliation.accountMappingValidation.invalidMappings.length > 0) && (
              <div className="mt-6 space-y-4">
                {reconciliation.accountMappingValidation.unmappedAccounts.length > 0 && (
                  <div className="p-4 bg-yellow-50 rounded-lg">
                    <h5 className="font-medium text-yellow-900 mb-2">Unmapped Accounts</h5>
                    <ul className="space-y-1">
                      {reconciliation.accountMappingValidation.unmappedAccounts.map((account, index) => (
                        <li key={index} className="flex items-center space-x-2 text-sm text-yellow-800">
                          <AlertTriangle className="h-4 w-4" />
                          <span>{account}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {reconciliation.accountMappingValidation.invalidMappings.length > 0 && (
                  <div className="p-4 bg-red-50 rounded-lg">
                    <h5 className="font-medium text-red-900 mb-2">Invalid Mappings</h5>
                    <div className="space-y-3">
                      {reconciliation.accountMappingValidation.invalidMappings.map((mapping, index) => (
                        <div key={index} className="border border-red-200 rounded-lg p-3">
                          <div className="flex items-start space-x-2">
                            <XCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                            <div className="flex-1">
                              <div className="font-medium text-red-900">{mapping.payrollComponent.type}</div>
                              <div className="text-sm text-red-800">{mapping.issue}</div>
                              <div className="text-sm text-red-700 mt-1">Recommended: {mapping.recommendation}</div>
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

      {/* Recommendations */}
      {reconciliation.recommendations.length > 0 && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h4 className="text-md font-semibold text-gray-900">Recommendations</h4>
          </div>
          <div className="p-6">
            <div className="space-y-3">
              {reconciliation.recommendations.map((recommendation, index) => (
                <div key={index} className="flex items-start space-x-3 p-4 bg-blue-50 rounded-lg">
                  <Info className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-gray-700">{recommendation}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Compliance Validation */}
      {reconciliation.complianceValidation && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h4 className="text-md font-semibold text-gray-900">Compliance Validation</h4>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="flex items-center space-x-3 p-4 border border-gray-200 rounded-lg">
                {reconciliation.complianceValidation.statutoryDeductionsValid ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-500" />
                )}
                <div>
                  <div className="font-medium text-gray-900">Statutory Deductions</div>
                  <div className="text-sm text-gray-600">
                    {reconciliation.complianceValidation.statutoryDeductionsValid ? 'Valid' : 'Invalid'}
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-3 p-4 border border-gray-200 rounded-lg">
                {reconciliation.complianceValidation.employerContributionsValid ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-500" />
                )}
                <div>
                  <div className="font-medium text-gray-900">Employer Contributions</div>
                  <div className="text-sm text-gray-600">
                    {reconciliation.complianceValidation.employerContributionsValid ? 'Valid' : 'Invalid'}
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-3 p-4 border border-gray-200 rounded-lg">
                {reconciliation.complianceValidation.taxCalculationsValid ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-500" />
                )}
                <div>
                  <div className="font-medium text-gray-900">Tax Calculations</div>
                  <div className="text-sm text-gray-600">
                    {reconciliation.complianceValidation.taxCalculationsValid ? 'Valid' : 'Invalid'}
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-3 p-4 border border-gray-200 rounded-lg">
                {reconciliation.complianceValidation.minimumWageCompliance ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-500" />
                )}
                <div>
                  <div className="font-medium text-gray-900">Minimum Wage</div>
                  <div className="text-sm text-gray-600">
                    {reconciliation.complianceValidation.minimumWageCompliance ? 'Compliant' : 'Non-compliant'}
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-3 p-4 border border-gray-200 rounded-lg">
                {reconciliation.complianceValidation.deductionLimitsValid ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-500" />
                )}
                <div>
                  <div className="font-medium text-gray-900">Deduction Limits</div>
                  <div className="text-sm text-gray-600">
                    {reconciliation.complianceValidation.deductionLimitsValid ? 'Within Limits' : 'Exceeds Limits'}
                  </div>
                </div>
              </div>
              <div className="text-center p-4 bg-purple-50 rounded-lg">
                <div className="text-sm text-purple-600">Overall Score</div>
                <div className="text-lg font-bold text-purple-900">{formatPercent(reconciliation.complianceValidation.overallComplianceScore)}</div>
              </div>
            </div>

            {/* Compliance Issues */}
            {reconciliation.complianceValidation.complianceIssues.length > 0 && (
              <div className="mt-6 p-4 bg-red-50 rounded-lg">
                <h5 className="font-medium text-red-900 mb-2">Compliance Issues</h5>
                <ul className="space-y-1">
                  {reconciliation.complianceValidation.complianceIssues.map((issue, index) => (
                    <li key={index} className="flex items-start space-x-2 text-sm text-red-800">
                      <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <span>{issue.description}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
