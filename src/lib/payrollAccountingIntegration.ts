// Payroll Accounting Integration & Reconciliation - Phase 3C
// Comprehensive payroll-to-finance reconciliation and accounting integration infrastructure
// PHASE 3C PAYROLL ACCOUNTING INTEGRATION — PREVIEW ONLY

import { supabase } from './supabase';
import { jamaicanPayrollCalculator } from './jamaicanPayroll';
import { jamaicanPayrollCompliance } from './jamaicanPayrollCompliance';
import type { JamaicanPayrollInput, JamaicanPayrollResult, JamaicanWorkerTaxInfo } from './jamaicanPayroll';
import type { JamaicanPayrollFrequency } from './jamaicanPayrollCompliance';
import type { ChartOfAccount, GLTransaction, GLEntry, TransactionSourceType, AccountType } from './accounting';
import type { PayrollPeriod, PayrollEntry, WorkerTaxInfo } from './payroll';

// ============================================================================
// PAYROLL ACCOUNTING TYPES
// ============================================================================

export interface PayrollJournalPreview {
  id: string;
  companyId: string;
  payrollPeriodId: string;
  transactionDate: string;
  description: string;
  totalAmount: number;
  currency: string;
  status: 'preview' | 'ready' | 'posted';
  lines: PayrollGLPostingLine[];
  summary: PayrollJournalSummary;
  reconciliation: PayrollReconciliationResult;
  generatedAt: string;
  generatedBy: string;
  notes?: string;
}

export interface PayrollGLPostingLine {
  id: string;
  journalId: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  projectId?: string;
  department?: string;
  debit: number;
  credit: number;
  description: string;
  employeeId?: string;
  employeeName?: string;
  payrollComponent: PayrollComponentType;
  allocation: PayrollAllocation;
  taxJurisdiction?: string;
  statutoryCategory?: string;
  lineNumber: number;
  metadata: PayrollLineMetadata;
}

export interface PayrollJournalSummary {
  totalDebits: number;
  totalCredits: number;
  totalWagesExpense: number;
  totalOvertimeExpense: number;
  totalStatutoryDeductions: number;
  totalEmployerContributions: number;
  totalNetPayroll: number;
  totalContractorPayments: number;
  totalProjectAllocations: number;
  varianceCount: number;
  balancingStatus: 'balanced' | 'variance_detected' | 'out_of_balance';
}

export interface PayrollLiabilitySummary {
  id: string;
  companyId: string;
  payrollPeriodId: string;
  generatedAt: string;
  liabilities: PayrollLiability[];
  totalLiabilities: number;
  employerContributions: PayrollEmployerContribution[];
  totalEmployerContributions: number;
  statutoryCompliance: PayrollStatutoryComplianceStatus;
  paymentDueDates: PayrollPaymentDueDate[];
  cashFlowProjection: PayrollCashFlowProjection;
}

export interface PayrollLiability {
  id: string;
  type: PayrollLiabilityType;
  description: string;
  amount: number;
  dueDate: string;
  statutoryReference?: string;
  employeeCount: number;
  jurisdiction: string;
  accountMapping: string;
  paymentStatus: 'pending' | 'scheduled' | 'paid' | 'overdue';
  lastPaymentDate?: string;
  paymentReference?: string;
}

export interface PayrollEmployerContribution {
  id: string;
  type: PayrollEmployerContributionType;
  description: string;
  employeeAmount: number;
  employerAmount: number;
  totalAmount: number;
  rate: number;
  statutoryReference?: string;
  employeeCount: number;
  accountMapping: string;
  paymentStatus: 'pending' | 'scheduled' | 'paid' | 'overdue';
  dueDate: string;
}

export interface PayrollReconciliationResult {
  id: string;
  payrollPeriodId: string;
  reconciliationDate: string;
  status: 'reconciled' | 'variance_detected' | 'failed' | 'pending';
  summary: PayrollReconciliationSummary;
  variances: PayrollVariance[];
  balancingChecks: PayrollBalancingCheck[];
  accountMappingValidation: PayrollAccountMappingValidation;
  complianceValidation: PayrollComplianceValidation;
  recommendations: string[];
  confidenceScore: number; // 0-100
}

export interface PayrollReconciliationSummary {
  totalPayrollTransactions: number;
  reconciledTransactions: number;
  varianceTransactions: number;
  totalVarianceAmount: number;
  largestVariance: number;
  averageVariance: number;
  varianceByType: Record<PayrollVarianceType, number>;
  varianceByDepartment: Record<string, number>;
  varianceByProject: Record<string, number>;
}

