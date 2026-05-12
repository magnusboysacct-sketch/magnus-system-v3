// Payroll Comparison Table - Phase 2C-1
// Worker-level payroll comparison table for review dashboard
// PHASE 2C-1 READ-ONLY REVIEW DASHBOARD — NOT ACTIVE PAYROLL

import React, { useState } from 'react';
import { 
  ChevronUp, 
  ChevronDown, 
  ChevronsUpDown, 
  Eye, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  Clock,
  Filter,
  Search
} from 'lucide-react';

interface WorkerComparison {
  id: string;
  workerId: string;
  workerName: string;
  employeeId: string;
  usNetPay: number;
  jamaicanNetPay: number;
  difference: number;
  differencePercentage: number;
  validationStatus: 'valid' | 'warning' | 'error' | 'not_available';
  warningCount: number;
  payrollCountry: string;
  regularHours: number;
  overtimeHours: number;
  grossPay: number;
}

interface PayrollPeriod {
  id: string;
  period_start: string;
  period_end: string;
  status: string;
  total_workers: number;
  total_net: number;
}

interface PayrollComparisonTableProps {
  workers: WorkerComparison[];
  periodData?: PayrollPeriod | null;
  onWorkerClick?: (worker: WorkerComparison) => void;
}

type SortField = 'workerName' | 'usNetPay' | 'jamaicanNetPay' | 'difference' | 'differencePercentage' | 'warningCount';
type SortDirection = 'asc' | 'desc';

