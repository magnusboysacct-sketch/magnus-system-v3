// Payroll Accounting Review Panel - Phase 3D
// Accounting mapping and integration review component
// PHASE 3D PAYROLL REVIEW UI ONLY — NO LIVE PAYROLL

import React, { useState, useEffect } from "react";
import {
  FileText,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Download,
  Eye,
  Filter,
  Search,
  Settings,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Info,
  Loader2,
  Map,
  Building,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Edit,
  Trash2
} from "lucide-react";
import { payrollAccountingIntegration } from "../lib/payrollAccountingIntegration";
import type { PayrollAccountingMapping, PayrollAccountMappingValidation } from "../lib/payrollAccountingIntegration";

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

interface PayrollAccountingReviewPanelProps {
  companyId: string;
  payrollPeriodId: string;
  onMappingSelect?: (mapping: PayrollAccountingMapping) => void;
  readOnly?: boolean;
}

export default function PayrollAccountingReviewPanel({
  companyId,
  payrollPeriodId,
  onMappingSelect,
  readOnly = false
}: PayrollAccountingReviewPanelProps) {
  const [loading, setLoading] = useState(true);
  const [mappings, setMappings] = useState<PayrollAccountingMapping[]>([]);
  const [validation, setValidation] = useState<PayrollAccountMappingValidation | null>(null);
  const [selectedMapping, setSelectedMapping] = useState<PayrollAccountingMapping | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterComponent, setFilterComponent] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("accountCode");

  // Load accounting mappings
  useEffect(() => {
    async function loadAccountingMappings() {
      try {
        setLoading(true);
        
        // Get account mapping validation which contains mappings
        const validationData = await payrollAccountingIntegration.validateAccountingMappings(
          companyId,
          [] // Mock posting lines
        );
        
        setValidation(validationData);
        
        // Mock mappings data (in real implementation, would fetch from database)
        const mockMappings: PayrollAccountingMapping[] = [
          {
            id: 'map_001',
            companyId,
            payrollComponent: { 
              category: 'wages', 
              type: 'regular_wages', 
              description: 'Regular wages', 
              isTaxable: true, 
              isStatutory: false, 
              requiresEmployerContribution: false 
            },
            accountId: 'acc_001',
            accountCode: '5000',
            accountName: 'Wages Expense',
            isActive: true,
            effectiveDate: '2024-01-01',
            createdBy: 'system',
            createdAt: new Date().toISOString()
          },
          {
            id: 'map_002',
            companyId,
            payrollComponent: { 
              category: 'deductions', 
              type: 'nis_employee', 
              description: 'NIS employee deduction', 
              isTaxable: false, 
              isStatutory: true, 
              requiresEmployerContribution: true 
            },
            accountId: 'acc_002',
            accountCode: '2100',
            accountName: 'NIS Payable',
            isActive: true,
            effectiveDate: '2024-01-01',
            statutoryRequirement: 'National Insurance Scheme Act',
            createdBy: 'system',
            createdAt: new Date().toISOString()
          },
          {
            id: 'map_003',
            companyId,
            payrollComponent: { 
              category: 'deductions', 
              type: 'nht_employee', 
              description: 'NHT employee deduction', 
              isTaxable: false, 
              isStatutory: true, 
              requiresEmployerContribution: true 
            },
            accountId: 'acc_003',
            accountCode: '2101',
            accountName: 'NHT Payable',
            isActive: true,
            effectiveDate: '2024-01-01',
            statutoryRequirement: 'National Housing Trust Act',
            createdBy: 'system',
            createdAt: new Date().toISOString()
          },
          {
            id: 'map_004',
            companyId,
            payrollComponent: { 
              category: 'taxes', 
              type: 'paye_tax', 
              description: 'PAYE tax withholding', 
              isTaxable: false, 
              isStatutory: true, 
              requiresEmployerContribution: false 
            },
            accountId: 'acc_004',
            accountCode: '2102',
            accountName: 'PAYE Tax Payable',
            isActive: true,
            effectiveDate: '2024-01-01',
            statutoryRequirement: 'Income Tax Act',
            createdBy: 'system',
            createdAt: new Date().toISOString()
          },
          {
            id: 'map_005',
            companyId,
            payrollComponent: { 
              category: 'wages', 
              type: 'net_payroll', 
              description: 'Net payroll payable', 
              isTaxable: false, 
              isStatutory: false, 
              requiresEmployerContribution: false 
            },
            accountId: 'acc_005',
            accountCode: '2001',
            accountName: 'Salaries Payable',
            isActive: true,
            effectiveDate: '2024-01-01',
            createdBy: 'system',
            createdAt: new Date().toISOString()
          }
        ];
        
        setMappings(mockMappings);
      } catch (error) {
        console.error("Error loading accounting mappings:", error);
      } finally {
        setLoading(false);
      }
    }

    loadAccountingMappings();
  }, [companyId, payrollPeriodId]);

  // Refresh mappings
  const refreshMappings = async () => {
    if (loading) return;

    try {
      setLoading(true);
      
      const validationData = await payrollAccountingIntegration.validateAccountingMappings(
        companyId,
        []
      );
      
      setValidation(validationData);
    } catch (error) {
      console.error("Error refreshing mappings:", error);
    } finally {
      setLoading(false);
    }
  };

  // Filter and sort mappings
  const filteredMappings = mappings
    .filter(mapping => {
      const matchesSearch = searchTerm === "" || 
                           mapping.accountName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           mapping.accountCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           mapping.payrollComponent.description.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = filterStatus === "all" || 
                           (filterStatus === "active" && mapping.isActive) ||
                           (filterStatus === "inactive" && !mapping.isActive);
      const matchesComponent = filterComponent === "all" || mapping.payrollComponent.type === filterComponent;
      return matchesSearch && matchesStatus && matchesComponent;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'accountCode':
          return a.accountCode.localeCompare(b.accountCode);
        case 'accountName':
          return a.accountName.localeCompare(b.accountName);
        case 'component':
          return a.payrollComponent.type.localeCompare(b.payrollComponent.type);
        case 'category':
          return a.payrollComponent.category.localeCompare(b.payrollComponent.category);
        default:
          return 0;
      }
    });

  // Get unique components and statuses
  const uniqueComponents = Array.from(new Set(mappings.map(m => m.payrollComponent.type)));
  const componentCategories = [
    { value: 'wages', label: 'Wages & Salaries' },
    { value: 'deductions', label: 'Deductions' },
    { value: 'taxes', label: 'Taxes' },
    { value: 'contributions', label: 'Contributions' }
  ];

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mr-3" />
          <span className="text-gray-600">Loading accounting mappings...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Accounting Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Accounting Mappings</h3>
            <p className="text-sm text-gray-600">
              Payroll component to general ledger account mappings
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={refreshMappings}
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
            {!readOnly && (
              <button className="flex items-center space-x-2 bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700">
                <Edit className="h-4 w-4" />
                <span className="text-sm">Edit Mappings</span>
              </button>
            )}
          </div>
        </div>

        {/* Mapping Summary */}
        {validation && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="text-sm text-gray-600">Total Mappings</div>
              <div className="text-lg font-bold text-gray-900">{validation.totalAccounts}</div>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <div className="text-sm text-green-600">Mapped Accounts</div>
              <div className="text-lg font-bold text-green-900">{validation.mappedAccounts}</div>
            </div>
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <div className="text-sm text-blue-600">Coverage</div>
              <div className="text-lg font-bold text-blue-900">{formatPercent(validation.mappingCoverage)}</div>
            </div>
            <div className="text-center p-4 bg-purple-50 rounded-lg">
              <div className="text-sm text-purple-600">Validation Status</div>
              <div className={`text-lg font-bold capitalize ${
                validation.validationStatus === 'valid' ? 'text-green-900' :
                validation.validationStatus === 'warning' ? 'text-yellow-900' :
                'text-red-900'
              }`}>
                {validation.validationStatus}
              </div>
            </div>
          </div>
        )}
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
              <option value="all">All Status</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>
          </div>
          <div className="flex items-center space-x-2">
            <select
              value={filterComponent}
              onChange={(e) => setFilterComponent(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Components</option>
              {componentCategories.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center space-x-2">
            <input
              type="text"
              placeholder="Search mappings..."
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
              <option value="accountCode">Sort by Account Code</option>
              <option value="accountName">Sort by Account Name</option>
              <option value="component">Sort by Component</option>
              <option value="category">Sort by Category</option>
            </select>
          </div>
        </div>
      </div>

      {/* Mappings List */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h4 className="text-md font-semibold text-gray-900">
            Account Mappings ({filteredMappings.length})
          </h4>
        </div>
        <div className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
          {filteredMappings.map((mapping) => (
            <div
              key={mapping.id}
              className="p-4 hover:bg-gray-50 cursor-pointer transition-colors"
              onClick={() => {
                setSelectedMapping(mapping);
                onMappingSelect && onMappingSelect(mapping);
              }}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <h5 className="font-medium text-gray-900">{mapping.accountCode} - {mapping.accountName}</h5>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      mapping.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {mapping.isActive ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-gray-600">Component</div>
                      <div className="font-medium text-gray-900">{mapping.payrollComponent.type}</div>
                      <div className="text-xs text-gray-500">{mapping.payrollComponent.category}</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Effective Date</div>
                      <div className="font-medium text-gray-900">{formatDateTime(mapping.effectiveDate)}</div>
                    </div>
                  </div>

                  {/* Additional Details */}
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-gray-600">Department</div>
                      <div className="font-medium text-gray-900">{mapping.department || 'All Departments'}</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Project</div>
                      <div className="font-medium text-gray-900">{mapping.project || 'All Projects'}</div>
                    </div>
                  </div>

                  {mapping.statutoryRequirement && (
                    <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                      <div className="flex items-start space-x-2">
                        <Info className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                        <div className="text-sm text-blue-700">
                          <div className="font-medium text-blue-900">Statutory Requirement</div>
                          <div>{mapping.statutoryRequirement}</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {mapping.notes && (
                    <div className="mt-3 p-3 bg-yellow-50 rounded-lg">
                      <div className="flex items-start space-x-2">
                        <Info className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                        <div className="text-sm text-yellow-700">
                          <div className="font-medium text-yellow-900">Notes</div>
                          <div>{mapping.notes}</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center space-x-2 ml-4">
                  <button className="text-blue-600 hover:text-blue-700">
                    <Eye className="h-4 w-4" />
                  </button>
                  {!readOnly && (
                    <>
                      <button className="text-green-600 hover:text-green-700">
                        <Edit className="h-4 w-4" />
                      </button>
                      <button className="text-red-600 hover:text-red-700">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Mapping Validation Issues */}
      {validation && (validation.unmappedAccounts.length > 0 || validation.invalidMappings.length > 0) && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h4 className="text-md font-semibold text-gray-900">Validation Issues</h4>
          </div>
          <div className="p-6">
            {/* Unmapped Accounts */}
            {validation.unmappedAccounts.length > 0 && (
              <div className="mb-6">
                <h5 className="font-medium text-red-900 mb-3">Unmapped Components</h5>
                <div className="space-y-2">
                  {validation.unmappedAccounts.map((account, index) => (
                    <div key={index} className="flex items-center space-x-3 p-3 bg-red-50 rounded-lg">
                      <XCircle className="h-4 w-4 text-red-600" />
                      <div className="flex-1">
                        <div className="font-medium text-red-900">{account}</div>
                        <div className="text-sm text-red-800">No account mapping found</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Invalid Mappings */}
            {validation.invalidMappings.length > 0 && (
              <div>
                <h5 className="font-medium text-orange-900 mb-3">Invalid Mappings</h5>
                <div className="space-y-3">
                  {validation.invalidMappings.map((invalidMapping, index) => (
                    <div key={index} className="border border-orange-200 rounded-lg p-4">
                      <div className="flex items-start space-x-3">
                        <AlertTriangle className="h-4 w-4 text-orange-600 mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                          <div className="font-medium text-orange-900">{invalidMapping.payrollComponent.type}</div>
                          <div className="text-sm text-orange-800">{invalidMapping.issue}</div>
                          <div className="text-sm text-orange-700 mt-1">Recommended: {invalidMapping.recommendation}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Selected Mapping Details */}
      {selectedMapping && (
        <div className="bg-white rounded-lg shadow">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h4 className="text-md font-semibold text-gray-900">Mapping Details</h4>
            <button
              onClick={() => setSelectedMapping(null)}
              className="text-gray-400 hover:text-gray-600"
            >
              <XCircle className="h-5 w-5" />
            </button>
          </div>
          
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h5 className="font-medium text-gray-900 mb-3">Account Information</h5>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Account Code:</span>
                    <span className="font-medium">{selectedMapping.accountCode}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Account Name:</span>
                    <span className="font-medium">{selectedMapping.accountName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Status:</span>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      selectedMapping.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {selectedMapping.isActive ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  </div>
                </div>
              </div>
              
              <div>
                <h5 className="font-medium text-gray-900 mb-3">Component Information</h5>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Component Type:</span>
                    <span className="font-medium">{selectedMapping.payrollComponent.type}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Category:</span>
                    <span className="font-medium">{selectedMapping.payrollComponent.category}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Description:</span>
                    <span className="font-medium">{selectedMapping.payrollComponent.description}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Taxable:</span>
                    <span className={`font-medium ${
                      selectedMapping.payrollComponent.isTaxable ? 'text-green-600' : 'text-gray-600'
                    }`}>
                      {selectedMapping.payrollComponent.isTaxable ? 'Yes' : 'No'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Statutory:</span>
                    <span className={`font-medium ${
                      selectedMapping.payrollComponent.isStatutory ? 'text-blue-600' : 'text-gray-600'
                    }`}>
                      {selectedMapping.payrollComponent.isStatutory ? 'Yes' : 'No'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Additional Information */}
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
              <div>
                <h5 className="font-medium text-gray-900 mb-3">Configuration</h5>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Effective Date:</span>
                    <span className="font-medium">{formatDateTime(selectedMapping.effectiveDate)}</span>
                  </div>
                  {selectedMapping.expiryDate && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Expiry Date:</span>
                      <span className="font-medium">{formatDateTime(selectedMapping.expiryDate)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-600">Department:</span>
                    <span className="font-medium">{selectedMapping.department || 'All Departments'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Project:</span>
                    <span className="font-medium">{selectedMapping.project || 'All Projects'}</span>
                  </div>
                </div>
              </div>
              
              <div>
                <h5 className="font-medium text-gray-900 mb-3">Audit Information</h5>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Created By:</span>
                    <span className="font-medium">{selectedMapping.createdBy}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Created At:</span>
                    <span className="font-medium">{formatDateTime(selectedMapping.createdAt)}</span>
                  </div>
                  {selectedMapping.updatedBy && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Updated By:</span>
                      <span className="font-medium">{selectedMapping.updatedBy}</span>
                    </div>
                  )}
                  {selectedMapping.updatedAt && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Updated At:</span>
                      <span className="font-medium">{formatDateTime(selectedMapping.updatedAt)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            {!readOnly && (
              <div className="mt-6 flex items-center space-x-3">
                <button className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
                  <Edit className="h-4 w-4" />
                  <span>Edit Mapping</span>
                </button>
                <button className="flex items-center space-x-2 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200">
                  <FileText className="h-4 w-4" />
                  <span>View History</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