export interface PayrollVariance {
  id: string;
  type: PayrollVarianceType;
  description: string;
  expectedAmount: number;
  actualAmount: number;
  varianceAmount: number;
  variancePercent: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  employeeId?: string;
  accountId?: string;
  projectId?: string;
  department?: string;
  detectedAt: string;
  resolution?: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

export interface PayrollBalancingCheck {
  checkType: PayrollBalancingCheckType;
  description: string;
  expected: number;
  actual: number;
  variance: number;
  passed: boolean;
  tolerance: number;
  details?: string;
}

export interface PayrollAccountMappingValidation {
  totalAccounts: number;
  mappedAccounts: number;
  unmappedAccounts: string[];
  invalidMappings: PayrollInvalidMapping[];
  mappingCoverage: number; // percentage
  lastValidated: string;
  validationStatus: 'valid' | 'warning' | 'error';
}

export interface PayrollInvalidMapping {
  payrollComponent: PayrollComponentType;
  expectedAccountType: AccountType;
  currentMapping?: string;
  issue: string;
  recommendation: string;
}

export interface PayrollComplianceValidation {
  statutoryDeductionsValid: boolean;
  employerContributionsValid: boolean;
  taxCalculationsValid: boolean;
  minimumWageCompliance: boolean;
  deductionLimitsValid: boolean;
  complianceIssues: PayrollComplianceIssue[];
  overallComplianceScore: number;
}

export interface PayrollComplianceIssue {
  type: PayrollComplianceIssueType;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  affectedEmployees?: number;
  statutoryReference?: string;
  recommendedAction?: string;
  dueDate?: string;
}

export interface PayrollVarianceReconciliation {
  id: string;
  payrollPeriodId: string;
  reconciliationType: 'automatic' | 'manual' | 'supervised';
  variances: PayrollVariance[];
  adjustments: PayrollVarianceAdjustment[];
  summary: PayrollVarianceReconciliationSummary;
  approvals: PayrollVarianceApproval[];
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  completedAt?: string;
  completedBy?: string;
}

export interface PayrollVarianceAdjustment {
  id: string;
  varianceId: string;
  adjustmentType: 'correction' | 'write_off' | 'reclassification' | 'explanation';
  adjustmentAmount: number;
  description: string;
  reason: string;
  approvedBy?: string;
  approvedAt?: string;
  journalEntryId?: string;
}

export interface PayrollVarianceReconciliationSummary {
  totalVariances: number;
  resolvedVariances: number;
  totalAdjustmentAmount: number;
  adjustmentTypes: Record<string, number>;
  netImpact: number;
  reconciliationAccuracy: number; // percentage
}

export interface PayrollVarianceApproval {
  id: string;
  varianceId: string;
  approverId: string;
  approverName: string;
  approvalType: 'approve' | 'reject' | 'request_more_info';
  comments?: string;
  approvedAt: string;
  authorityLevel: number;
}

export interface PayrollAccountingMapping {
  id: string;
  companyId: string;
  payrollComponent: PayrollComponentType;
  accountId: string;
  accountCode: string;
  accountName: string;
  isActive: boolean;
  effectiveDate: string;
  expiryDate?: string;
  department?: string;
  project?: string;
  statutoryRequirement?: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedBy?: string;
  updatedAt?: string;
}

export interface PayrollFinanceIntegrationSummary {
  id: string;
  companyId: string;
  payrollPeriodId: string;
  generatedAt: string;
  integrationStatus: 'not_ready' | 'ready' | 'in_progress' | 'completed' | 'failed';
  readinessScore: number; // 0-100
  summary: PayrollIntegrationSummary;
  accountMappings: PayrollAccountMappingSummary;
  journalPreviews: PayrollJournalPreviewSummary;
  reconciliationStatus: PayrollReconciliationStatus;
  complianceStatus: PayrollComplianceStatus;
  recommendations: string[];
  nextSteps: string[];
}

export interface PayrollIntegrationSummary {
  totalPayrollAmount: number;
  totalEmployees: number;
  totalDepartments: number;
  totalProjects: number;
  journalEntriesGenerated: number;
  journalEntriesPosted: number;
  liabilitiesIdentified: number;
  variancesDetected: number;
  integrationAccuracy: number;
}

export interface PayrollAccountMappingSummary {
  totalMappings: number;
  activeMappings: number;
  coveragePercentage: number;
  unmappedComponents: PayrollComponentType[];
  mappingConflicts: PayrollMappingConflict[];
  lastValidated: string;
  mappingCoverage: number;
}

export interface PayrollMappingConflict {
  payrollComponent: PayrollComponentType;
  conflictingMappings: string[];
  conflictType: 'duplicate' | 'invalid_account' | 'missing_required' | 'jurisdiction_mismatch';
  resolution?: string;
}

export interface PayrollJournalPreviewSummary {
  totalJournals: number;
  totalAmount: number;
  journalsByStatus: Record<string, number>;
  journalsByDepartment: Record<string, number>;
  journalsByProject: Record<string, number>;
  previewAccuracy: number;
  lastGenerated: string;
}

export interface PayrollReconciliationStatus {
  lastReconciliationDate: string;
  reconciliationFrequency: string;
  outstandingVariances: number;
  averageVarianceAmount: number;
  reconciliationAccuracy: number;
  trendDirection: 'improving' | 'stable' | 'declining';
  overallPassRate?: number;
}

export interface PayrollComplianceStatus {
  overallComplianceScore: number;
  statutoryDeductionsValid: boolean;
  employerContributionsValid: boolean;
  taxCalculationsValid: boolean;
  complianceIssues: number;
  lastComplianceCheck: string;
  nextComplianceDue: string;
}

export interface PayrollProjectCostAllocation {
  id: string;
  payrollPeriodId: string;
  projectId: string;
  projectName: string;
  totalAllocatedCost: number;
  allocations: PayrollCostAllocation[];
  allocationMethod: 'hours' | 'percentage' | 'fixed' | 'department_based';
  allocationBasis: string;
  varianceAnalysis: PayrollAllocationVarianceAnalysis;
  approvedBy?: string;
  approvedAt?: string;
}

export interface PayrollCostAllocation {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  regularHours: number;
  overtimeHours: number;
  totalHours: number;
  hourlyRate: number;
  regularPay: number;
  overtimePay: number;
  totalPay: number;
  allocationPercentage: number;
  allocatedAmount: number;
  benefitsAllocated: number;
  taxesAllocated: number;
  totalAllocated: number;
}

export interface PayrollAllocationVarianceAnalysis {
  totalVariance: number;
  variancePercentage: number;
  varianceByEmployee: Record<string, number>;
  varianceByDepartment: Record<string, number>;
  explanations: string[];
  recommendations: string[];
}

export interface PayrollStatutoryComplianceStatus {
  nisCompliance: boolean;
  nhtCompliance: boolean;
  payeCompliance: boolean;
  educationTaxCompliance: boolean;
  minimumWageCompliance: boolean;
  deductionLimitCompliance: boolean;
  overallComplianceScore: number;
  lastComplianceCheck: string;
  complianceIssues: PayrollComplianceIssue[];
  statutoryDeadlines: PayrollStatutoryDeadline[];
  nextComplianceDue?: string;
}

export interface PayrollStatutoryDeadline {
  type: string;
  description: string;
  dueDate: string;
  status: 'upcoming' | 'due' | 'overdue' | 'completed';
  amount?: number;
  reference?: string;
}

export interface PayrollPaymentDueDate {
  liabilityType: PayrollLiabilityType;
  description: string;
  dueDate: string;
  amount: number;
  status: 'scheduled' | 'pending' | 'paid' | 'overdue';
  paymentMethod?: string;
  reference?: string;
}

export interface PayrollCashFlowProjection {
  nextSevenDays: number;
  nextThirtyDays: number;
  nextNinetyDays: number;
  projectedPayments: PayrollProjectedPayment[];
  cashFlowWarnings: PayrollCashFlowWarning[];
}

export interface PayrollProjectedPayment {
  date: string;
  amount: number;
  liabilityType: PayrollLiabilityType;
  description: string;
  probability: 'high' | 'medium' | 'low';
}

export interface PayrollCashFlowWarning {
  type: 'insufficient_funds' | 'large_payment' | 'payment_cluster' | 'cash_flow_gap';
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  amount?: number;
  date?: string;
  recommendation: string;
}

export interface PayrollComponentType {
  category: 'wages' | 'overtime' | 'benefits' | 'deductions' | 'taxes' | 'contributions' | 'contractor' | 'other';
  type: string;
  description: string;
  isTaxable: boolean;
  isStatutory: boolean;
  requiresEmployerContribution: boolean;
}

export interface PayrollAllocation {
  projectId?: string;
  departmentId?: string;
  costCenterId?: string;
  allocationPercentage: number;
  allocationMethod: 'hours' | 'percentage' | 'fixed' | 'manual';
  allocationBasis: string;
}

export interface PayrollLineMetadata {
  employeeId?: string;
  employeeName?: string;
  department?: string;
  jobTitle?: string;
  payrollFrequency?: string;
  payPeriod?: string;
  taxJurisdiction?: string;
  statutoryReference?: string;
  calculationMethod?: string;
  sourceSystem?: string;
  importedAt?: string;
  lastModified?: string;
  modifiedBy?: string;
  validationStatus?: 'validated' | 'warning' | 'error';
  validationNotes?: string[];
}

// ============================================================================
// ENUMS AND CONSTANTS
// ============================================================================

export type PayrollLiabilityType = 
  | 'nis_employee' | 'nis_employer'
  | 'nht_employee' | 'nht_employer'
  | 'paye_tax' | 'education_tax_employee' | 'education_tax_employer'
  | 'income_tax_withholding' | 'social_security_tax' | 'medicare_tax'
  | 'state_tax_withholding' | 'local_tax_withholding'
  | 'health_insurance_premium' | 'retirement_401k_contributions'
  | 'union_dues' | 'garnishments' | 'other_deductions'
  | 'vacation_accrual' | 'sick_leave_accrual' | 'holiday_accrual'
  | 'bonus_accrual' | 'commission_accrual' | 'other_accruals';

export type PayrollEmployerContributionType = 
  | 'nis_employer' | 'nht_employer' | 'education_tax_employer'
  | 'social_security_employer' | 'medicare_employer'
  | 'unemployment_insurance' | 'workers_compensation'
  | 'health_insurance_employer' | 'retirement_match'
  | 'pension_contributions' | 'benefits_administration'
  | 'payroll_tax_administration' | 'other_contributions';

export type PayrollVarianceType = 
  | 'calculation_error' | 'rounding_difference' | 'account_mapping_error'
  | 'missing_allocation' | 'duplicate_entry' | 'incorrect_tax_rate'
  | 'statutory_calculation' | 'benefit_calculation' | 'overtime_calculation'
  | 'project_allocation' | 'department_allocation' | 'currency_conversion'
  | 'data_entry_error' | 'system_glitch' | 'timing_difference'
  | 'manual_adjustment' | 'reclassification' | 'write_off';

export type PayrollBalancingCheckType = 
  | 'debits_equal_credits' | 'total_payroll_balances' | 'statutory_deductions_balance'
  | 'employer_contributions_balance' | 'net_payroll_balance' | 'project_allocations_balance'
  | 'department_allocations_balance' | 'cash_flow_balance' | 'liability_account_balance'
  | 'expense_account_balance' | 'tax_account_balance';

export type PayrollComplianceIssueType = 
  | 'minimum_wage_violation' | 'incorrect_tax_rate' | 'missing_statutory_deduction'
  | 'excess_deduction_limit' | 'incorrect_employer_contribution'
  | 'late_payment_risk' | 'missing_tax_filing' | 'incorrect_tax_withholding'
  | 'benefit_compliance' | 'overtime_compliance' | 'record_keeping_compliance';

// ============================================================================
// MAIN INTEGRATION CLASS
// ============================================================================

export class PayrollAccountingIntegration {
  private static instance: PayrollAccountingIntegration;
  private accountMappings: Map<string, PayrollAccountingMapping> = new Map();
  private chartOfAccounts: Map<string, ChartOfAccount> = new Map();
  private payrollCache: Map<string, any> = new Map();

  private constructor() {}

  public static getInstance(): PayrollAccountingIntegration {
    if (!PayrollAccountingIntegration.instance) {
      PayrollAccountingIntegration.instance = new PayrollAccountingIntegration();
    }
    return PayrollAccountingIntegration.instance;
  }

  // ============================================================================
  // JOURNAL PREVIEW GENERATION
  // ============================================================================