export default function PayrollComparisonTable({ workers, periodData, onWorkerClick }: PayrollComparisonTableProps) {
  const [sortField, setSortField] = useState<SortField>('workerName');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatPercentage = (value: number) => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
  };

  const getValidationIcon = (status: string) => {
    switch (status) {
      case 'valid':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-yellow-600" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-600" />;
      case 'not_available':
        return <Clock className="w-4 h-4 text-slate-400" />;
      default:
        return <Clock className="w-4 h-4 text-slate-400" />;
    }
  };

  const getValidationColor = (status: string) => {
    switch (status) {
      case 'valid':
        return 'text-green-700 bg-green-100';
      case 'warning':
        return 'text-yellow-700 bg-yellow-100';
      case 'error':
        return 'text-red-700 bg-red-100';
      case 'not_available':
        return 'text-slate-700 bg-slate-100';
      default:
        return 'text-slate-700 bg-slate-100';
    }
  };

  const getDifferenceColor = (difference: number) => {
    if (Math.abs(difference) < 1) return 'text-green-600'; // Small difference
    if (Math.abs(difference) < 10) return 'text-yellow-600'; // Medium difference
    return 'text-red-600'; // Large difference
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ChevronsUpDown className="w-4 h-4 text-slate-400" />;
    }
    return sortDirection === 'asc' ? 
      <ChevronUp className="w-4 h-4 text-slate-600" /> : 
      <ChevronDown className="w-4 h-4 text-slate-600" />;
  };

  // Filter and sort workers
  const filteredWorkers = workers
    .filter(worker => {
      const matchesSearch = worker.workerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          worker.employeeId?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || worker.validationStatus === statusFilter;
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      let aValue: number | string;
      let bValue: number | string;

      switch (sortField) {
        case 'workerName':
          aValue = a.workerName;
          bValue = b.workerName;
          break;
        case 'usNetPay':
          aValue = a.usNetPay;
          bValue = b.usNetPay;
          break;
        case 'jamaicanNetPay':
          aValue = a.jamaicanNetPay;
          bValue = b.jamaicanNetPay;
          break;
        case 'difference':
          aValue = Math.abs(a.difference);
          bValue = Math.abs(b.difference);
          break;
        case 'differencePercentage':
          aValue = Math.abs(a.differencePercentage);
          bValue = Math.abs(b.differencePercentage);
          break;
        case 'warningCount':
          aValue = a.warningCount;
          bValue = b.warningCount;
          break;
        default:
          aValue = a.workerName;
          bValue = b.workerName;
      }

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc' ? 
          aValue.localeCompare(bValue) : 
          bValue.localeCompare(aValue);
      }

      return sortDirection === 'asc' ? 
        (aValue as number) - (bValue as number) : 
        (bValue as number) - (aValue as number);
    });

  const validationStatusCounts = {
    all: workers.length,
    valid: workers.filter(w => w.validationStatus === 'valid').length,
    warning: workers.filter(w => w.validationStatus === 'warning').length,
    error: workers.filter(w => w.validationStatus === 'error').length,
    not_available: workers.filter(w => w.validationStatus === 'not_available').length,
  };

  return (
    <div className="bg-white rounded-lg border border-slate-200">
      {/* Table Header */}
      <div className="p-6 border-b border-slate-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Worker Comparison Details</h2>
            <p className="text-sm text-slate-600 mt-1">
              {periodData ? (
                <>Payroll period: {new Date(periodData.period_start).toLocaleDateString()} - {new Date(periodData.period_end).toLocaleDateString()}</>
              ) : (
                <>Shadow Jamaican payroll calculations comparison</>
              )}
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search workers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-64"
              />
            </div>
            
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-500" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">All Status ({validationStatusCounts.all})</option>
                <option value="valid">Valid ({validationStatusCounts.valid})</option>
                <option value="warning">Warning ({validationStatusCounts.warning})</option>
                <option value="error">Error ({validationStatusCounts.error})</option>
                <option value="not_available">Not Available ({validationStatusCounts.not_available})</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-3 text-left">
                <button
                  onClick={() => handleSort('workerName')}
                  className="flex items-center gap-1 text-xs font-medium text-slate-700 uppercase tracking-wider hover:text-slate-900"
                >
                  Worker
                  {getSortIcon('workerName')}
                </button>
              </th>
              <th className="px-6 py-3 text-right">
                <button
                  onClick={() => handleSort('usNetPay')}
                  className="flex items-center gap-1 text-xs font-medium text-slate-700 uppercase tracking-wider hover:text-slate-900 justify-end"
                >
                  US Net Pay
                  {getSortIcon('usNetPay')}
                </button>
              </th>
              <th className="px-6 py-3 text-right">
                <button
                  onClick={() => handleSort('jamaicanNetPay')}
                  className="flex items-center gap-1 text-xs font-medium text-slate-700 uppercase tracking-wider hover:text-slate-900 justify-end"
                >
                  Jamaican Net Pay
                  {getSortIcon('jamaicanNetPay')}
                </button>
              </th>
              <th className="px-6 py-3 text-right">
                <button
                  onClick={() => handleSort('difference')}
                  className="flex items-center gap-1 text-xs font-medium text-slate-700 uppercase tracking-wider hover:text-slate-900 justify-end"
                >
                  Difference
                  {getSortIcon('difference')}
                </button>
              </th>
              <th className="px-6 py-3 text-right">
                <button
                  onClick={() => handleSort('differencePercentage')}
                  className="flex items-center gap-1 text-xs font-medium text-slate-700 uppercase tracking-wider hover:text-slate-900 justify-end"
                >
                  Difference %
                  {getSortIcon('differencePercentage')}
                </button>
              </th>
              <th className="px-6 py-3 text-center">
                <span className="text-xs font-medium text-slate-700 uppercase tracking-wider">Status</span>
              </th>
              <th className="px-6 py-3 text-center">
                <button
                  onClick={() => handleSort('warningCount')}
                  className="flex items-center gap-1 text-xs font-medium text-slate-700 uppercase tracking-wider hover:text-slate-900 justify-center"
                >
                  Warnings
                  {getSortIcon('warningCount')}
                </button>
              </th>
              <th className="px-6 py-3 text-left">
                <span className="text-xs font-medium text-slate-700 uppercase tracking-wider">Payroll Country</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {filteredWorkers.map((worker) => (
              <tr 
                key={worker.id} 
                className={`hover:bg-slate-50 ${onWorkerClick ? 'cursor-pointer' : ''}`}
                onClick={() => onWorkerClick?.(worker)}
              >
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <div>
                      <div className="text-sm font-medium text-slate-900">{worker.workerName}</div>
                      <div className="text-xs text-slate-500">{worker.employeeId || 'No ID'}</div>
                    </div>
                    {onWorkerClick && (
                      <Eye className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="text-sm text-slate-900">{formatCurrency(worker.usNetPay)}</div>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="text-sm text-slate-900">{formatCurrency(worker.jamaicanNetPay)}</div>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className={`text-sm font-medium ${getDifferenceColor(worker.difference)}`}>
                    {formatCurrency(worker.difference)}
                  </div>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className={`text-sm font-medium ${getDifferenceColor(worker.differencePercentage)}`}>
                    {formatPercentage(worker.differencePercentage)}
                  </div>
                </td>
                <td className="px-6 py-4 text-center">
                  <div className="flex items-center justify-center gap-2">
                    {getValidationIcon(worker.validationStatus)}
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getValidationColor(worker.validationStatus)}`}>
                      {worker.validationStatus.replace('_', ' ')}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4 text-center">
                  <div className="flex items-center justify-center">
                    {worker.warningCount > 0 ? (
                      <div className="flex items-center gap-1">
                        <AlertTriangle className="w-4 h-4 text-yellow-600" />
                        <span className="text-sm font-medium text-yellow-600">{worker.warningCount}</span>
                      </div>
                    ) : (
                      <span className="text-sm text-slate-400">0</span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="text-sm text-slate-900">{worker.payrollCountry}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Empty State */}
      {filteredWorkers.length === 0 && (
        <div className="p-8 text-center">
          <Eye className="w-12 h-12 text-slate-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 mb-2">No Workers Found</h3>
          <p className="text-slate-600">
            {searchTerm || statusFilter !== 'all' 
              ? 'Try adjusting your search or filter criteria.'
              : 'No workers with shadow calculations found for this period.'
            }
          </p>
        </div>
      )}

      {/* Table Footer */}
      {filteredWorkers.length > 0 && (
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50">
          <div className="flex items-center justify-between text-sm text-slate-600">
            <span>
              Showing {filteredWorkers.length} of {workers.length} workers
            </span>
            <span>
              {validationStatusCounts.valid} valid, {validationStatusCounts.warning} warnings, {validationStatusCounts.error} errors
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
