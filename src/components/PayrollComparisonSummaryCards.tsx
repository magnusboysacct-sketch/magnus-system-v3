// Payroll Comparison Summary Cards - Phase 2C-1
// Summary cards for payroll comparison review dashboard
// PHASE 2C-1 READ-ONLY REVIEW DASHBOARD — NOT ACTIVE PAYROLL

import React from 'react';
import { Users, DollarSign, TrendingUp, TrendingDown, AlertTriangle, CheckCircle, XCircle, Clock } from 'lucide-react';

interface PayrollComparisonSummaryCardsProps {
  data: {
    totalWorkers: number;
    averageNetPayDifference: number;
    largestNetPayDifference: number;
    validationStatusCounts: {
      valid: number;
      warning: number;
      error: number;
      not_available: number;
    };
    migrationReadinessScore: number;
  };
}

export default function PayrollComparisonSummaryCards({ data }: PayrollComparisonSummaryCardsProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatPercentage = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  const getMigrationReadinessColor = (score: number) => {
    if (score >= 90) return 'text-green-600 bg-green-100';
    if (score >= 70) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  const getMigrationReadinessLabel = (score: number) => {
    if (score >= 90) return 'Ready';
    if (score >= 70) return 'Needs Review';
    return 'Not Ready';
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Total Workers Reviewed */}
      <div className="bg-white p-6 rounded-lg border border-slate-200">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-600">Total Workers</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{data.totalWorkers}</p>
            <p className="text-xs text-slate-500 mt-1">With shadow calculations</p>
          </div>
          <div className="p-3 bg-blue-100 rounded-lg">
            <Users className="w-6 h-6 text-blue-600" />
          </div>
        </div>
      </div>

      {/* Average Net Pay Difference */}
      <div className="bg-white p-6 rounded-lg border border-slate-200">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-600">Avg Net Pay Difference</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">
              {formatCurrency(data.averageNetPayDifference)}
            </p>
            <p className="text-xs text-slate-500 mt-1">US vs Jamaican calculations</p>
          </div>
          <div className="p-3 bg-purple-100 rounded-lg">
            {data.averageNetPayDifference >= 0 ? (
              <TrendingUp className="w-6 h-6 text-purple-600" />
            ) : (
              <TrendingDown className="w-6 h-6 text-purple-600" />
            )}
          </div>
        </div>
      </div>

      {/* Largest Net Pay Difference */}
      <div className="bg-white p-6 rounded-lg border border-slate-200">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-600">Largest Difference</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">
              {formatCurrency(data.largestNetPayDifference)}
            </p>
            <p className="text-xs text-slate-500 mt-1">Maximum variance found</p>
          </div>
          <div className="p-3 bg-orange-100 rounded-lg">
            <AlertTriangle className="w-6 h-6 text-orange-600" />
          </div>
        </div>
      </div>

      {/* Migration Readiness Score */}
      <div className="bg-white p-6 rounded-lg border border-slate-200">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-600">Migration Readiness</p>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-2xl font-bold text-slate-900">
                {formatPercentage(data.migrationReadinessScore)}
              </p>
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${getMigrationReadinessColor(data.migrationReadinessScore)}`}>
                {getMigrationReadinessLabel(data.migrationReadinessScore)}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">Based on validation results</p>
          </div>
          <div className={`p-3 rounded-lg ${getMigrationReadinessColor(data.migrationReadinessScore).split(' ')[1]}`}>
            <CheckCircle className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Validation Status Counts */}
      <div className="bg-white p-6 rounded-lg border border-slate-200 lg:col-span-2">
        <div className="mb-4">
          <p className="text-sm font-medium text-slate-600">Validation Status Distribution</p>
        </div>
        <div className="grid grid-cols-4 gap-4">
          <div className="text-center">
            <div className="flex items-center justify-center mb-2">
              <CheckCircle className="w-5 h-5 text-green-600 mr-1" />
              <span className="text-lg font-bold text-green-600">{data.validationStatusCounts.valid}</span>
            </div>
            <p className="text-xs text-slate-600">Valid</p>
            <p className="text-xs text-slate-500">{formatPercentage((data.validationStatusCounts.valid / data.totalWorkers) * 100)}</p>
          </div>
          
          <div className="text-center">
            <div className="flex items-center justify-center mb-2">
              <AlertTriangle className="w-5 h-5 text-yellow-600 mr-1" />
              <span className="text-lg font-bold text-yellow-600">{data.validationStatusCounts.warning}</span>
            </div>
            <p className="text-xs text-slate-600">Warnings</p>
            <p className="text-xs text-slate-500">{formatPercentage((data.validationStatusCounts.warning / data.totalWorkers) * 100)}</p>
          </div>
          
          <div className="text-center">
            <div className="flex items-center justify-center mb-2">
              <XCircle className="w-5 h-5 text-red-600 mr-1" />
              <span className="text-lg font-bold text-red-600">{data.validationStatusCounts.error}</span>
            </div>
            <p className="text-xs text-slate-600">Errors</p>
            <p className="text-xs text-slate-500">{formatPercentage((data.validationStatusCounts.error / data.totalWorkers) * 100)}</p>
          </div>
          
          <div className="text-center">
            <div className="flex items-center justify-center mb-2">
              <Clock className="w-5 h-5 text-slate-600 mr-1" />
              <span className="text-lg font-bold text-slate-600">{data.validationStatusCounts.not_available}</span>
            </div>
            <p className="text-xs text-slate-600">Not Available</p>
            <p className="text-xs text-slate-500">{formatPercentage((data.validationStatusCounts.not_available / data.totalWorkers) * 100)}</p>
          </div>
        </div>
      </div>

      {/* Additional Metrics */}
      <div className="bg-white p-6 rounded-lg border border-slate-200 lg:col-span-2">
        <div className="mb-4">
          <p className="text-sm font-medium text-slate-600">Key Insights</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <div>
              <p className="text-sm font-medium text-slate-900">Ready Workers</p>
              <p className="text-xs text-slate-500">
                {data.validationStatusCounts.valid} of {data.totalWorkers} workers pass validation
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
            <div>
              <p className="text-sm font-medium text-slate-900">Need Attention</p>
              <p className="text-xs text-slate-500">
                {data.validationStatusCounts.warning + data.validationStatusCounts.error} workers require review
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
            <div>
              <p className="text-sm font-medium text-slate-900">Average Variance</p>
              <p className="text-xs text-slate-500">
                {formatCurrency(data.averageNetPayDifference)} per worker
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
            <div>
              <p className="text-sm font-medium text-slate-900">Max Variance</p>
              <p className="text-xs text-slate-500">
                {formatCurrency(data.largestNetPayDifference)} highest difference
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