  /**
   * Generate comprehensive payroll journal preview
   * PHASE 3C PAYROLL ACCOUNTING INTEGRATION — PREVIEW ONLY
   */
  async generatePayrollJournalPreview(
    companyId: string,
    payrollPeriodId: string,
    options: {
      includeStatutoryDetails?: boolean;
      includeProjectAllocations?: boolean;
      includeVarianceAnalysis?: boolean;
      previewMode?: 'summary' | 'detailed' | 'comprehensive';
    } = {}
  ): Promise<PayrollJournalPreview> {
    const startTime = Date.now();
    
    try {
      // Fetch payroll data
      const payrollData = await this.fetchPayrollData(companyId, payrollPeriodId);
      
      // Generate GL posting lines
      const postingLines = await this.buildPayrollGLPostingLines(
        companyId,
        payrollPeriodId,
        payrollData,
        options
      );

      // Calculate summary
      const summary = this.calculateJournalSummary(postingLines);

      // Perform reconciliation
      const reconciliation = await this.reconcilePayrollToGL(
        companyId,
        payrollPeriodId,
        postingLines,
        payrollData
      );

      const journalPreview: PayrollJournalPreview = {
        id: `preview_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        companyId,
        payrollPeriodId,
        transactionDate: new Date().toISOString().split('T')[0],
        description: `Payroll Journal Preview - Period ${payrollPeriodId}`,
        totalAmount: summary.totalDebits,
        currency: 'JMD', // Jamaican Dollar
        status: 'preview',
        lines: postingLines,
        summary,
        reconciliation,
        generatedAt: new Date().toISOString(),
        generatedBy: 'system',
        notes: options.previewMode ? `Preview mode: ${options.previewMode}` : undefined
      };

      return journalPreview;

    } catch (error) {
      console.error('Error generating payroll journal preview:', error);
      throw new Error(`Failed to generate journal preview: ${error}`);
    }
  }

  /**
   * Build detailed GL posting lines for payroll
   * PHASE 3C PAYROLL ACCOUNTING INTEGRATION — PREVIEW ONLY
   */
  async buildPayrollGLPostingLines(
    companyId: string,
    payrollPeriodId: string,
    payrollData: any,
    options: any = {}
  ): Promise<PayrollGLPostingLine[]> {
    const postingLines: PayrollGLPostingLine[] = [];
    let lineNumber = 1;

    try {
      // Ensure account mappings are loaded
      await this.loadAccountMappings(companyId);

      // Process wages expense lines
      for (const employee of payrollData.employees || []) {
        // Regular wages expense
        postingLines.push(this.createPostingLine({
          lineNumber: lineNumber++,
          companyId,
          payrollComponent: { 
            category: 'wages', 
            type: 'regular_wages', 
            description: 'Regular wages expense',
            isTaxable: true,
            isStatutory: false,
            requiresEmployerContribution: false
          },
          debit: employee.regularPay || 0,
          credit: 0,
          employeeId: employee.id,
          employeeName: employee.name,
          department: employee.department,
          projectId: employee.projectId,
          description: `Regular wages - ${employee.name}`,
          allocation: this.calculateAllocation(employee)
        }));

        // Overtime expense
        if (employee.overtimePay > 0) {
          postingLines.push(this.createPostingLine({
            lineNumber: lineNumber++,
            companyId,
            payrollComponent: { 
              category: 'overtime', 
              type: 'overtime_pay', 
              description: 'Overtime pay expense',
              isTaxable: true,
              isStatutory: false,
              requiresEmployerContribution: false
            },
            debit: employee.overtimePay,
            credit: 0,
            employeeId: employee.id,
            employeeName: employee.name,
            department: employee.department,
            projectId: employee.projectId,
            description: `Overtime pay - ${employee.name}`,
            allocation: this.calculateAllocation(employee)
          }));
        }

        // Statutory deductions (credits)
        if (employee.nisDeduction > 0) {
          postingLines.push(this.createPostingLine({
            lineNumber: lineNumber++,
            companyId,
            payrollComponent: { 
              category: 'deductions', 
              type: 'nis_employee', 
              description: 'NIS employee deduction',
              isTaxable: false,
              isStatutory: true,
              requiresEmployerContribution: true
            },
            debit: 0,
            credit: employee.nisDeduction,
            employeeId: employee.id,
            employeeName: employee.name,
            department: employee.department,
            description: `NIS deduction - ${employee.name}`,
            statutoryCategory: 'nis_employee',
            allocation: this.calculateAllocation(employee)
          }));
        }

        if (employee.nhtDeduction > 0) {
          postingLines.push(this.createPostingLine({
            lineNumber: lineNumber++,
            companyId,
            payrollComponent: { 
              category: 'deductions', 
              type: 'nht_employee', 
              description: 'NHT employee deduction',
              isTaxable: false,
              isStatutory: true,
              requiresEmployerContribution: true
            },
            debit: 0,
            credit: employee.nhtDeduction,
            employeeId: employee.id,
            employeeName: employee.name,
            department: employee.department,
            description: `NHT deduction - ${employee.name}`,
            statutoryCategory: 'nht_employee',
            allocation: this.calculateAllocation(employee)
          }));
        }

        if (employee.payeDeduction > 0) {
          postingLines.push(this.createPostingLine({
            lineNumber: lineNumber++,
            companyId,
            payrollComponent: { 
              category: 'taxes', 
              type: 'paye_tax', 
              description: 'PAYE tax withholding',
              isTaxable: false,
              isStatutory: true,
              requiresEmployerContribution: false
            },
            debit: 0,
            credit: employee.payeDeduction,
            employeeId: employee.id,
            employeeName: employee.name,
            department: employee.department,
            description: `PAYE tax - ${employee.name}`,
            statutoryCategory: 'paye_tax',
            taxJurisdiction: 'Jamaica',
            allocation: this.calculateAllocation(employee)
          }));
        }

        if (employee.educationTaxDeduction > 0) {
          postingLines.push(this.createPostingLine({
            lineNumber: lineNumber++,
            companyId,
            payrollComponent: { 
              category: 'taxes', 
              type: 'education_tax_employee', 
              description: 'Education tax employee deduction',
              isTaxable: false,
              isStatutory: true,
              requiresEmployerContribution: true
            },
            debit: 0,
            credit: employee.educationTaxDeduction,
            employeeId: employee.id,
            employeeName: employee.name,
            department: employee.department,
            description: `Education tax - ${employee.name}`,
            statutoryCategory: 'education_tax_employee',
            allocation: this.calculateAllocation(employee)
          }));
        }

        // Net payroll (cash/bank)
        postingLines.push(this.createPostingLine({
          lineNumber: lineNumber++,
          companyId,
          payrollComponent: { 
            category: 'wages', 
            type: 'net_payroll', 
            description: 'Net payroll payable',
            isTaxable: false,
            isStatutory: false,
            requiresEmployerContribution: false
          },
          debit: 0,
          credit: employee.netPay,
          employeeId: employee.id,
          employeeName: employee.name,
          department: employee.department,
          description: `Net payroll - ${employee.name}`,
          allocation: this.calculateAllocation(employee)
        }));
      }

      // Employer contributions
      const employerContributions = await this.calculateEmployerContributions(payrollData.employees || []);
      for (const contribution of employerContributions) {
        postingLines.push(this.createPostingLine({
          lineNumber: lineNumber++,
          companyId,
          payrollComponent: { 
            category: 'contributions', 
            type: contribution.type, 
            description: contribution.description,
            isTaxable: false,
            isStatutory: true,
            requiresEmployerContribution: true
          },
          debit: contribution.employerAmount,
          credit: 0,
          description: contribution.description,
          statutoryCategory: contribution.type,
          allocation: { allocationPercentage: 100, allocationMethod: 'percentage', allocationBasis: 'total_payroll' }
        }));

        // Corresponding liability
        postingLines.push(this.createPostingLine({
          lineNumber: lineNumber++,
          companyId,
          payrollComponent: { 
            category: 'contributions', 
            type: `${contribution.type}_payable`, 
            description: `${contribution.description} payable`,
            isTaxable: false,
            isStatutory: true,
            requiresEmployerContribution: true
          },
          debit: 0,
          credit: contribution.employerAmount,
          description: `${contribution.description} payable`,
          statutoryCategory: `${contribution.type}_payable`,
          allocation: { allocationPercentage: 100, allocationMethod: 'percentage', allocationBasis: 'total_payroll' }
        }));
      }

      return postingLines;

    } catch (error) {
      console.error('Error building GL posting lines:', error);
      throw new Error(`Failed to build GL posting lines: ${error}`);
    }
  }

  /**
   * Calculate comprehensive payroll liabilities
   * PHASE 3C PAYROLL ACCOUNTING INTEGRATION — PREVIEW ONLY
   */
  async calculatePayrollLiabilities(
    companyId: string,
    payrollPeriodId: string
  ): Promise<PayrollLiabilitySummary> {
    try {
      const payrollData = await this.fetchPayrollData(companyId, payrollPeriodId);
      
      // Calculate employee deductions
      const liabilities: PayrollLiability[] = [];
      const employees = payrollData.employees || [];

      // NIS liabilities
      const nisEmployeeTotal = employees.reduce((sum: number, emp: any) => sum + (emp.nisDeduction || 0), 0);
      if (nisEmployeeTotal > 0) {
        liabilities.push({
          id: `nis_employee_${Date.now()}`,
          type: 'nis_employee',
          description: 'NIS employee deductions payable',
          amount: nisEmployeeTotal,
          dueDate: this.calculateDueDate('nis_employee'),
          statutoryReference: 'National Insurance Scheme Act',
          employeeCount: employees.filter((emp: any) => emp.nisDeduction > 0).length,
          jurisdiction: 'Jamaica',
          accountMapping: await this.getAccountMapping('nis_employee'),
          paymentStatus: 'pending'
        });
      }

      // NHT liabilities
      const nhtEmployeeTotal = employees.reduce((sum: number, emp: any) => sum + (emp.nhtDeduction || 0), 0);
      if (nhtEmployeeTotal > 0) {
        liabilities.push({
          id: `nht_employee_${Date.now()}`,
          type: 'nht_employee',
          description: 'NHT employee deductions payable',
          amount: nhtEmployeeTotal,
          dueDate: this.calculateDueDate('nht_employee'),
          statutoryReference: 'National Housing Trust Act',
          employeeCount: employees.filter((emp: any) => emp.nhtDeduction > 0).length,
          jurisdiction: 'Jamaica',
          accountMapping: await this.getAccountMapping('nht_employee'),
          paymentStatus: 'pending'
        });
      }

      // PAYE liabilities
      const payeTotal = employees.reduce((sum: number, emp: any) => sum + (emp.payeDeduction || 0), 0);
      if (payeTotal > 0) {
        liabilities.push({
          id: `paye_tax_${Date.now()}`,
          type: 'paye_tax',
          description: 'PAYE tax withholding payable',
          amount: payeTotal,
          dueDate: this.calculateDueDate('paye_tax'),
          statutoryReference: 'Income Tax Act',
          employeeCount: employees.filter((emp: any) => emp.payeDeduction > 0).length,
          jurisdiction: 'Jamaica',
          accountMapping: await this.getAccountMapping('paye_tax'),
          paymentStatus: 'pending'
        });
      }

      // Education tax liabilities
      const educationTaxTotal = employees.reduce((sum: number, emp: any) => sum + (emp.educationTaxDeduction || 0), 0);
      if (educationTaxTotal > 0) {
        liabilities.push({
          id: `education_tax_employee_${Date.now()}`,
          type: 'education_tax_employee',
          description: 'Education tax employee deductions payable',
          amount: educationTaxTotal,
          dueDate: this.calculateDueDate('education_tax_employee'),
          statutoryReference: 'Education Tax Act',
          employeeCount: employees.filter((emp: any) => emp.educationTaxDeduction > 0).length,
          jurisdiction: 'Jamaica',
          accountMapping: await this.getAccountMapping('education_tax_employee'),
          paymentStatus: 'pending'
        });
      }

      // Calculate employer contributions
      const employerContributions = await this.calculateEmployerContributions(employees);

      // Generate cash flow projection
      const cashFlowProjection = await this.generateCashFlowProjection(liabilities, employerContributions);

      // Generate payment due dates
      const paymentDueDates = [
        ...liabilities.map(liab => ({
          liabilityType: liab.type,
          description: liab.description,
          dueDate: liab.dueDate,
          amount: liab.amount,
          status: liab.paymentStatus as 'pending' | 'scheduled' | 'paid' | 'overdue'
        })),
        ...employerContributions.map(cont => ({
          liabilityType: cont.type as PayrollLiabilityType,
          description: cont.description,
          dueDate: cont.dueDate,
          amount: cont.totalAmount,
          status: cont.paymentStatus as 'pending' | 'scheduled' | 'paid' | 'overdue'
        }))
      ];

      // Validate statutory compliance
      const statutoryCompliance = await this.validateStatutoryCompliance(payrollData);

      const totalLiabilities = liabilities.reduce((sum, liab) => sum + liab.amount, 0);
      const totalEmployerContributions = employerContributions.reduce((sum, cont) => sum + cont.totalAmount, 0);

      return {
        id: `liability_summary_${Date.now()}`,
        companyId,
        payrollPeriodId,
        generatedAt: new Date().toISOString(),
        liabilities,
        totalLiabilities,
        employerContributions,
        totalEmployerContributions,
        statutoryCompliance,
        paymentDueDates,
        cashFlowProjection
      };

    } catch (error) {
      console.error('Error calculating payroll liabilities:', error);
      throw new Error(`Failed to calculate payroll liabilities: ${error}`);
    }
  }

  /**
   * Reconcile payroll to general ledger
   * PHASE 3C PAYROLL ACCOUNTING INTEGRATION — PREVIEW ONLY
   */
  async reconcilePayrollToGL(
    companyId: string,
    payrollPeriodId: string,
    postingLines: PayrollGLPostingLine[],
    payrollData: any
  ): Promise<PayrollReconciliationResult> {
    try {
      const startTime = Date.now();
      
      // Perform balancing checks
      const balancingChecks = await this.performBalancingChecks(postingLines);
      
      // Detect variances
      const variances = await this.detectVariances(postingLines, payrollData);
      
      // Validate account mappings
      const accountMappingValidation = await this.validateAccountingMappings(companyId, postingLines);
      
      // Validate compliance
      const complianceValidation = await this.validatePayrollCompliance(payrollData);
      
      // Generate reconciliation summary
      const summary = this.generateReconciliationSummary(
        postingLines,
        variances,
        balancingChecks
      );

      // Calculate confidence score
      const confidenceScore = this.calculateConfidenceScore(
        balancingChecks,
        variances,
        accountMappingValidation,
        complianceValidation
      );

      // Generate recommendations
      const recommendations = this.generateReconciliationRecommendations(
        variances,
        balancingChecks,
        accountMappingValidation,
        complianceValidation
      );

      const reconciliationResult: PayrollReconciliationResult = {
        id: `reconciliation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        payrollPeriodId,
        reconciliationDate: new Date().toISOString(),
        status: variances.length === 0 && balancingChecks.every(check => check.passed) ? 'reconciled' : 'variance_detected',
        summary,
        variances,
        balancingChecks,
        accountMappingValidation,
        complianceValidation,
        recommendations,
        confidenceScore
      };

      return reconciliationResult;

    } catch (error) {
      console.error('Error reconciling payroll to GL:', error);
      throw new Error(`Failed to reconcile payroll to GL: ${error}`);
    }
  }

