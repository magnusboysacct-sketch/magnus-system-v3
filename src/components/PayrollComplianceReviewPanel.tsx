// Payroll Compliance Review Panel - Phase 3D
// Statutory compliance review and validation component
// PHASE 3D PAYROLL REVIEW UI ONLY — NO LIVE PAYROLL

import React, { useState, useEffect } from "react";
import {
  Shield,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Download,
  Eye,
  Filter,
  Search,
  Calendar,
  Clock,
  TrendingUp,
  TrendingDown,
  Info,
  Settings,
  Loader2,
  FileText,
  Users,
  Building,
  Target
} from "lucide-react";
import { payrollAccountingIntegration } from "../lib/payrollAccountingIntegration";
import type { PayrollStatutoryComplianceStatus, PayrollStatutoryDeadline } from "../lib/payrollAccountingIntegration";

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

interface PayrollComplianceReviewPanelProps {
  companyId: string;
  payrollPeriodId: string;
  onComplianceSelect?: (compliance: PayrollStatutoryComplianceStatus) => void;
  readOnly?: boolean;
}

export default function PayrollComplianceReviewPanel({
  companyId,
  payrollPeriodId,
  onComplianceSelect,
  readOnly = false
}: PayrollComplianceReviewPanelProps) {
  const [loading, setLoading] = useState(true);
  const [compliance, setCompliance] = useState<PayrollStatutoryComplianceStatus | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("status");

  // Load compliance data
  useEffect(() => {
    async function loadCompliance() {
      try {
        setLoading(true);
        
        // Get liability summary which contains compliance data
        const liabilitySummary = await payrollAccountingIntegration.calculatePayrollLiabilities(
          companyId,
          payrollPeriodId
        );
        
        setCompliance(liabilitySummary.statutoryCompliance);
      } catch (error) {
        console.error("Error loading compliance data:", error);
      } finally {
        setLoading(false);
      }
    }

    loadCompliance();
  }, [companyId, payrollPeriodId]);

  // Refresh compliance
  const refreshCompliance = async () => {
    if (loading) return;

    try {
      setLoading(true);
      
      const liabilitySummary = await payrollAccountingIntegration.calculatePayrollLiabilities(
        companyId,
        payrollPeriodId
      );
      
      setCompliance(liabilitySummary.statutoryCompliance);
    } catch (error) {
      console.error("Error refreshing compliance:", error);
    } finally {
      setLoading(false);
    }
  };

  // Filter and sort compliance items
  const complianceItems = [
    {
      id: 'nis',
      name: 'NIS Compliance',
      description: 'National Insurance Scheme compliance validation',
      status: compliance?.nisCompliance || false,
      category: 'statutory_deduction',
      statutoryReference: 'National Insurance Scheme Act',
      lastChecked: compliance?.lastComplianceCheck || new Date().toISOString()
    },
    {
      id: 'nht',
      name: 'NHT Compliance',
      description: 'National Housing Trust compliance validation',
      status: compliance?.nhtCompliance || false,
      category: 'statutory_deduction',
      statutoryReference: 'National Housing Trust Act',
      lastChecked: compliance?.lastComplianceCheck || new Date().toISOString()
    },
    {
      id: 'paye',
      name: 'PAYE Compliance',
      description: 'Pay As You Earn tax compliance validation',
      status: compliance?.payeCompliance || false,
      category: 'tax_withholding',
      statutoryReference: 'Income Tax Act',
      lastChecked: compliance?.lastComplianceCheck || new Date().toISOString()
    },
    {
      id: 'education_tax',
      name: 'Education Tax Compliance',
      description: 'Education tax compliance validation',
      status: compliance?.educationTaxCompliance || false,
      category: 'tax_withholding',
      statutoryReference: 'Education Tax Act',
      lastChecked: compliance?.lastComplianceCheck || new Date().toISOString()
    },
    {
      id: 'minimum_wage',
      name: 'Minimum Wage Compliance',
      description: 'Minimum wage compliance validation',
      status: compliance?.minimumWageCompliance || false,
      category: 'labor_standards',
      statutoryReference: 'Minimum Wage Act',
      lastChecked: compliance?.lastComplianceCheck || new Date().toISOString()
    },
    {
      id: 'deduction_limits',
      name: 'Deduction Limits',
      description: 'Statutory deduction limits compliance',
      status: compliance?.deductionLimitCompliance || false,
      category: 'limits_validation',
      statutoryReference: 'Various Statutory Acts',
      lastChecked: compliance?.lastComplianceCheck || new Date().toISOString()
    }
  ]
    .filter(item => {
      const matchesSearch = searchTerm === "" || 
                           item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           item.description.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = filterCategory === "all" || item.category === filterCategory;
      return matchesSearch && matchesCategory;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'status':
          return (b.status ? 1 : 0) - (a.status ? 1 : 0);
        case 'name':
          return a.name.localeCompare(b.name);
        case 'category':
          return a.category.localeCompare(b.category);
        default:
          return 0;
      }
    });

  // Get unique categories
  const uniqueCategories = Array.from(new Set(complianceItems.map(item => item.category)));

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mr-3" />
          <span className="text-gray-600">Loading compliance data...</span>
        </div>
      </div>
    );
  }

  if (!compliance) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="text-center py-12">
          <XCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Compliance Data</h3>
          <p className="text-gray-600">Unable to load compliance data. Please try again.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Compliance Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Statutory Compliance</h3>
            <p className="text-sm text-gray-600">
              Jamaican statutory requirements validation • Last checked: {formatDateTime(compliance.lastComplianceCheck)}
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <div className={`px-3 py-1 rounded-full text-sm font-medium ${
              compliance.overallComplianceScore >= 95 ? 'bg-green-100 text-green-800' :
              compliance.overallComplianceScore >= 85 ? 'bg-yellow-100 text-yellow-800' :
              'bg-red-100 text-red-800'
            }`}>
              {formatPercent(compliance.overallComplianceScore)} Overall Score
            </div>
            <button
              onClick={refreshCompliance}
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

        {/* Compliance Score Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <div className="text-2xl font-bold text-green-900">{formatPercent(compliance.overallComplianceScore)}</div>
            <div className="text-sm text-green-700">Overall Score</div>
          </div>
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <div className="text-2xl font-bold text-blue-900">
              {complianceItems.filter(item => item.status).length}
            </div>
            <div className="text-sm text-blue-700">Compliant Areas</div>
          </div>
          <div className="text-center p-4 bg-red-50 rounded-lg">
            <div className="text-2xl font-bold text-red-900">
              {complianceItems.filter(item => !item.status).length}
            </div>
            <div className="text-sm text-red-700">Non-Compliant Areas</div>
          </div>
          <div className="text-center p-4 bg-purple-50 rounded-lg">
            <div className="text-2xl font-bold text-purple-900">
              {compliance.statutoryDeadlines.length}
            </div>
            <div className="text-sm text-purple-700">Upcoming Deadlines</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Filter className="h-4 w-4 text-gray-500" />
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Categories</option>
              {uniqueCategories.map((category) => (
                <option key={category} value={category}>
                  {category.replace('_', ' ').replace(/\b\w/g, char => char.toUpperCase())}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center space-x-2">
            <input
              type="text"
              placeholder="Search compliance areas..."
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
              <option value="status">Sort by Status</option>
              <option value="name">Sort by Name</option>
              <option value="category">Sort by Category</option>
            </select>
          </div>
        </div>
      </div>

      {/* Compliance Items */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h4 className="text-md font-semibold text-gray-900">
            Compliance Areas ({complianceItems.length})
          </h4>
        </div>
        <div className="divide-y divide-gray-200">
          {complianceItems.map((item) => (
            <div
              key={item.id}
              className="p-4 hover:bg-gray-50 cursor-pointer transition-colors"
              onClick={() => onComplianceSelect && onComplianceSelect(compliance!)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    {item.status ? (
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-500" />
                    )}
                    <h5 className="font-medium text-gray-900">{item.name}</h5>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      item.category === 'statutory_deduction' ? 'bg-blue-100 text-blue-800' :
                      item.category === 'tax_withholding' ? 'bg-orange-100 text-orange-800' :
                      item.category === 'labor_standards' ? 'bg-green-100 text-green-800' :
                      'bg-purple-100 text-purple-800'
                    }`}>
                      {item.category.replace('_', ' ').replace(/\b\w/g, char => char.toUpperCase())}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mb-2">{item.description}</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-gray-600">Status</div>
                      <div className={`font-medium ${
                        item.status ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {item.status ? 'Compliant' : 'Non-Compliant'}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-600">Last Checked</div>
                      <div className="font-medium text-gray-900">{formatDateTime(item.lastChecked)}</div>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 mt-2">
                    Reference: {item.statutoryReference}
                  </div>
                </div>

                <div className="flex items-center space-x-2 ml-4">
                  <button className="text-blue-600 hover:text-blue-700">
                    <Eye className="h-4 w-4" />
                  </button>
                  <button className="text-gray-600 hover:text-gray-700">
                    <FileText className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Statutory Deadlines */}
      {compliance.statutoryDeadlines.length > 0 && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h4 className="text-md font-semibold text-gray-900">Statutory Deadlines</h4>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {compliance.statutoryDeadlines.map((deadline, index) => (
                <div key={index} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <Calendar className={`h-5 w-5 ${
                      deadline.status === 'upcoming' ? 'text-blue-500' :
                      deadline.status === 'due' ? 'text-orange-500' :
                      deadline.status === 'overdue' ? 'text-red-500' :
                      'text-green-500'
                    }`} />
                    <div>
                      <div className="font-medium text-gray-900">{deadline.description}</div>
                      <div className="text-sm text-gray-600">
                        {deadline.type.replace('_', ' ').replace(/\b\w/g, char => char.toUpperCase())}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      deadline.status === 'upcoming' ? 'bg-blue-100 text-blue-800' :
                      deadline.status === 'due' ? 'bg-orange-100 text-orange-800' :
                      deadline.status === 'overdue' ? 'bg-red-100 text-red-800' :
                      'bg-green-100 text-green-800'
                    }`}>
                      {deadline.status.toUpperCase()}
                    </div>
                    <div className="text-sm text-gray-900 mt-1">
                      {formatDateTime(deadline.dueDate)}
                    </div>
                    {deadline.amount && (
                      <div className="text-sm font-medium text-gray-900">
                        {formatCurrency(deadline.amount)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Compliance Issues Summary */}
      {compliance.complianceIssues.length > 0 && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h4 className="text-md font-semibold text-gray-900">Compliance Issues</h4>
          </div>
          <div className="p-6">
            <div className="space-y-3">
              {compliance.complianceIssues.map((issue, index) => (
                <div key={index} className="flex items-start space-x-3 p-4 bg-red-50 rounded-lg">
                  <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="font-medium text-red-900">{issue.type}</div>
                    <div className="text-sm text-red-800">{issue.description}</div>
                    <div className="text-sm text-red-700 mt-1">
                      Affected Employees: {issue.affectedEmployees || 0}
                    </div>
                    <div className="text-sm text-red-700">
                      Recommended Action: {issue.recommendedAction || 'N/A'}
                    </div>
                    {issue.dueDate && (
                      <div className="text-sm text-red-700">
                        Due Date: {issue.dueDate ? formatDateTime(issue.dueDate) : 'N/A'}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Next Compliance Check */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-md font-semibold text-gray-900">Next Compliance Check</h4>
            <p className="text-sm text-gray-600">
              Scheduled automatic validation
            </p>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold text-gray-900">
              Next compliance check scheduled for {formatDateTime(compliance.nextComplianceDue || '')}
            </div>
            <div className="text-sm text-gray-600">
              {compliance.nextComplianceDue ? Math.ceil((new Date(compliance.nextComplianceDue).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : 0} days
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