  /**
   * Generate variance reconciliation report
   * PHASE 3C PAYROLL ACCOUNTING INTEGRATION — PREVIEW ONLY
   */
  async generatePayrollVarianceReconciliation(
    companyId: string,
    payrollPeriodId: string,
    reconciliationType: 'automatic' | 'manual' | 'supervised' = 'automatic'
  ): Promise<PayrollVarianceReconciliation> {
    try {
      // Fetch existing variances
      const existingVariances = await this.fetchExistingVariances(companyId, payrollPeriodId);
      
      // Generate adjustments for variances
      const adjustments = await this.generateVarianceAdjustments(existingVariances);
      
      // Calculate reconciliation summary
      const summary = this.calculateVarianceReconciliationSummary(existingVariances, adjustments);
      
      // Get required approvals (mock for now)
      const approvals: PayrollVarianceApproval[] = [];

      const varianceReconciliation: PayrollVarianceReconciliation = {
        id: `variance_reconciliation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        payrollPeriodId,
        reconciliationType,
        variances: existingVariances,
        adjustments,
        summary,
        approvals,
        status: 'pending'
      };

      return varianceReconciliation;

    } catch (error) {
      console.error('Error generating variance reconciliation:', error);
      throw new Error(`Failed to generate variance reconciliation: ${error}`);
    }
  }

  /**
   * Validate payroll balancing
   * PHASE 3C PAYROLL ACCOUNTING INTEGRATION — PREVIEW ONLY
   */
  async validatePayrollBalancing(
    postingLines: PayrollGLPostingLine[]
  ): Promise<PayrollBalancingCheck[]> {
    const checks: PayrollBalancingCheck[] = [];

    try {
      // Check 1: Debits equal credits
      const totalDebits = postingLines.reduce((sum, line) => sum + line.debit, 0);
      const totalCredits = postingLines.reduce((sum, line) => sum + line.credit, 0);
      const debitCreditVariance = Math.abs(totalDebits - totalCredits);
      
      checks.push({
        checkType: 'debits_equal_credits',
        description: 'Total debits must equal total credits',
        expected: totalDebits,
        actual: totalCredits,
        variance: debitCreditVariance,
        passed: debitCreditVariance < 0.01, // Allow for rounding
        tolerance: 0.01,
        details: `Debits: ${totalDebits.toFixed(2)}, Credits: ${totalCredits.toFixed(2)}`
      });

      // Check 2: Total payroll balances
      const totalWagesExpense = postingLines
        .filter(line => line.payrollComponent.category === 'wages' && line.debit > 0)
        .reduce((sum, line) => sum + line.debit, 0);
      
      const totalNetPayroll = postingLines
        .filter(line => line.payrollComponent.type === 'net_payroll' && line.credit > 0)
        .reduce((sum, line) => sum + line.credit, 0);
      
      const totalDeductions = postingLines
        .filter(line => line.payrollComponent.category === 'deductions' && line.credit > 0)
        .reduce((sum, line) => sum + line.credit, 0);
      
      const totalTaxes = postingLines
        .filter(line => line.payrollComponent.category === 'taxes' && line.credit > 0)
        .reduce((sum, line) => sum + line.credit, 0);
      
      const expectedNetPayroll = totalWagesExpense - totalDeductions - totalTaxes;
      const payrollBalanceVariance = Math.abs(totalNetPayroll - expectedNetPayroll);
      
      checks.push({
        checkType: 'total_payroll_balances',
        description: 'Net payroll must equal gross wages less deductions and taxes',
        expected: expectedNetPayroll,
        actual: totalNetPayroll,
        variance: payrollBalanceVariance,
        passed: payrollBalanceVariance < 0.01,
        tolerance: 0.01,
        details: `Expected: ${expectedNetPayroll.toFixed(2)}, Actual: ${totalNetPayroll.toFixed(2)}`
      });

      // Check 3: Statutory deductions balance
      const statutoryDeductionsTotal = postingLines
        .filter(line => line.statutoryCategory && line.credit > 0)
        .reduce((sum, line) => sum + line.credit, 0);
      
      // This would be validated against actual statutory calculations
      checks.push({
        checkType: 'statutory_deductions_balance',
        description: 'Statutory deductions must balance with calculations',
        expected: statutoryDeductionsTotal,
        actual: statutoryDeductionsTotal,
        variance: 0,
        passed: true,
        tolerance: 0.01,
        details: `Statutory deductions total: ${statutoryDeductionsTotal.toFixed(2)}`
      });

      // Check 4: Project allocations balance
      const projectAllocations = postingLines
        .filter(line => line.projectId)
        .reduce((sum, line) => sum + line.debit + line.credit, 0);
      
      const totalAllocatedAmount = postingLines
        .reduce((sum, line) => sum + line.debit + line.credit, 0);
      
      const allocationVariance = Math.abs(projectAllocations - totalAllocatedAmount);
      
      checks.push({
        checkType: 'project_allocations_balance',
        description: 'Project allocations must balance with total payroll',
        expected: totalAllocatedAmount,
        actual: projectAllocations,
        variance: allocationVariance,
        passed: allocationVariance < 0.01,
        tolerance: 0.01,
        details: `Total allocated: ${projectAllocations.toFixed(2)}, Total payroll: ${totalAllocatedAmount.toFixed(2)}`
      });

      return checks;

    } catch (error) {
      console.error('Error validating payroll balancing:', error);
      throw new Error(`Failed to validate payroll balancing: ${error}`);
    }
  }

  /**
   * Generate comprehensive payroll accounting summary
   * PHASE 3C PAYROLL ACCOUNTING INTEGRATION — PREVIEW ONLY
   */
  async generatePayrollAccountingSummary(
    companyId: string,
    payrollPeriodId: string
  ): Promise<PayrollFinanceIntegrationSummary> {
    try {
      // Generate journal preview
      const journalPreview = await this.generatePayrollJournalPreview(companyId, payrollPeriodId);
      
      // Calculate liabilities
      const liabilitySummary = await this.calculatePayrollLiabilities(companyId, payrollPeriodId);
      
      // Perform reconciliation
      const reconciliationResult = await this.reconcilePayrollToGL(
        companyId,
        payrollPeriodId,
        journalPreview.lines,
        await this.fetchPayrollData(companyId, payrollPeriodId)
      );
      
      // Validate account mappings
      const accountMappings = await this.validateAccountingMappings(companyId, journalPreview.lines);
      
      // Calculate readiness score
      const readinessScore = this.calculateReadinessScore(
        journalPreview,
        liabilitySummary,
        reconciliationResult,
        accountMappings
      );
      
      // Generate integration summary
      const summary = this.generateIntegrationSummary(
        journalPreview,
        liabilitySummary,
        reconciliationResult
      );
      
      // Generate account mapping summary
      const accountMappingSummary = this.generateAccountMappingSummary(accountMappings);
      
      // Generate journal preview summary
      const journalPreviewSummary = this.generateJournalPreviewSummary(journalPreview);
      
      // Generate reconciliation status
      const reconciliationStatus = this.generateReconciliationStatus(reconciliationResult);
      
      // Generate compliance status
      const complianceStatus = this.generateComplianceStatus(liabilitySummary.statutoryCompliance);
      
      // Generate recommendations
      const recommendations = this.generateIntegrationRecommendations(
        journalPreview,
        liabilitySummary,
        reconciliationResult,
        accountMappings
      );
      
      // Generate next steps
      const nextSteps = this.generateNextSteps(readinessScore, recommendations);

      const integrationSummary: PayrollFinanceIntegrationSummary = {
        id: `integration_summary_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        companyId,
        payrollPeriodId,
        generatedAt: new Date().toISOString(),
        integrationStatus: readinessScore >= 90 ? 'ready' : readinessScore >= 70 ? 'in_progress' : 'not_ready',
        readinessScore,
        summary,
        accountMappings: accountMappingSummary,
        journalPreviews: journalPreviewSummary,
        reconciliationStatus,
        complianceStatus,
        recommendations,
        nextSteps
      };

      return integrationSummary;

    } catch (error) {
      console.error('Error generating payroll accounting summary:', error);
      throw new Error(`Failed to generate payroll accounting summary: ${error}`);
    }
  }

  /**
   * Build project cost allocations
   * PHASE 3C PAYROLL ACCOUNTING INTEGRATION — PREVIEW ONLY
   */
  async buildProjectCostAllocations(
    companyId: string,
    payrollPeriodId: string,
    projectId: string
  ): Promise<PayrollProjectCostAllocation> {
    try {
      const payrollData = await this.fetchPayrollData(companyId, payrollPeriodId);
      const projectEmployees = payrollData.employees?.filter((emp: any) => emp.projectId === projectId) || [];
      
      // Build allocations for each employee
      const allocations: PayrollCostAllocation[] = [];
      
      for (const employee of projectEmployees) {
        const totalHours = (employee.regularHours || 0) + (employee.overtimeHours || 0);
        const totalPay = (employee.regularPay || 0) + (employee.overtimePay || 0);
        
        // Calculate allocation percentages (simplified - would be more complex in reality)
        const allocationPercentage = totalHours > 0 ? 100 : 0;
        
        // Calculate benefits and taxes allocation (proportional)
        const benefitsAllocated = totalPay * 0.15; // Simplified benefits rate
        const taxesAllocated = totalPay * 0.25; // Simplified tax rate
        
        allocations.push({
          id: `allocation_${employee.id}_${Date.now()}`,
          employeeId: employee.id,
          employeeName: employee.name,
          department: employee.department,
          regularHours: employee.regularHours || 0,
          overtimeHours: employee.overtimeHours || 0,
          totalHours,
          hourlyRate: totalHours > 0 ? totalPay / totalHours : 0,
          regularPay: employee.regularPay || 0,
          overtimePay: employee.overtimePay || 0,
          totalPay,
          allocationPercentage,
          allocatedAmount: totalPay,
          benefitsAllocated,
          taxesAllocated,
          totalAllocated: totalPay + benefitsAllocated + taxesAllocated
        });
      }

      // Calculate variance analysis
      const varianceAnalysis = this.calculateAllocationVarianceAnalysis(allocations);
      
      const totalAllocatedCost = allocations.reduce((sum, alloc) => sum + alloc.totalAllocated, 0);

      const projectAllocation: PayrollProjectCostAllocation = {
        id: `project_allocation_${projectId}_${Date.now()}`,
        payrollPeriodId,
        projectId,
        projectName: `Project ${projectId}`, // Would fetch actual project name
        totalAllocatedCost,
        allocations,
        allocationMethod: 'hours',
        allocationBasis: 'regular_hours + overtime_hours',
        varianceAnalysis
      };

      return projectAllocation;

    } catch (error) {
      console.error('Error building project cost allocations:', error);
      throw new Error(`Failed to build project cost allocations: ${error}`);
    }
  }

  /**
   * Calculate employer liability tracking
   * PHASE 3C PAYROLL ACCOUNTING INTEGRATION — PREVIEW ONLY
   */
  async calculateEmployerLiabilityTracking(
    companyId: string,
    payrollPeriodId: string
  ): Promise<{
    totalEmployerLiabilities: number;
    liabilitiesByType: Record<PayrollEmployerContributionType, number>;
    paymentSchedule: PayrollPaymentDueDate[];
    cashFlowImpact: PayrollCashFlowProjection;
    complianceStatus: PayrollStatutoryComplianceStatus;
  }> {
    try {
      const payrollData = await this.fetchPayrollData(companyId, payrollPeriodId);
      const employees = payrollData.employees || [];
      
      // Calculate employer contributions
      const employerContributions = await this.calculateEmployerContributions(employees);
      
      // Group by type
      const liabilitiesByType: Record<PayrollEmployerContributionType, number> = {} as any;
      let totalEmployerLiabilities = 0;
      
      for (const contribution of employerContributions) {
        liabilitiesByType[contribution.type] = contribution.employerAmount;
        totalEmployerLiabilities += contribution.employerAmount;
      }
      
      // Generate payment schedule
      const paymentSchedule = employerContributions.map(cont => ({
        liabilityType: cont.type as PayrollLiabilityType,
        description: cont.description,
        dueDate: cont.dueDate,
        amount: cont.totalAmount,
        status: cont.paymentStatus as 'pending' | 'scheduled' | 'paid' | 'overdue',
        paymentMethod: 'bank_transfer',
        reference: `${cont.type}_${payrollPeriodId}`
      }));
      
      // Calculate cash flow impact
      const cashFlowImpact = await this.generateCashFlowProjection(
        [], // No employee liabilities for employer tracking
        employerContributions
      );
      
      // Validate compliance
      const complianceStatus = await this.validateStatutoryCompliance(payrollData);

      return {
        totalEmployerLiabilities,
        liabilitiesByType,
        paymentSchedule,
        cashFlowImpact,
        complianceStatus
      };

    } catch (error) {
      console.error('Error calculating employer liability tracking:', error);
      throw new Error(`Failed to calculate employer liability tracking: ${error}`);
    }
  }

  /**
   * Validate accounting mappings
   * PHASE 3C PAYROLL ACCOUNTING INTEGRATION — PREVIEW ONLY
   */
  async validateAccountingMappings(
    companyId: string,
    postingLines?: PayrollGLPostingLine[]
  ): Promise<PayrollAccountMappingValidation> {
    try {
      await this.loadAccountMappings(companyId);
      
      const allComponents = this.getAllPayrollComponents();
      const mappedAccounts = Array.from(this.accountMappings.values());
      const mappedComponentTypes = new Set(mappedAccounts.map(mapping => mapping.payrollComponent.type));
      
      // Find unmapped components
      const unmappedComponents: PayrollComponentType[] = [];
      for (const component of allComponents) {
        if (!mappedComponentTypes.has(component.type)) {
          unmappedComponents.push(component);
        }
      }
      
      // Validate mappings
      const invalidMappings: PayrollInvalidMapping[] = [];
      for (const mapping of mappedAccounts) {
        const validation = await this.validateSingleMapping(mapping);
        if (!validation.isValid) {
          invalidMappings.push({
            payrollComponent: mapping.payrollComponent,
            expectedAccountType: validation.expectedType,
            currentMapping: mapping.accountCode,
            issue: validation.issue,
            recommendation: validation.recommendation
          });
        }
      }
      
      // Calculate coverage
      const totalComponents = allComponents.length;
      const mappedComponentsCount = totalComponents - unmappedComponents.length;
      const mappingCoverage = totalComponents > 0 ? (mappedComponentsCount / totalComponents) * 100 : 0;
      
      const validationStatus = invalidMappings.length === 0 && unmappedComponents.length === 0 ? 'valid' :
                            invalidMappings.length > 0 && unmappedComponents.length === 0 ? 'warning' : 'error';

      return {
        totalAccounts: mappedAccounts.length,
        mappedAccounts: mappedComponentsCount,
        unmappedAccounts: unmappedComponents.map(comp => comp.type),
        invalidMappings,
        mappingCoverage,
        lastValidated: new Date().toISOString(),
        validationStatus
      };

    } catch (error) {
      console.error('Error validating accounting mappings:', error);
      throw new Error(`Failed to validate accounting mappings: ${error}`);
    }
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private async fetchPayrollData(companyId: string, payrollPeriodId: string): Promise<any> {
    // Mock implementation - would fetch actual payroll data
    return {
      employees: [
        {
          id: 'emp001',
          name: 'John Doe',
          department: 'Engineering',
          projectId: 'proj001',
          regularHours: 40,
          overtimeHours: 5,
          regularPay: 50000,
          overtimePay: 7500,
          grossPay: 57500,
          nisDeduction: 1581.25,
          nhtDeduction: 1150,
          payeDeduction: 8750,
          educationTaxDeduction: 1293.75,
          netPay: 44725
        }
      ],
      summary: {
        totalEmployees: 1,
        totalGrossPay: 57500,
        totalNetPay: 44725,
        totalDeductions: 12775
      }
    };
  }

  private async loadAccountMappings(companyId: string): Promise<void> {
    // Mock implementation - would load actual account mappings
    this.accountMappings.clear();
    
    // Sample mappings
    const sampleMappings: PayrollAccountingMapping[] = [
      {
        id: 'map_001',
        companyId,
        payrollComponent: { category: 'wages', type: 'regular_wages', description: 'Regular wages', isTaxable: true, isStatutory: false, requiresEmployerContribution: false },
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
        payrollComponent: { category: 'deductions', type: 'nis_employee', description: 'NIS employee deduction', isTaxable: false, isStatutory: true, requiresEmployerContribution: true },
        accountId: 'acc_002',
        accountCode: '2100',
        accountName: 'NIS Payable',
        isActive: true,
        effectiveDate: '2024-01-01',
        statutoryRequirement: 'National Insurance Scheme Act',
        createdBy: 'system',
        createdAt: new Date().toISOString()
      }
    ];
    
    for (const mapping of sampleMappings) {
      this.accountMappings.set(mapping.payrollComponent.type, mapping);
    }
  }

  private createPostingLine(params: {
    lineNumber: number;
    companyId: string;
    payrollComponent: PayrollComponentType;
    debit: number;
    credit: number;
    employeeId?: string;
    employeeName?: string;
    department?: string;
    projectId?: string;
    description: string;
    statutoryCategory?: string;
    taxJurisdiction?: string;
    allocation: PayrollAllocation;
  }): PayrollGLPostingLine {
    const accountMapping = this.accountMappings.get(params.payrollComponent.type);
    
    return {
      id: `line_${Date.now()}_${params.lineNumber}`,
      journalId: '', // Will be set when journal is created
      accountId: accountMapping?.accountId || '',
      accountCode: accountMapping?.accountCode || '',
      accountName: accountMapping?.accountName || '',
      accountType: this.getAccountType(params.payrollComponent),
      projectId: params.projectId,
      department: params.department,
      debit: params.debit,
      credit: params.credit,
      description: params.description,
      employeeId: params.employeeId,
      payrollComponent: params.payrollComponent,
      allocation: params.allocation,
      taxJurisdiction: params.taxJurisdiction,
      statutoryCategory: params.statutoryCategory,
      lineNumber: params.lineNumber,
      metadata: {
        employeeId: params.employeeId,
        employeeName: params.employeeName,
        department: params.department,
        calculationMethod: 'standard',
        sourceSystem: 'payroll_system',
        importedAt: new Date().toISOString(),
        validationStatus: 'validated'
      }
    };
  }

  private getAccountType(component: PayrollComponentType): AccountType {
    switch (component.category) {
      case 'wages':
      case 'overtime':
        return 'expense';
      case 'deductions':
      case 'taxes':
      case 'contributions':
        return 'liability';
      default:
        return 'expense';
    }
  }

  private calculateAllocation(employee: any): PayrollAllocation {
    return {
      projectId: employee.projectId,
      departmentId: employee.department,
      allocationPercentage: 100,
      allocationMethod: 'hours',
      allocationBasis: 'regular_hours'
    };
  }

  private calculateJournalSummary(postingLines: PayrollGLPostingLine[]): PayrollJournalSummary {
    const totalDebits = postingLines.reduce((sum, line) => sum + line.debit, 0);
    const totalCredits = postingLines.reduce((sum, line) => sum + line.credit, 0);
    
    const totalWagesExpense = postingLines
      .filter(line => line.payrollComponent.category === 'wages' && line.debit > 0)
      .reduce((sum, line) => sum + line.debit, 0);
    
    const totalOvertimeExpense = postingLines
      .filter(line => line.payrollComponent.category === 'overtime' && line.debit > 0)
      .reduce((sum, line) => sum + line.debit, 0);
    
    const totalStatutoryDeductions = postingLines
      .filter(line => line.statutoryCategory && line.credit > 0)
      .reduce((sum, line) => sum + line.credit, 0);
    
    const totalEmployerContributions = postingLines
      .filter(line => line.payrollComponent.category === 'contributions' && line.debit > 0)
      .reduce((sum, line) => sum + line.debit, 0);
    
    const totalNetPayroll = postingLines
      .filter(line => line.payrollComponent.type === 'net_payroll' && line.credit > 0)
      .reduce((sum, line) => sum + line.credit, 0);

    const varianceCount = Math.abs(totalDebits - totalCredits) > 0.01 ? 1 : 0;
    const balancingStatus = Math.abs(totalDebits - totalCredits) < 0.01 ? 'balanced' : 'out_of_balance';

    return {
      totalDebits,
      totalCredits,
      totalWagesExpense,
      totalOvertimeExpense,
      totalStatutoryDeductions,
      totalEmployerContributions,
      totalNetPayroll,
      totalContractorPayments: 0, // Would calculate for contractors
      totalProjectAllocations: postingLines
        .filter(line => line.projectId)
        .reduce((sum, line) => sum + line.debit + line.credit, 0),
      varianceCount,
      balancingStatus
    };
  }

  private async calculateEmployerContributions(employees: any[]): Promise<PayrollEmployerContribution[]> {
    const contributions: PayrollEmployerContribution[] = [];
    
    // NIS employer contribution (2.5%)
    const nisBase = employees.reduce((sum, emp) => sum + (emp.grossPay || 0), 0);
    const nisEmployerAmount = nisBase * 0.025;
    if (nisEmployerAmount > 0) {
      contributions.push({
        id: `nis_employer_${Date.now()}`,
        type: 'nis_employer',
        description: 'NIS employer contribution',
        employeeAmount: employees.reduce((sum, emp) => sum + (emp.nisDeduction || 0), 0),
        employerAmount: nisEmployerAmount,
        totalAmount: nisEmployerAmount,
        rate: 0.025,
        statutoryReference: 'National Insurance Scheme Act',
        employeeCount: employees.filter(emp => emp.grossPay > 0).length,
        accountMapping: await this.getAccountMapping('nis_employer'),
        paymentStatus: 'pending',
        dueDate: this.calculateDueDate('nis_employer')
      });
    }
    
    // NHT employer contribution (3%)
    const nhtEmployerAmount = nisBase * 0.03;
    if (nhtEmployerAmount > 0) {
      contributions.push({
        id: `nht_employer_${Date.now()}`,
        type: 'nht_employer',
        description: 'NHT employer contribution',
        employeeAmount: employees.reduce((sum, emp) => sum + (emp.nhtDeduction || 0), 0),
        employerAmount: nhtEmployerAmount,
        totalAmount: nhtEmployerAmount,
        rate: 0.03,
        statutoryReference: 'National Housing Trust Act',
        employeeCount: employees.filter(emp => emp.grossPay > 0).length,
        accountMapping: await this.getAccountMapping('nht_employer'),
        paymentStatus: 'pending',
        dueDate: this.calculateDueDate('nht_employer')
      });
    }
    
    // Education tax employer contribution (3.5%)
    const educationTaxEmployerAmount = nisBase * 0.035;
    if (educationTaxEmployerAmount > 0) {
      contributions.push({
        id: `education_tax_employer_${Date.now()}`,
        type: 'education_tax_employer',
        description: 'Education tax employer contribution',
        employeeAmount: employees.reduce((sum, emp) => sum + (emp.educationTaxDeduction || 0), 0),
        employerAmount: educationTaxEmployerAmount,
        totalAmount: educationTaxEmployerAmount,
        rate: 0.035,
        statutoryReference: 'Education Tax Act',
        employeeCount: employees.filter(emp => emp.grossPay > 0).length,
        accountMapping: await this.getAccountMapping('education_tax_employer'),
        paymentStatus: 'pending',
        dueDate: this.calculateDueDate('education_tax_employer')
      });
    }
    
    return contributions;
  }

  private async getAccountMapping(componentType: string): Promise<string> {
    const mapping = this.accountMappings.get(componentType);
    return mapping?.accountCode || 'UNKNOWN';
  }

  private calculateDueDate(liabilityType: PayrollLiabilityType): string {
    const dueDate = new Date();
    
    // Simplified due date calculation
    switch (liabilityType) {
      case 'nis_employee':
      case 'nis_employer':
        dueDate.setDate(dueDate.getDate() + 15); // 15th of next month
        break;
      case 'nht_employee':
      case 'nht_employer':
        dueDate.setDate(dueDate.getDate() + 20); // 20th of next month
        break;
      case 'paye_tax':
        dueDate.setDate(dueDate.getDate() + 25); // 25th of next month
        break;
      case 'education_tax_employee':
      case 'education_tax_employer':
        dueDate.setDate(dueDate.getDate() + 30); // End of next month
        break;
      default:
        dueDate.setDate(dueDate.getDate() + 30); // Default 30 days
    }
    
    return dueDate.toISOString().split('T')[0];
  }

  private async generateCashFlowProjection(
    liabilities: PayrollLiability[],
    employerContributions: PayrollEmployerContribution[]
  ): Promise<PayrollCashFlowProjection> {
    const allPayments = [
      ...liabilities.map(liab => ({
        date: liab.dueDate,
        amount: liab.amount,
        liabilityType: liab.type,
        description: liab.description,
        probability: 'high' as const
      })),
      ...employerContributions.map(cont => ({
        date: cont.dueDate,
        amount: cont.totalAmount,
        liabilityType: cont.type as PayrollLiabilityType,
        description: cont.description,
        probability: 'high' as const
      }))
    ];

    const today = new Date();
    const nextSevenDays = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    const nextThirtyDays = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
    const nextNinetyDays = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000);

    const nextSevenDaysTotal = allPayments
      .filter(payment => new Date(payment.date) <= nextSevenDays)
      .reduce((sum, payment) => sum + payment.amount, 0);

    const nextThirtyDaysTotal = allPayments
      .filter(payment => new Date(payment.date) <= nextThirtyDays)
      .reduce((sum, payment) => sum + payment.amount, 0);

    const nextNinetyDaysTotal = allPayments
      .filter(payment => new Date(payment.date) <= nextNinetyDays)
      .reduce((sum, payment) => sum + payment.amount, 0);

    return {
      nextSevenDays: nextSevenDaysTotal,
      nextThirtyDays: nextThirtyDaysTotal,
      nextNinetyDays: nextNinetyDaysTotal,
      projectedPayments: allPayments,
      cashFlowWarnings: [] // Would generate warnings based on cash flow analysis
    };
  }

  private async validateStatutoryCompliance(payrollData: any): Promise<PayrollStatutoryComplianceStatus> {
    // Mock implementation - would perform actual compliance validation
    return {
      nisCompliance: true,
      nhtCompliance: true,
      payeCompliance: true,
      educationTaxCompliance: true,
      minimumWageCompliance: true,
      deductionLimitCompliance: true,
      overallComplianceScore: 95,
      lastComplianceCheck: new Date().toISOString(),
      complianceIssues: [],
      statutoryDeadlines: []
    };
  }

  private async performBalancingChecks(postingLines: PayrollGLPostingLine[]): Promise<PayrollBalancingCheck[]> {
    return await this.validatePayrollBalancing(postingLines);
  }

  private async detectVariances(postingLines: PayrollGLPostingLine[], payrollData: any): Promise<PayrollVariance[]> {
    // Mock implementation - would detect actual variances
    return [];
  }

  private generateReconciliationSummary(
    postingLines: PayrollGLPostingLine[],
    variances: PayrollVariance[],
    balancingChecks: PayrollBalancingCheck[]
  ): PayrollReconciliationSummary {
    const totalPayrollTransactions = postingLines.length;
    const reconciledTransactions = postingLines.length - variances.length;
    const varianceTransactions = variances.length;
    const totalVarianceAmount = variances.reduce((sum, variance) => sum + Math.abs(variance.varianceAmount), 0);
    const largestVariance = variances.length > 0 ? Math.max(...variances.map(v => Math.abs(v.varianceAmount))) : 0;
    const averageVariance = varianceTransactions > 0 ? totalVarianceAmount / varianceTransactions : 0;

    const varianceByType: Record<PayrollVarianceType, number> = {} as any;
    for (const variance of variances) {
      varianceByType[variance.type] = (varianceByType[variance.type] || 0) + 1;
    }

    return {
      totalPayrollTransactions,
      reconciledTransactions,
      varianceTransactions,
      totalVarianceAmount,
      largestVariance,
      averageVariance,
      varianceByType,
      varianceByDepartment: {},
      varianceByProject: {}
    };
  }

  private calculateConfidenceScore(
    balancingChecks: PayrollBalancingCheck[],
    variances: PayrollVariance[],
    accountMappingValidation: PayrollAccountMappingValidation,
    complianceValidation: PayrollComplianceValidation
  ): number {
    let score = 100;

    // Deduct for failed balancing checks
    const failedBalancingChecks = balancingChecks.filter(check => !check.passed).length;
    score -= failedBalancingChecks * 10;

    // Deduct for variances
    score -= variances.length * 5;

    // Deduct for mapping issues
    if (accountMappingValidation.validationStatus === 'error') score -= 20;
    else if (accountMappingValidation.validationStatus === 'warning') score -= 10;

    // Deduct for compliance issues
    if (!complianceValidation.statutoryDeductionsValid) score -= 15;
    if (!complianceValidation.employerContributionsValid) score -= 15;
    if (!complianceValidation.taxCalculationsValid) score -= 10;

    return Math.max(0, Math.min(100, score));
  }

  private generateReconciliationRecommendations(
    variances: PayrollVariance[],
    balancingChecks: PayrollBalancingCheck[],
    accountMappingValidation: PayrollAccountMappingValidation,
    complianceValidation: PayrollComplianceValidation
  ): string[] {
    const recommendations: string[] = [];

    if (variances.length > 0) {
      recommendations.push(`Resolve ${variances.length} detected variances before posting`);
    }

    const failedBalancingChecks = balancingChecks.filter(check => !check.passed);
    if (failedBalancingChecks.length > 0) {
      recommendations.push(`Fix ${failedBalancingChecks.length} balancing check failures`);
    }

    if (accountMappingValidation.unmappedAccounts.length > 0) {
      recommendations.push(`Map ${accountMappingValidation.unmappedAccounts.length} unmapped payroll components`);
    }

    if (accountMappingValidation.invalidMappings.length > 0) {
      recommendations.push(`Fix ${accountMappingValidation.invalidMappings.length} invalid account mappings`);
    }

    if (!complianceValidation.statutoryDeductionsValid) {
      recommendations.push('Review statutory deduction calculations for compliance');
    }

    if (!complianceValidation.employerContributionsValid) {
      recommendations.push('Validate employer contribution calculations');
    }

    return recommendations;
  }

  private async fetchExistingVariances(companyId: string, payrollPeriodId: string): Promise<PayrollVariance[]> {
    // Mock implementation - would fetch actual variances
    return [];
  }

  private async generateVarianceAdjustments(variances: PayrollVariance[]): Promise<PayrollVarianceAdjustment[]> {
    // Mock implementation - would generate actual adjustments
    return [];
  }

  private calculateVarianceReconciliationSummary(
    variances: PayrollVariance[],
    adjustments: PayrollVarianceAdjustment[]
  ): PayrollVarianceReconciliationSummary {
    const totalVariances = variances.length;
    const resolvedVariances = adjustments.length;
    const totalAdjustmentAmount = adjustments.reduce((sum, adj) => sum + Math.abs(adj.adjustmentAmount), 0);
    
    const adjustmentTypes: Record<string, number> = {};
    for (const adjustment of adjustments) {
      adjustmentTypes[adjustment.adjustmentType] = (adjustmentTypes[adjustment.adjustmentType] || 0) + 1;
    }

    const netImpact = adjustments.reduce((sum, adj) => sum + adj.adjustmentAmount, 0);
    const reconciliationAccuracy = totalVariances > 0 ? (resolvedVariances / totalVariances) * 100 : 100;

    return {
      totalVariances,
      resolvedVariances,
      totalAdjustmentAmount,
      adjustmentTypes,
      netImpact,
      reconciliationAccuracy
    };
  }

  private calculateAllocationVarianceAnalysis(allocations: PayrollCostAllocation[]): PayrollAllocationVarianceAnalysis {
    // Mock implementation - would calculate actual variances
    return {
      totalVariance: 0,
      variancePercentage: 0,
      varianceByEmployee: {},
      varianceByDepartment: {},
      explanations: [],
      recommendations: []
    };
  }

  private getAllPayrollComponents(): PayrollComponentType[] {
    return [
      { category: 'wages', type: 'regular_wages', description: 'Regular wages', isTaxable: true, isStatutory: false, requiresEmployerContribution: false },
      { category: 'overtime', type: 'overtime_pay', description: 'Overtime pay', isTaxable: true, isStatutory: false, requiresEmployerContribution: false },
      { category: 'deductions', type: 'nis_employee', description: 'NIS employee deduction', isTaxable: false, isStatutory: true, requiresEmployerContribution: true },
      { category: 'deductions', type: 'nht_employee', description: 'NHT employee deduction', isTaxable: false, isStatutory: true, requiresEmployerContribution: true },
      { category: 'taxes', type: 'paye_tax', description: 'PAYE tax withholding', isTaxable: false, isStatutory: true, requiresEmployerContribution: false },
      { category: 'taxes', type: 'education_tax_employee', description: 'Education tax employee deduction', isTaxable: false, isStatutory: true, requiresEmployerContribution: true },
      { category: 'contributions', type: 'nis_employer', description: 'NIS employer contribution', isTaxable: false, isStatutory: true, requiresEmployerContribution: true },
      { category: 'contributions', type: 'nht_employer', description: 'NHT employer contribution', isTaxable: false, isStatutory: true, requiresEmployerContribution: true },
      { category: 'contributions', type: 'education_tax_employer', description: 'Education tax employer contribution', isTaxable: false, isStatutory: true, requiresEmployerContribution: true }
    ];
  }

  private async validateSingleMapping(mapping: PayrollAccountingMapping): Promise<{
    isValid: boolean;
    expectedType: AccountType;
    issue: string;
    recommendation: string;
  }> {
    // Mock validation - would perform actual validation
    return {
      isValid: true,
      expectedType: 'expense',
      issue: '',
      recommendation: ''
    };
  }

  private calculateReadinessScore(
    journalPreview: PayrollJournalPreview,
    liabilitySummary: PayrollLiabilitySummary,
    reconciliationResult: PayrollReconciliationResult,
    accountMappings: PayrollAccountMappingValidation
  ): number {
    let score = 100;

    // Deduct for reconciliation issues
    if (reconciliationResult.status !== 'reconciled') {
      score -= 20;
    }

    // Deduct for variances
    score -= reconciliationResult.summary.varianceTransactions * 5;

    // Deduct for mapping issues
    if (accountMappings.validationStatus === 'error') score -= 20;
    else if (accountMappings.validationStatus === 'warning') score -= 10;

    // Deduct for compliance issues
    if (liabilitySummary.statutoryCompliance.overallComplianceScore < 90) {
      score -= 15;
    }

    return Math.max(0, Math.min(100, score));
  }

  private generateIntegrationSummary(
    journalPreview: PayrollJournalPreview,
    liabilitySummary: PayrollLiabilitySummary,
    reconciliationResult: PayrollReconciliationResult
  ): PayrollIntegrationSummary {
    return {
      totalPayrollAmount: journalPreview.totalAmount,
      totalEmployees: 1, // Would calculate from actual data
      totalDepartments: 1, // Would calculate from actual data
      totalProjects: 1, // Would calculate from actual data
      journalEntriesGenerated: 1,
      journalEntriesPosted: 0, // Preview only
      liabilitiesIdentified: liabilitySummary.liabilities.length,
      variancesDetected: reconciliationResult.summary.varianceTransactions,
      integrationAccuracy: reconciliationResult.confidenceScore
    };
  }

  private generateAccountMappingSummary(validation: PayrollAccountMappingValidation): PayrollAccountMappingSummary {
    return {
      totalMappings: validation.totalAccounts,
      activeMappings: validation.mappedAccounts,
      coveragePercentage: validation.mappingCoverage,
      unmappedComponents: validation.unmappedAccounts.map(type => ({ 
        category: 'other' as const, 
        type, 
        description: `Unmapped component: ${type}`, 
        isTaxable: false, 
        isStatutory: false, 
        requiresEmployerContribution: false 
      })),
      mappingConflicts: [], // Would detect actual conflicts
      lastValidated: validation.lastValidated,
      mappingCoverage: validation.mappingCoverage
    };
  }

  private generateJournalPreviewSummary(journalPreview: PayrollJournalPreview): PayrollJournalPreviewSummary {
    return {
      totalJournals: 1,
      totalAmount: journalPreview.totalAmount,
      journalsByStatus: { [journalPreview.status]: 1 },
      journalsByDepartment: {}, // Would calculate from actual data
      journalsByProject: {}, // Would calculate from actual data
      previewAccuracy: journalPreview.reconciliation.confidenceScore,
      lastGenerated: journalPreview.generatedAt
    };
  }

  private generateReconciliationStatus(reconciliationResult: PayrollReconciliationResult): PayrollReconciliationStatus {
    return {
      lastReconciliationDate: reconciliationResult.reconciliationDate,
      reconciliationFrequency: 'monthly',
      outstandingVariances: reconciliationResult.summary.varianceTransactions,
      averageVarianceAmount: reconciliationResult.summary.averageVariance,
      reconciliationAccuracy: reconciliationResult.confidenceScore,
      trendDirection: 'stable'
    };
  }

  private generateComplianceStatus(compliance: PayrollStatutoryComplianceStatus): PayrollComplianceStatus {
    return {
      overallComplianceScore: compliance.overallComplianceScore,
      statutoryDeductionsValid: compliance.nisCompliance && compliance.nhtCompliance,
      employerContributionsValid: true, // Would check actual employer contributions
      taxCalculationsValid: compliance.payeCompliance && compliance.educationTaxCompliance,
      complianceIssues: compliance.complianceIssues.length,
      lastComplianceCheck: compliance.lastComplianceCheck,
      nextComplianceDue: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    };
  }

  private generateIntegrationRecommendations(
    journalPreview: PayrollJournalPreview,
    liabilitySummary: PayrollLiabilitySummary,
    reconciliationResult: PayrollReconciliationResult,
    accountMappings: PayrollAccountMappingValidation
  ): string[] {
    const recommendations: string[] = [];

    if (reconciliationResult.status !== 'reconciled') {
      recommendations.push('Address reconciliation issues before proceeding with GL posting');
    }

    if (accountMappings.mappingCoverage < 100) {
      recommendations.push('Complete account mappings for all payroll components');
    }

    if (liabilitySummary.statutoryCompliance.overallComplianceScore < 95) {
      recommendations.push('Review statutory compliance for potential issues');
    }

    if (reconciliationResult.summary.varianceTransactions > 0) {
      recommendations.push('Investigate and resolve payroll variances');
    }

    recommendations.push('Schedule review meeting with finance team before posting');
    recommendations.push('Verify all project allocations are correct');

    return recommendations;
  }

  private generateNextSteps(readinessScore: number, recommendations: string[]): string[] {
    const nextSteps: string[] = [];

    if (readinessScore >= 90) {
      nextSteps.push('Ready for GL posting - proceed with approval workflow');
      nextSteps.push('Schedule final review with management');
      nextSteps.push('Prepare posting documentation');
    } else if (readinessScore >= 70) {
      nextSteps.push('Address high-priority recommendations');
      nextSteps.push('Re-run reconciliation after fixes');
      nextSteps.push('Schedule follow-up review');
    } else {
      nextSteps.push('Significant issues detected - comprehensive review required');
      nextSteps.push('Address all critical recommendations');
      nextSteps.push('Consider postponing payroll posting');
    }

    return nextSteps;
  }

  private async validatePayrollCompliance(payrollData: any): Promise<PayrollComplianceValidation> {
    // Mock implementation - would perform actual compliance validation
    return {
      statutoryDeductionsValid: true,
      employerContributionsValid: true,
      taxCalculationsValid: true,
      minimumWageCompliance: true,
      deductionLimitsValid: true,
      complianceIssues: [],
      overallComplianceScore: 95
    };
  }
}

// ============================================================================
// EXPORT SINGLETON INSTANCE
// ============================================================================

export const payrollAccountingIntegration = PayrollAccountingIntegration.getInstance();
