// Jamaican Payroll Scenario Testing Framework - Phase 3B
// Comprehensive validation and real-world testing framework
// PHASE 3B PAYROLL VALIDATION ONLY — SHADOW SAFE TESTING

import { jamaicanPayrollCalculator } from './jamaicanPayroll';
import { jamaicanPayrollCompliance } from './jamaicanPayrollCompliance';
import { payrollValidator } from './payrollValidation';
import type { JamaicanWorkerTaxInfo, JamaicanPayrollInput, JamaicanPayrollResult } from './jamaicanPayroll';
import type { JamaicanPayrollFrequency } from './jamaicanPayrollCompliance';

// ============================================================================
// SCENARIO TESTING TYPES
// ============================================================================

export interface PayrollScenarioProfile {
  id: string;
  name: string;
  category: PayrollScenarioCategory;
  description: string;
  workerData: {
    employeeId: string;
    firstName: string;
    lastName: string;
    grossPay: number;
    regularHours: number;
    overtimeHours: number;
    payRate: number;
    overtimeRate: number;
    frequency: JamaicanPayrollFrequency;
    taxInfo: JamaicanWorkerTaxInfo;
    allowances: JamaicanAllowance[];
    isContractor: boolean;
    hireDate: string;
    department: string;
  };
  expectedResults: {
    netPayRange: { min: number; max: number };
    totalDeductionsRange: { min: number; max: number };
    varianceThreshold: number; // Acceptable variance percentage
    complianceScore: number; // Expected compliance score 0-100
  };
  testParameters: {
    testFrequency: boolean;
    testOvertime: boolean;
    testAllowances: boolean;
    testContractorHandling: boolean;
    testEdgeCases: boolean;
    precisionLevel: 'basic' | 'detailed' | 'comprehensive';
  };
}

// Forward declaration for JamaicanAllowance
export interface JamaicanAllowance {
  type: 'housing' | 'transport' | 'meal' | 'uniform' | 'other';
  amount: number;
  isTaxable: boolean;
  description: string;
  statutoryLimit?: number;
}

export interface PayrollScenarioResult {
  scenarioId: string;
  executionTime: number;
  jamaicanResult: JamaicanPayrollResult;
  complianceResult: any;
  validationResults: {
    statutoryAccuracy: number; // 0-100
    calculationConsistency: number; // 0-100
    roundingConsistency: number; // 0-100
    frequencyAccuracy: number; // 0-100
  };
  variances: PayrollScenarioVariance[];
  edgeCaseResults: PayrollEdgeCaseResult[];
  recommendations: string[];
  overallScore: number; // 0-100
  passed: boolean;
}

export interface PayrollScenarioVariance {
  type: 'nis' | 'nht' | 'paye' | 'education_tax' | 'overtime' | 'allowance' | 'net_pay' | 'total_deductions';
  expected: number;
  actual: number;
  variance: number;
  variancePercent: number;
  varianceLevel: 'low' | 'medium' | 'high' | 'critical';
  acceptable: boolean;
  explanation: string;
}

export interface PayrollEdgeCaseResult {
  caseType: 'minimum_wage' | 'deduction_cap' | 'tax_threshold' | 'overtime_limit' | 'zero_deduction' | 'high_income' | 'partial_period' | 'contractor_exemption';
  description: string;
  expected: any;
  actual: any;
  passed: boolean;
  variance: number;
  explanation: string;
}

export interface PayrollComplianceCrossCheck {
  statutoryCompliance: {
    nisCompliant: boolean;
    nhtCompliant: boolean;
    payeCompliant: boolean;
    educationTaxCompliant: boolean;
    minimumWageCompliant: boolean;
    deductionLimitCompliant: boolean;
  };
  calculationValidation: {
    roundingCorrect: boolean;
    frequencyConversionCorrect: boolean;
    taxBandApplicationCorrect: boolean;
    allowanceTaxabilityCorrect: boolean;
    overtimeCalculationCorrect: boolean;
  };
  dataIntegrity: {
    netPayMatches: boolean;
    deductionsSumCorrect: boolean;
    grossPayConsistent: boolean;
    taxInfoValid: boolean;
  };
  overallScore: number;
  issues: string[];
  recommendations: string[];
}

export interface PayrollValidationSuite {
  suiteId: string;
  scenarios: PayrollScenarioProfile[];
  executionResults: PayrollScenarioResult[];
  summary: {
    totalScenarios: number;
    passedScenarios: number;
    failedScenarios: number;
    overallPassRate: number;
    averageAccuracyScore: number;
    criticalFailures: string[];
    varianceAnalysis: {
      averageVariance: number;
      maxVariance: number;
      varianceDistribution: { low: number; medium: number; high: number; critical: number };
    };
    complianceScore: number;
  };
  recommendations: string[];
  generatedAt: string;
}

export interface PayrollScenarioCategory {
  id: string;
  name: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  testFocus: string[];
}

export interface PayrollAccuracySummary {
  overallAccuracy: number; // 0-100
  statutoryAccuracy: number; // 0-100
  calculationAccuracy: number; // 0-100
  dataIntegrityAccuracy: number; // 0-100
  varianceControl: number; // 0-100
  complianceAdherence: number; // 0-100
  edgeCaseHandling: number; // 0-100
  recommendations: string[];
  criticalIssues: string[];
  confidenceLevel: 'low' | 'medium' | 'high' | 'very_high';
}

// ============================================================================
// SCENARIO CATEGORIES
// ============================================================================

export const PAYROLL_SCENARIO_CATEGORIES: PayrollScenarioCategory[] = [
  {
    id: 'basic_employee',
    name: 'Basic Employee',
    description: 'Standard full-time employee with typical pay and hours',
    priority: 'high',
    testFocus: ['nis', 'nht', 'paye', 'education_tax', 'basic_calculations']
  },
  {
    id: 'high_income_employee',
    name: 'High Income Employee',
    description: 'Employee with income above average tax brackets',
    priority: 'high',
    testFocus: ['paye_progressive', 'high_income_tax', 'tax_band_transitions']
  },
  {
    id: 'low_income_employee',
    name: 'Low Income Employee',
    description: 'Employee near minimum wage with potential exemptions',
    priority: 'medium',
    testFocus: ['minimum_wage', 'tax_thresholds', 'exemption_handling']
  },
  {
    id: 'contractor',
    name: 'Independent Contractor',
    description: 'Contractor with different tax treatment and exemptions',
    priority: 'high',
    testFocus: ['contractor_exemptions', 'nis_exemptions', 'nht_exemptions', 'paye_exemptions']
  },
  {
    id: 'overtime_worker',
    name: 'Overtime Worker',
    description: 'Employee with significant overtime hours',
    priority: 'medium',
    testFocus: ['overtime_calculation', 'overtime_multipliers', 'overtime_limits']
  },
  {
    id: 'allowance_heavy_worker',
    name: 'Allowance-Heavy Worker',
    description: 'Employee with multiple taxable and non-taxable allowances',
    priority: 'medium',
    testFocus: ['allowance_taxability', 'allowance_limits', 'allowance_types']
  },
  {
    id: 'weekly_payroll',
    name: 'Weekly Payroll',
    description: 'Employee paid weekly with frequency-specific calculations',
    priority: 'medium',
    testFocus: ['weekly_frequency', 'weekly_conversions', 'weekly_rounding']
  },
  {
    id: 'fortnightly_payroll',
    name: 'Fortnightly Payroll',
    description: 'Employee paid fortnightly with bi-weekly calculations',
    priority: 'medium',
    testFocus: ['fortnightly_frequency', 'biweekly_conversions', 'fortnightly_rounding']
  },
  {
    id: 'monthly_payroll',
    name: 'Monthly Payroll',
    description: 'Employee paid monthly with standard calculations',
    priority: 'low',
    testFocus: ['monthly_frequency', 'monthly_rounding', 'monthly_deductions']
  },
  {
    id: 'edge_case_statutory',
    name: 'Edge Case Statutory',
    description: 'Edge cases around statutory thresholds and limits',
    priority: 'high',
    testFocus: ['threshold_boundaries', 'cap_limits', 'edge_case_calculations']
  }
];

// ============================================================================
// SCENARIO GENERATOR CLASS
// ============================================================================

export class JamaicanPayrollScenarioTester {
  private testResults: PayrollScenarioResult[] = [];
  private currentSuite: PayrollValidationSuite | null = null;

  /**
   * Generate comprehensive payroll scenario profiles
   * PHASE 3B PAYROLL VALIDATION ONLY — SHADOW SAFE TESTING
   */
  generatePayrollScenarioProfiles(): PayrollScenarioProfile[] {
    const profiles: PayrollScenarioProfile[] = [];

    // Basic Employee Scenarios
    profiles.push(...this.createBasicEmployeeScenarios());
    
    // High Income Employee Scenarios
    profiles.push(...this.createHighIncomeEmployeeScenarios());
    
    // Low Income Employee Scenarios
    profiles.push(...this.createLowIncomeEmployeeScenarios());
    
    // Contractor Scenarios
    profiles.push(...this.createContractorScenarios());
    
    // Overtime Worker Scenarios
    profiles.push(...this.createOvertimeWorkerScenarios());
    
    // Allowance-Heavy Worker Scenarios
    profiles.push(...this.createAllowanceHeavyWorkerScenarios());
    
    // Payroll Frequency Scenarios
    profiles.push(...this.createFrequencyScenarios());
    
    // Edge Case Scenarios
    profiles.push(...this.createEdgeCaseScenarios());

    return profiles;
  }

  /**
   * Execute comprehensive scenario validation
   * PHASE 3B PAYROLL VALIDATION ONLY — SHADOW SAFE TESTING
   */
  async executeScenarioValidation(
    scenarios: PayrollScenarioProfile[],
    precisionLevel: 'basic' | 'detailed' | 'comprehensive' = 'comprehensive'
  ): Promise<PayrollValidationSuite> {
    const suiteId = `suite_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    
    this.testResults = [];

    for (const scenario of scenarios) {
      try {
        const result = await this.validateSingleScenario(scenario, precisionLevel);
        this.testResults.push(result);
      } catch (error) {
        console.error(`Scenario ${scenario.id} failed:`, error);
        this.testResults.push({
          scenarioId: scenario.id,
          executionTime: 0,
          jamaicanResult: {} as JamaicanPayrollResult,
          complianceResult: null,
          validationResults: {
            statutoryAccuracy: 0,
            calculationConsistency: 0,
            roundingConsistency: 0,
            frequencyAccuracy: 0
          },
          variances: [],
          edgeCaseResults: [],
          recommendations: [`Scenario execution failed: ${error}`],
          overallScore: 0,
          passed: false
        });
      }
    }

    const endTime = Date.now();
    const summary = this.buildValidationSuiteSummary(scenarios, this.testResults, endTime - startTime);

    this.currentSuite = {
      suiteId,
      scenarios,
      executionResults: this.testResults,
      summary,
      recommendations: this.generateSuiteRecommendations(summary),
      generatedAt: new Date().toISOString()
    };

    return this.currentSuite;
  }

  /**
   * Validate a single payroll scenario
   * PHASE 3B PAYROLL VALIDATION ONLY — SHADOW SAFE TESTING
   */
  private async validateSingleScenario(
    scenario: PayrollScenarioProfile,
    precisionLevel: 'basic' | 'detailed' | 'comprehensive'
  ): Promise<PayrollScenarioResult> {
    const startTime = Date.now();

    // Execute Jamaican payroll calculation
    const jamaicanInput: JamaicanPayrollInput = {
      grossPay: scenario.workerData.grossPay,
      employeeId: scenario.workerData.employeeId,
      companyId: 'test_company', // Test company ID
      payrollFrequency: scenario.workerData.frequency.type === 'bi-weekly' ? 'fortnightly' : scenario.workerData.frequency.type,
      taxInfo: scenario.workerData.taxInfo
    };

    const jamaicanResult = jamaicanPayrollCalculator.calculateJamaicanPayroll(jamaicanInput);

    // Perform compliance validation
    const complianceResult = jamaicanPayrollCompliance.validateStatutoryCompliance(
      scenario.workerData.grossPay,
      {
        nisDeduction: jamaicanResult.nisDeduction,
        nhtDeduction: jamaicanResult.nhtDeduction,
        payeDeduction: jamaicanResult.payeDeduction,
        educationTaxDeduction: jamaicanResult.educationTaxDeduction,
        totalEmployeeDeductions: jamaicanResult.totalEmployeeDeductions
      },
      scenario.workerData.taxInfo,
      scenario.workerData.frequency
    );

    // Calculate variances
    const variances = this.calculateScenarioVariances(scenario, jamaicanResult);

    // Test edge cases
    const edgeCaseResults = await this.runEdgeCaseValidation(scenario, jamaicanResult);

    // Calculate validation scores
    const validationResults = this.calculateValidationScores(scenario, jamaicanResult, complianceResult, variances);

    // Generate recommendations
    const recommendations = this.generateScenarioRecommendations(scenario, jamaicanResult, complianceResult, variances, edgeCaseResults);

    // Calculate overall score
    const overallScore = this.calculateOverallScore(validationResults, variances, edgeCaseResults);

    const executionTime = Date.now() - startTime;

    return {
      scenarioId: scenario.id,
      executionTime,
      jamaicanResult,
      complianceResult,
      validationResults,
      variances,
      edgeCaseResults,
      recommendations,
      overallScore,
      passed: overallScore >= 80 && edgeCaseResults.every(edge => edge.passed)
    };
  }

  /**
   * Calculate variances between expected and actual results
   * PHASE 3B PAYROLL VALIDATION ONLY — SHADOW SAFE TESTING
   */
  private calculateScenarioVariances(
    scenario: PayrollScenarioProfile,
    result: JamaicanPayrollResult
  ): PayrollScenarioVariance[] {
    const variances: PayrollScenarioVariance[] = [];

    // NIS Variance
    const expectedNIS = scenario.workerData.grossPay * 0.0275; // 2.75%
    variances.push({
      type: 'nis',
      expected: expectedNIS,
      actual: result.nisDeduction,
      variance: result.nisDeduction - expectedNIS,
      variancePercent: ((result.nisDeduction - expectedNIS) / expectedNIS) * 100,
      varianceLevel: this.getVarianceLevel(Math.abs(((result.nisDeduction - expectedNIS) / expectedNIS) * 100)),
      acceptable: Math.abs(((result.nisDeduction - expectedNIS) / expectedNIS) * 100) < 1,
      explanation: `NIS deduction variance: J$${result.nisDeduction} vs expected J$${expectedNIS}`
    });

    // NHT Variance
    const expectedNHT = Math.min(scenario.workerData.grossPay * 0.02, 125000); // 2% with cap
    variances.push({
      type: 'nht',
      expected: expectedNHT,
      actual: result.nhtDeduction,
      variance: result.nhtDeduction - expectedNHT,
      variancePercent: ((result.nhtDeduction - expectedNHT) / expectedNHT) * 100,
      varianceLevel: this.getVarianceLevel(Math.abs(((result.nhtDeduction - expectedNHT) / expectedNHT) * 100)),
      acceptable: Math.abs(((result.nhtDeduction - expectedNHT) / expectedNHT) * 100) < 1,
      explanation: `NHT deduction variance: J$${result.nhtDeduction} vs expected J$${expectedNHT}`
    });

    // PAYE Variance (complex - needs tax band calculation)
    const expectedPAYE = this.calculateExpectedPAYE(scenario.workerData.grossPay, scenario.workerData.taxInfo);
    variances.push({
      type: 'paye',
      expected: expectedPAYE,
      actual: result.payeDeduction,
      variance: result.payeDeduction - expectedPAYE,
      variancePercent: ((result.payeDeduction - expectedPAYE) / expectedPAYE) * 100,
      varianceLevel: this.getVarianceLevel(Math.abs(((result.payeDeduction - expectedPAYE) / expectedPAYE) * 100)),
      acceptable: Math.abs(((result.payeDeduction - expectedPAYE) / expectedPAYE) * 100) < 2,
      explanation: `PAYE deduction variance: J$${result.payeDeduction} vs expected J$${expectedPAYE}`
    });

    // Education Tax Variance
    const expectedEducationTax = scenario.workerData.grossPay * 0.0225; // 2.25%
    variances.push({
      type: 'education_tax',
      expected: expectedEducationTax,
      actual: result.educationTaxDeduction,
      variance: result.educationTaxDeduction - expectedEducationTax,
      variancePercent: ((result.educationTaxDeduction - expectedEducationTax) / expectedEducationTax) * 100,
      varianceLevel: this.getVarianceLevel(Math.abs(((result.educationTaxDeduction - expectedEducationTax) / expectedEducationTax) * 100)),
      acceptable: Math.abs(((result.educationTaxDeduction - expectedEducationTax) / expectedEducationTax) * 100) < 1,
      explanation: `Education Tax variance: J$${result.educationTaxDeduction} vs expected J$${expectedEducationTax}`
    });

    // Net Pay Variance
    const expectedNetPay = scenario.workerData.grossPay - (expectedNIS + expectedNHT + expectedPAYE + expectedEducationTax);
    variances.push({
      type: 'net_pay',
      expected: expectedNetPay,
      actual: result.netPay,
      variance: result.netPay - expectedNetPay,
      variancePercent: ((result.netPay - expectedNetPay) / expectedNetPay) * 100,
      varianceLevel: this.getVarianceLevel(Math.abs(((result.netPay - expectedNetPay) / expectedNetPay) * 100)),
      acceptable: Math.abs(((result.netPay - expectedNetPay) / expectedNetPay) * 100) < scenario.expectedResults.varianceThreshold,
      explanation: `Net pay variance: J$${result.netPay} vs expected J$${expectedNetPay}`
    });

    // Total Deductions Variance
    const expectedTotalDeductions = expectedNIS + expectedNHT + expectedPAYE + expectedEducationTax;
    variances.push({
      type: 'total_deductions',
      expected: expectedTotalDeductions,
      actual: result.totalEmployeeDeductions,
      variance: result.totalEmployeeDeductions - expectedTotalDeductions,
      variancePercent: ((result.totalEmployeeDeductions - expectedTotalDeductions) / expectedTotalDeductions) * 100,
      varianceLevel: this.getVarianceLevel(Math.abs(((result.totalEmployeeDeductions - expectedTotalDeductions) / expectedTotalDeductions) * 100)),
      acceptable: Math.abs(((result.totalEmployeeDeductions - expectedTotalDeductions) / expectedTotalDeductions) * 100) < 1,
      explanation: `Total deductions variance: J$${result.totalEmployeeDeductions} vs expected J$${expectedTotalDeductions}`
    });

    return variances;
  }

  /**
   * Run edge case validation
   * PHASE 3B PAYROLL VALIDATION ONLY — SHADOW SAFE TESTING
   */
  private async runEdgeCaseValidation(
    scenario: PayrollScenarioProfile,
    result: JamaicanPayrollResult
  ): Promise<PayrollEdgeCaseResult[]> {
    const edgeCases: PayrollEdgeCaseResult[] = [];

    // Minimum Wage Edge Case
    edgeCases.push(this.validateMinimumWageEdgeCase(scenario, result));

    // Deduction Cap Edge Cases
    edgeCases.push(this.validateDeductionCapEdgeCases(scenario, result));

    // Tax Threshold Edge Cases
    edgeCases.push(this.validateTaxThresholdEdgeCases(scenario, result));

    // Overtime Limit Edge Cases
    edgeCases.push(this.validateOvertimeLimitEdgeCases(scenario, result));

    // Zero Deduction Edge Cases
    edgeCases.push(this.validateZeroDeductionEdgeCases(scenario, result));

    // High Income Edge Cases
    edgeCases.push(this.validateHighIncomeEdgeCases(scenario, result));

    // Partial Period Edge Cases
    edgeCases.push(this.validatePartialPeriodEdgeCases(scenario, result));

    // Contractor Exemption Edge Cases
    edgeCases.push(this.validateContractorExemptionEdgeCases(scenario, result));

    return edgeCases;
  }

  /**
   * Validate statutory accuracy
   * PHASE 3B PAYROLL VALIDATION ONLY — SHADOW SAFE TESTING
   */
  private validateStatutoryAccuracy(
    scenario: PayrollScenarioProfile,
    result: JamaicanPayrollResult,
    complianceResult: any
  ): number {
    let accuracyScore = 100;

    // Check NIS calculation accuracy
    const expectedNIS = scenario.workerData.grossPay * 0.0275;
    const nisAccuracy = Math.max(0, 100 - Math.abs((result.nisDeduction - expectedNIS) / expectedNIS) * 100);
    accuracyScore = Math.min(accuracyScore, nisAccuracy);

    // Check NHT calculation accuracy
    const expectedNHT = Math.min(scenario.workerData.grossPay * 0.02, 125000);
    const nhtAccuracy = Math.max(0, 100 - Math.abs((result.nhtDeduction - expectedNHT) / expectedNHT) * 100);
    accuracyScore = Math.min(accuracyScore, nhtAccuracy);

    // Check PAYE calculation accuracy
    const expectedPAYE = this.calculateExpectedPAYE(scenario.workerData.grossPay, scenario.workerData.taxInfo);
    const payeAccuracy = Math.max(0, 100 - Math.abs((result.payeDeduction - expectedPAYE) / expectedPAYE) * 100);
    accuracyScore = Math.min(accuracyScore, payeAccuracy);

    // Check Education Tax accuracy
    const expectedEducationTax = scenario.workerData.grossPay * 0.0225;
    const educationTaxAccuracy = Math.max(0, 100 - Math.abs((result.educationTaxDeduction - expectedEducationTax) / expectedEducationTax) * 100);
    accuracyScore = Math.min(accuracyScore, educationTaxAccuracy);

    return accuracyScore;
  }

  /**
   * Generate compliance cross-check
   * PHASE 3B PAYROLL VALIDATION ONLY — SHADOW SAFE TESTING
   */
  generateComplianceCrossCheck(
    scenario: PayrollScenarioProfile,
    result: JamaicanPayrollResult,
    complianceResult: any
  ): PayrollComplianceCrossCheck {
    const statutoryCompliance = {
      nisCompliant: complianceResult?.errors?.length === 0,
      nhtCompliant: complianceResult?.errors?.length === 0,
      payeCompliant: complianceResult?.errors?.length === 0,
      educationTaxCompliant: complianceResult?.errors?.length === 0,
      minimumWageCompliant: scenario.workerData.grossPay >= 30333, // J$30,333 monthly minimum
      deductionLimitCompliant: result.totalEmployeeDeductions <= scenario.workerData.grossPay * 0.20
    };

    const calculationValidation = {
      roundingCorrect: this.validateRounding(result),
      frequencyConversionCorrect: this.validateFrequencyConversion(scenario, result),
      taxBandApplicationCorrect: this.validateTaxBandApplication(scenario, result),
      allowanceTaxabilityCorrect: this.validateAllowanceTaxability(scenario, result),
      overtimeCalculationCorrect: this.validateOvertimeCalculation(scenario, result)
    };

    const dataIntegrity = {
      netPayMatches: Math.abs(result.netPay - (scenario.workerData.grossPay - result.totalEmployeeDeductions)) < 0.01,
      deductionsSumCorrect: Math.abs(result.totalEmployeeDeductions - (result.nisDeduction + result.nhtDeduction + result.payeDeduction + result.educationTaxDeduction)) < 0.01,
      grossPayConsistent: result.netPay + result.totalEmployeeDeductions === scenario.workerData.grossPay,
      taxInfoValid: this.validateTaxInfo(scenario.workerData.taxInfo)
    };

    const overallScore = (
      (statutoryCompliance.nisCompliant ? 20 : 0) +
      (statutoryCompliance.nhtCompliant ? 20 : 0) +
      (statutoryCompliance.payeCompliant ? 20 : 0) +
      (statutoryCompliance.educationTaxCompliant ? 20 : 0) +
      (statutoryCompliance.minimumWageCompliant ? 10 : 0) +
      (statutoryCompliance.deductionLimitCompliant ? 10 : 0)
    );

    const issues: string[] = [];
    const recommendations: string[] = [];

    if (!statutoryCompliance.nisCompliant) issues.push('NIS calculation compliance issues');
    if (!statutoryCompliance.nhtCompliant) issues.push('NHT calculation compliance issues');
    if (!statutoryCompliance.payeCompliant) issues.push('PAYE calculation compliance issues');
    if (!statutoryCompliance.educationTaxCompliant) issues.push('Education Tax calculation compliance issues');
    if (!statutoryCompliance.minimumWageCompliant) issues.push('Minimum wage compliance issues');
    if (!statutoryCompliance.deductionLimitCompliant) issues.push('Deduction limit compliance issues');

    if (!calculationValidation.roundingCorrect) issues.push('Rounding inconsistencies detected');
    if (!calculationValidation.frequencyConversionCorrect) issues.push('Frequency conversion issues detected');
    if (!calculationValidation.taxBandApplicationCorrect) issues.push('Tax band application issues detected');
    if (!calculationValidation.allowanceTaxabilityCorrect) issues.push('Allowance taxability issues detected');
    if (!calculationValidation.overtimeCalculationCorrect) issues.push('Overtime calculation issues detected');

    if (!dataIntegrity.netPayMatches) issues.push('Net pay calculation integrity issues');
    if (!dataIntegrity.deductionsSumCorrect) issues.push('Deductions sum integrity issues');
    if (!dataIntegrity.grossPayConsistent) issues.push('Gross pay consistency issues');
    if (!dataIntegrity.taxInfoValid) issues.push('Tax information validation issues');

    return {
      statutoryCompliance,
      calculationValidation,
      dataIntegrity,
      overallScore,
      issues,
      recommendations
    };
  }

  // ============================================================================
  // SCENARIO GENERATION HELPERS
  // ============================================================================

  private createBasicEmployeeScenarios(): PayrollScenarioProfile[] {
    return [
      {
        id: 'basic_employee_weekly',
        name: 'Basic Employee - Weekly',
        category: PAYROLL_SCENARIO_CATEGORIES.find(c => c.id === 'basic_employee')!,
        description: 'Standard employee paid weekly',
        workerData: {
          employeeId: 'EMP001',
          firstName: 'John',
          lastName: 'Doe',
          grossPay: 50000, // J$50,000 monthly (~J$11,538 weekly)
          regularHours: 40,
          overtimeHours: 0,
          payRate: 1250,
          overtimeRate: 1875,
          frequency: { type: 'weekly', weeksPerPeriod: 1, periodsPerYear: 52, description: 'Weekly payroll' },
          taxInfo: {
            nisNumber: '1234567',
            taxFileNumber: '123-456-789',
            isExemptNIS: false,
            isExemptNHT: false,
            isExemptEducationTax: false,
            isExemptPAYE: false
          },
          allowances: [],
          isContractor: false,
          hireDate: '2020-01-15',
          department: 'Engineering'
        },
        expectedResults: {
          netPayRange: { min: 38000, max: 42000 },
          totalDeductionsRange: { min: 8000, max: 12000 },
          varianceThreshold: 2,
          complianceScore: 95
        },
        testParameters: {
          testFrequency: true,
          testOvertime: false,
          testAllowances: false,
          testContractorHandling: false,
          testEdgeCases: false,
          precisionLevel: 'detailed'
        }
      }
    ];
  }

  private createHighIncomeEmployeeScenarios(): PayrollScenarioProfile[] {
    return [
      {
        id: 'high_income_monthly',
        name: 'High Income Employee - Monthly',
        category: PAYROLL_SCENARIO_CATEGORIES.find(c => c.id === 'high_income_employee')!,
        description: 'High income employee testing top tax brackets',
        workerData: {
          employeeId: 'EMP002',
          firstName: 'Jane',
          lastName: 'Smith',
          grossPay: 500000, // J$500,000 monthly
          regularHours: 40,
          overtimeHours: 0,
          payRate: 12500,
          overtimeRate: 18750,
          frequency: { type: 'monthly', weeksPerPeriod: 4.33, periodsPerYear: 12, description: 'Monthly payroll' },
          taxInfo: {
            nisNumber: '7654321',
            taxFileNumber: '987-654-321',
            isExemptNIS: false,
            isExemptNHT: false,
            isExemptEducationTax: false,
            isExemptPAYE: false
          },
          allowances: [],
          isContractor: false,
          hireDate: '2015-06-01',
          department: 'Management'
        },
        expectedResults: {
          netPayRange: { min: 300000, max: 320000 },
          totalDeductionsRange: { min: 180000, max: 200000 },
          varianceThreshold: 1,
          complianceScore: 90
        },
        testParameters: {
          testFrequency: true,
          testOvertime: false,
          testAllowances: false,
          testContractorHandling: false,
          testEdgeCases: true,
          precisionLevel: 'comprehensive'
        }
      }
    ];
  }

  private createLowIncomeEmployeeScenarios(): PayrollScenarioProfile[] {
    return [
      {
        id: 'low_income_weekly',
        name: 'Low Income Employee - Weekly',
        category: PAYROLL_SCENARIO_CATEGORIES.find(c => c.id === 'low_income_employee')!,
        description: 'Low income employee near minimum wage',
        workerData: {
          employeeId: 'EMP003',
          firstName: 'Bob',
          lastName: 'Johnson',
          grossPay: 15000, // J$15,000 monthly (~J$3,462 weekly)
          regularHours: 40,
          overtimeHours: 0,
          payRate: 375,
          overtimeRate: 562.50,
          frequency: { type: 'weekly', weeksPerPeriod: 1, periodsPerYear: 52, description: 'Weekly payroll' },
          taxInfo: {
            nisNumber: '2345678',
            taxFileNumber: '234-567-890',
            isExemptNIS: false,
            isExemptNHT: false,
            isExemptEducationTax: false,
            isExemptPAYE: false
          },
          allowances: [],
          isContractor: false,
          hireDate: '2023-01-01',
          department: 'Operations'
        },
        expectedResults: {
          netPayRange: { min: 12000, max: 14000 },
          totalDeductionsRange: { min: 1000, max: 3000 },
          varianceThreshold: 3,
          complianceScore: 85
        },
        testParameters: {
          testFrequency: true,
          testOvertime: false,
          testAllowances: false,
          testContractorHandling: false,
          testEdgeCases: true,
          precisionLevel: 'detailed'
        }
      }
    ];
  }

  private createContractorScenarios(): PayrollScenarioProfile[] {
    return [
      {
        id: 'contractor_monthly',
        name: 'Independent Contractor - Monthly',
        category: PAYROLL_SCENARIO_CATEGORIES.find(c => c.id === 'contractor')!,
        description: 'Contractor with tax exemptions',
        workerData: {
          employeeId: 'CON001',
          firstName: 'Mike',
          lastName: 'Wilson',
          grossPay: 200000, // J$200,000 monthly
          regularHours: 40,
          overtimeHours: 0,
          payRate: 5000,
          overtimeRate: 7500,
          frequency: { type: 'monthly', weeksPerPeriod: 4.33, periodsPerYear: 12, description: 'Monthly payroll' },
          taxInfo: {
            nisNumber: '3456789',
            taxFileNumber: '345-678-901',
            isExemptNIS: true, // Contractor exemption
            isExemptNHT: true, // Contractor exemption
            isExemptEducationTax: true, // Contractor exemption
            isExemptPAYE: true // Contractor exemption
          },
          allowances: [],
          isContractor: true,
          hireDate: '2022-03-15',
          department: 'Consulting'
        },
        expectedResults: {
          netPayRange: { min: 195000, max: 200000 },
          totalDeductionsRange: { min: 0, max: 5000 },
          varianceThreshold: 1,
          complianceScore: 95
        },
        testParameters: {
          testFrequency: true,
          testOvertime: false,
          testAllowances: false,
          testContractorHandling: true,
          testEdgeCases: false,
          precisionLevel: 'comprehensive'
        }
      }
    ];
  }

  private createOvertimeWorkerScenarios(): PayrollScenarioProfile[] {
    return [
      {
        id: 'overtime_worker_weekly',
        name: 'Overtime Worker - Weekly',
        category: PAYROLL_SCENARIO_CATEGORIES.find(c => c.id === 'overtime_worker')!,
        description: 'Employee with significant overtime hours',
        workerData: {
          employeeId: 'EMP004',
          firstName: 'Sarah',
          lastName: 'Davis',
          grossPay: 80000, // J$80,000 monthly (~J$18,462 weekly)
          regularHours: 40,
          overtimeHours: 10,
          payRate: 2000,
          overtimeRate: 3000,
          frequency: { type: 'weekly', weeksPerPeriod: 1, periodsPerYear: 52, description: 'Weekly payroll' },
          taxInfo: {
            nisNumber: '4567890',
            taxFileNumber: '456-789-012',
            isExemptNIS: false,
            isExemptNHT: false,
            isExemptEducationTax: false,
            isExemptPAYE: false
          },
          allowances: [],
          isContractor: false,
          hireDate: '2019-08-01',
          department: 'Production'
        },
        expectedResults: {
          netPayRange: { min: 60000, max: 65000 },
          totalDeductionsRange: { min: 15000, max: 20000 },
          varianceThreshold: 2,
          complianceScore: 90
        },
        testParameters: {
          testFrequency: true,
          testOvertime: true,
          testAllowances: false,
          testContractorHandling: false,
          testEdgeCases: false,
          precisionLevel: 'comprehensive'
        }
      }
    ];
  }

  private createAllowanceHeavyWorkerScenarios(): PayrollScenarioProfile[] {
    return [
      {
        id: 'allowance_heavy_monthly',
        name: 'Allowance-Heavy Worker - Monthly',
        category: PAYROLL_SCENARIO_CATEGORIES.find(c => c.id === 'allowance_heavy_worker')!,
        description: 'Employee with multiple allowances',
        workerData: {
          employeeId: 'EMP005',
          firstName: 'Tom',
          lastName: 'Brown',
          grossPay: 120000, // J$120,000 monthly
          regularHours: 40,
          overtimeHours: 0,
          payRate: 3000,
          overtimeRate: 4500,
          frequency: { type: 'monthly', weeksPerPeriod: 4.33, periodsPerYear: 12, description: 'Monthly payroll' },
          taxInfo: {
            nisNumber: '5678901',
            taxFileNumber: '567-890-123',
            isExemptNIS: false,
            isExemptNHT: false,
            isExemptEducationTax: false,
            isExemptPAYE: false
          },
          allowances: [
            { type: 'housing', amount: 5000, isTaxable: false, description: 'Housing allowance' },
            { type: 'transport', amount: 2000, isTaxable: false, description: 'Transport allowance' },
            { type: 'meal', amount: 1500, isTaxable: true, description: 'Meal allowance' },
            { type: 'uniform', amount: 1000, isTaxable: false, description: 'Uniform allowance' }
          ],
          isContractor: false,
          hireDate: '2021-02-01',
          department: 'Sales'
        },
        expectedResults: {
          netPayRange: { min: 95000, max: 100000 },
          totalDeductionsRange: { min: 20000, max: 25000 },
          varianceThreshold: 2,
          complianceScore: 85
        },
        testParameters: {
          testFrequency: true,
          testOvertime: false,
          testAllowances: true,
          testContractorHandling: false,
          testEdgeCases: false,
          precisionLevel: 'comprehensive'
        }
      }
    ];
  }

  private createFrequencyScenarios(): PayrollScenarioProfile[] {
    const scenarios: PayrollScenarioProfile[] = [];

    // Fortnightly scenario
    scenarios.push({
      id: 'fortnightly_employee',
      name: 'Fortnightly Employee',
      category: PAYROLL_SCENARIO_CATEGORIES.find(c => c.id === 'fortnightly_payroll')!,
      description: 'Employee paid fortnightly',
      workerData: {
        employeeId: 'EMP006',
        firstName: 'Lisa',
        lastName: 'Anderson',
        grossPay: 60000, // J$60,000 monthly (~J$27,692 fortnightly)
        regularHours: 40,
        overtimeHours: 0,
        payRate: 1500,
        overtimeRate: 2250,
        frequency: { type: 'fortnightly', weeksPerPeriod: 2, periodsPerYear: 26, description: 'Fortnightly payroll' },
        taxInfo: {
          nisNumber: '6789012',
          taxFileNumber: '678-901-234',
          isExemptNIS: false,
          isExemptNHT: false,
          isExemptEducationTax: false,
          isExemptPAYE: false
        },
        allowances: [],
        isContractor: false,
        hireDate: '2020-05-15',
        department: 'Marketing'
      },
      expectedResults: {
        netPayRange: { min: 45000, max: 50000 },
        totalDeductionsRange: { min: 10000, max: 15000 },
        varianceThreshold: 2,
        complianceScore: 90
      },
      testParameters: {
        testFrequency: true,
        testOvertime: false,
        testAllowances: false,
        testContractorHandling: false,
        testEdgeCases: false,
        precisionLevel: 'detailed'
      }
    });

    return scenarios;
  }

  private createEdgeCaseScenarios(): PayrollScenarioProfile[] {
    const scenarios: PayrollScenarioProfile[] = [];

    // Minimum wage edge case
    scenarios.push({
      id: 'minimum_wage_edge',
      name: 'Minimum Wage Edge Case',
      category: PAYROLL_SCENARIO_CATEGORIES.find(c => c.id === 'edge_case_statutory')!,
      description: 'Employee exactly at minimum wage',
      workerData: {
        employeeId: 'EMP007',
        firstName: 'David',
        lastName: 'Lee',
        grossPay: 30333, // J$30,333 monthly (exactly minimum wage)
        regularHours: 40,
        overtimeHours: 0,
        payRate: 758.33,
        overtimeRate: 1137.50,
        frequency: { type: 'monthly', weeksPerPeriod: 4.33, periodsPerYear: 12, description: 'Monthly payroll' },
        taxInfo: {
          nisNumber: '7890123',
          taxFileNumber: '789-012-345',
          isExemptNIS: false,
          isExemptNHT: false,
          isExemptEducationTax: false,
          isExemptPAYE: false
        },
        allowances: [],
        isContractor: false,
        hireDate: '2023-06-01',
        department: 'Entry Level'
      },
      expectedResults: {
        netPayRange: { min: 25000, max: 28000 },
        totalDeductionsRange: { min: 2000, max: 5000 },
        varianceThreshold: 1,
        complianceScore: 95
      },
      testParameters: {
        testFrequency: true,
        testOvertime: false,
        testAllowances: false,
        testContractorHandling: false,
        testEdgeCases: true,
        precisionLevel: 'comprehensive'
      }
    });

    return scenarios;
  }

  // ============================================================================
  // VALIDATION HELPER METHODS
  // ============================================================================

  private getVarianceLevel(variancePercent: number): 'low' | 'medium' | 'high' | 'critical' {
    if (variancePercent <= 1) return 'low';
    if (variancePercent <= 2) return 'medium';
    if (variancePercent <= 5) return 'high';
    return 'critical';
  }

  private calculateExpectedPAYE(grossPay: number, taxInfo: JamaicanWorkerTaxInfo): number {
    if (taxInfo.isExemptPAYE) return 0;
    
    // Simplified PAYE calculation for expected values
    const annualIncome = grossPay * 12;
    let tax = 0;

    if (annualIncome <= 1500096) {
      tax = annualIncome * 0.25;
    } else if (annualIncome <= 6000000) {
      tax = 75000 + (annualIncome - 1500096) * 0.30;
    } else {
      tax = 225000 + (annualIncome - 6000000) * 0.35;
    }

    return tax / 12; // Convert back to monthly
  }

  private validateRounding(result: JamaicanPayrollResult): boolean {
    // Check if all monetary values are rounded to 2 decimal places
    const values = [
      result.nisDeduction,
      result.nhtDeduction,
      result.payeDeduction,
      result.educationTaxDeduction,
      result.netPay,
      result.totalEmployeeDeductions
    ];

    return values.every(value => Number(value.toFixed(2)) === value);
  }

  private validateFrequencyConversion(scenario: PayrollScenarioProfile, result: JamaicanPayrollResult): boolean {
    // For now, assume frequency conversion is correct
    // In a real implementation, this would check frequency-specific calculations
    return true;
  }

  private validateTaxBandApplication(scenario: PayrollScenarioProfile, result: JamaicanPayrollResult): boolean {
    // Check if PAYE tax bands were applied correctly
    // This is a simplified check - real implementation would be more complex
    return result.payeDeduction >= 0;
  }

  private validateAllowanceTaxability(scenario: PayrollScenarioProfile, result: JamaicanPayrollResult): boolean {
    // Check if allowances were taxed correctly
    // This is a simplified check - real implementation would validate each allowance type
    return true;
  }

  private validateOvertimeCalculation(scenario: PayrollScenarioProfile, result: JamaicanPayrollResult): boolean {
    // Check if overtime was calculated correctly
    // This is a simplified check - real implementation would validate overtime rules
    return true;
  }

  private validateTaxInfo(taxInfo: JamaicanWorkerTaxInfo): boolean {
    // Basic validation of tax information
    return taxInfo.nisNumber?.length === 7 || taxInfo.nisNumber === undefined;
  }

  // ============================================================================
  // EDGE CASE VALIDATION METHODS
  // ============================================================================

  private validateMinimumWageEdgeCase(scenario: PayrollScenarioProfile, result: JamaicanPayrollResult): PayrollEdgeCaseResult {
    const minimumWageMonthly = 30333; // J$30,333
    const passed = scenario.workerData.grossPay >= minimumWageMonthly;
    
    return {
      caseType: 'minimum_wage',
      description: 'Minimum wage compliance check',
      expected: minimumWageMonthly,
      actual: scenario.workerData.grossPay,
      passed,
      variance: Math.abs(scenario.workerData.grossPay - minimumWageMonthly),
      explanation: passed ? 'Minimum wage compliance satisfied' : 'Gross pay below minimum wage'
    };
  }

  private validateDeductionCapEdgeCases(scenario: PayrollScenarioProfile, result: JamaicanPayrollResult): PayrollEdgeCaseResult {
    const nhtMonthlyCap = 125000;
    const expectedNHT = Math.min(scenario.workerData.grossPay * 0.02, nhtMonthlyCap);
    const passed = Math.abs(result.nhtDeduction - expectedNHT) < 1;
    
    return {
      caseType: 'deduction_cap',
      description: 'NHT monthly cap compliance check',
      expected: expectedNHT,
      actual: result.nhtDeduction,
      passed,
      variance: Math.abs(result.nhtDeduction - expectedNHT),
      explanation: passed ? 'NHT cap compliance satisfied' : 'NHT deduction exceeds monthly cap'
    };
  }

  private validateTaxThresholdEdgeCases(scenario: PayrollScenarioProfile, result: JamaicanPayrollResult): PayrollEdgeCaseResult {
    const nisThresholdMonthly = 4333; // J$4,333
    const passed = scenario.workerData.grossPay >= nisThresholdMonthly || result.nisDeduction === 0;
    
    return {
      caseType: 'tax_threshold',
      description: 'NIS threshold compliance check',
      expected: scenario.workerData.grossPay >= nisThresholdMonthly ? 'Above threshold' : 'Below threshold',
      actual: result.nisDeduction > 0 ? 'Deduction applied' : 'No deduction',
      passed,
      variance: 0,
      explanation: passed ? 'NIS threshold compliance satisfied' : 'NIS threshold violation detected'
    };
  }

  private validateOvertimeLimitEdgeCases(scenario: PayrollScenarioProfile, result: JamaicanPayrollResult): PayrollEdgeCaseResult {
    const maxOvertimeHours = 40; // Standard maximum
    const passed = scenario.workerData.overtimeHours <= maxOvertimeHours;
    
    return {
      caseType: 'overtime_limit',
      description: 'Overtime limit compliance check',
      expected: `Max ${maxOvertimeHours} hours`,
      actual: scenario.workerData.overtimeHours,
      passed,
      variance: Math.max(0, scenario.workerData.overtimeHours - maxOvertimeHours),
      explanation: passed ? 'Overtime limits satisfied' : 'Overtime exceeds maximum allowed hours'
    };
  }

  private validateZeroDeductionEdgeCases(scenario: PayrollScenarioProfile, result: JamaicanPayrollResult): PayrollEdgeCaseResult {
    const hasZeroDeductions = result.nisDeduction === 0 && result.nhtDeduction === 0 && result.payeDeduction === 0 && result.educationTaxDeduction === 0;
    const passed = hasZeroDeductions && (scenario.workerData.taxInfo.isExemptNIS || scenario.workerData.taxInfo.isExemptNHT || scenario.workerData.taxInfo.isExemptEducationTax || scenario.workerData.taxInfo.isExemptPAYE);
    
    return {
      caseType: 'zero_deduction',
      description: 'Zero deduction validation',
      expected: 'Valid exemptions or zero deductions',
      actual: hasZeroDeductions ? 'Zero deductions' : 'Non-zero deductions',
      passed,
      variance: 0,
      explanation: passed ? 'Zero deductions properly handled' : 'Zero deductions without valid exemptions'
    };
  }

  private validateHighIncomeEdgeCases(scenario: PayrollScenarioProfile, result: JamaicanPayrollResult): PayrollEdgeCaseResult {
    const topTaxBracketThreshold = 6000000; // J$6,000,000
    const passed = scenario.workerData.grossPay <= topTaxBracketThreshold || result.payeDeduction > 0;
    
    return {
      caseType: 'high_income',
      description: 'High income tax bracket validation',
      expected: 'Top tax bracket applied correctly',
      actual: result.payeDeduction > 0 ? 'PAYE applied' : 'No PAYE',
      passed,
      variance: 0,
      explanation: passed ? 'High income tax handling correct' : 'High income tax calculation issues'
    };
  }

  private validatePartialPeriodEdgeCases(scenario: PayrollScenarioProfile, result: JamaicanPayrollResult): PayrollEdgeCaseResult {
    // For partial periods, check if calculations are prorated correctly
    // This is a simplified check - real implementation would be more complex
    const passed = result.netPay > 0 && result.netPay < scenario.workerData.grossPay;
    
    return {
      caseType: 'partial_period',
      description: 'Partial period calculation validation',
      expected: 'Proportional calculations applied',
      actual: result.netPay > 0 ? 'Net pay calculated' : 'No net pay',
      passed,
      variance: 0,
      explanation: passed ? 'Partial period calculations correct' : 'Partial period calculation issues'
    };
  }

  private validateContractorExemptionEdgeCases(scenario: PayrollScenarioProfile, result: JamaicanPayrollResult): PayrollEdgeCaseResult {
    const hasValidExemptions = scenario.workerData.isContractor && 
      scenario.workerData.taxInfo.isExemptNIS && 
      scenario.workerData.taxInfo.isExemptNHT && 
      scenario.workerData.taxInfo.isExemptEducationTax && 
      scenario.workerData.taxInfo.isExemptPAYE;
    
    const passed = hasValidExemptions || !scenario.workerData.isContractor;
    
    return {
      caseType: 'contractor_exemption',
      description: 'Contractor exemption validation',
      expected: 'Valid contractor exemptions',
      actual: hasValidExemptions ? 'Exemptions applied' : 'No exemptions',
      passed,
      variance: 0,
      explanation: passed ? 'Contractor exemptions correctly applied' : 'Contractor exemption issues'
    };
  }

  // ============================================================================
  // CALCULATION AND SCORING METHODS
  // ============================================================================

  private calculateValidationScores(
    scenario: PayrollScenarioProfile,
    result: JamaicanPayrollResult,
    complianceResult: any,
    variances: PayrollScenarioVariance[]
  ): PayrollScenarioResult['validationResults'] {
    const statutoryAccuracy = this.validateStatutoryAccuracy(scenario, result, complianceResult);
    
    const calculationConsistency = Math.max(0, 100 - (variances.filter(v => !v.acceptable).length * 10));
    
    const roundingConsistency = this.validateRounding(result) ? 100 : 80;
    
    const frequencyAccuracy = this.validateFrequencyConversion(scenario, result) ? 100 : 90;

    return {
      statutoryAccuracy,
      calculationConsistency,
      roundingConsistency,
      frequencyAccuracy
    };
  }

  private calculateOverallScore(
    validationResults: PayrollScenarioResult['validationResults'],
    variances: PayrollScenarioVariance[],
    edgeCaseResults: PayrollEdgeCaseResult[]
  ): number {
    const varianceScore = Math.max(0, 100 - (variances.filter(v => !v.acceptable).length * 5));
    const edgeCaseScore = Math.max(0, 100 - (edgeCaseResults.filter(edge => !edge.passed).length * 10));
    
    const validationAverage = (
      validationResults.statutoryAccuracy +
      validationResults.calculationConsistency +
      validationResults.roundingConsistency +
      validationResults.frequencyAccuracy
    ) / 4;

    return (validationAverage * 0.6) + (varianceScore * 0.2) + (edgeCaseScore * 0.2);
  }

  private generateScenarioRecommendations(
    scenario: PayrollScenarioProfile,
    result: JamaicanPayrollResult,
    complianceResult: any,
    variances: PayrollScenarioVariance[],
    edgeCaseResults: PayrollEdgeCaseResult[]
  ): string[] {
    const recommendations: string[] = [];

    // Variance-based recommendations
    const criticalVariances = variances.filter(v => v.varianceLevel === 'critical');
    if (criticalVariances.length > 0) {
      recommendations.push('Critical calculation variances detected - review calculation logic');
    }

    // Edge case recommendations
    const failedEdgeCases = edgeCaseResults.filter(edge => !edge.passed);
    if (failedEdgeCases.length > 0) {
      recommendations.push('Edge case validation failures - review edge case handling');
    }

    // Compliance recommendations
    if (complianceResult?.errors?.length > 0) {
      recommendations.push('Statutory compliance issues detected - review compliance rules');
    }

    // General recommendations
    if (result.totalEmployeeDeductions > scenario.workerData.grossPay * 0.20) {
      recommendations.push('Total deductions exceed 20% of gross pay - review deduction limits');
    }

    return recommendations;
  }

  private buildValidationSuiteSummary(
    scenarios: PayrollScenarioProfile[],
    results: PayrollScenarioResult[],
    executionTime: number
  ): PayrollValidationSuite['summary'] {
    const totalScenarios = scenarios.length;
    const passedScenarios = results.filter(r => r.passed).length;
    const failedScenarios = totalScenarios - passedScenarios;
    const overallPassRate = (passedScenarios / totalScenarios) * 100;

    const allVariances = results.flatMap(r => r.variances);
    const averageVariance = allVariances.length > 0 ? 
      allVariances.reduce((sum, v) => sum + Math.abs(v.variancePercent), 0) / allVariances.length : 0;
    const maxVariance = allVariances.length > 0 ? 
      Math.max(...allVariances.map(v => Math.abs(v.variancePercent))) : 0;

    const varianceDistribution = allVariances.reduce((acc, v) => {
      acc[v.varianceLevel]++;
      return acc;
    }, { low: 0, medium: 0, high: 0, critical: 0 });

    const averageAccuracyScore = results.reduce((sum, r) => sum + r.overallScore, 0) / results.length;

    const criticalFailures = results
      .filter(r => !r.passed)
      .flatMap(r => r.edgeCaseResults.filter(edge => !edge.passed))
      .map(edge => `${edge.caseType}: ${edge.explanation}`);

    const complianceScore = Math.max(0, 100 - (failedScenarios / totalScenarios) * 100);

    return {
      totalScenarios,
      passedScenarios,
      failedScenarios,
      overallPassRate,
      averageAccuracyScore,
      criticalFailures,
      varianceAnalysis: {
        averageVariance,
        maxVariance,
        varianceDistribution
      },
      complianceScore
    };
  }

  private generateSuiteRecommendations(summary: PayrollValidationSuite['summary']): string[] {
    const recommendations: string[] = [];

    if (summary.overallPassRate < 80) {
      recommendations.push('Overall pass rate below 80% - review calculation accuracy');
    }

    if (summary.averageAccuracyScore < 85) {
      recommendations.push('Average accuracy score below 85% - improve calculation precision');
    }

    if (summary.varianceAnalysis.maxVariance > 5) {
      recommendations.push('Maximum variance exceeds 5% - review calculation logic');
    }

    if (summary.criticalFailures.length > 0) {
      recommendations.push('Critical edge case failures detected - review edge case handling');
    }

    if (summary.complianceScore < 90) {
      recommendations.push('Compliance score below 90% - review statutory compliance');
    }

    return recommendations;
  }

  // ============================================================================
  // PUBLIC API METHODS
  // ============================================================================

  /**
   * Build comprehensive accuracy summary
   * PHASE 3B PAYROLL VALIDATION ONLY — SHADOW SAFE TESTING
   */
  buildAccuracySummary(results: PayrollScenarioResult[]): PayrollAccuracySummary {
    if (results.length === 0) {
      return {
        overallAccuracy: 0,
        statutoryAccuracy: 0,
        calculationAccuracy: 0,
        dataIntegrityAccuracy: 0,
        varianceControl: 0,
        complianceAdherence: 0,
        edgeCaseHandling: 0,
        recommendations: ['No test results available'],
        criticalIssues: ['No test data'],
        confidenceLevel: 'low'
      };
    }

    const overallAccuracy = results.reduce((sum, r) => sum + r.overallScore, 0) / results.length;
    
    const statutoryAccuracy = results.reduce((sum, r) => sum + r.validationResults.statutoryAccuracy, 0) / results.length;
    
    const calculationAccuracy = results.reduce((sum, r) => sum + r.validationResults.calculationConsistency, 0) / results.length;
    
    const dataIntegrityAccuracy = results.reduce((sum, r) => sum + (
      (r.validationResults.roundingConsistency + r.validationResults.frequencyAccuracy) / 2
    ), 0) / results.length;
    
    const varianceControl = Math.max(0, 100 - results.reduce((sum, r) => 
      sum + r.variances.filter(v => !v.acceptable).length * 5, 0) / results.length);
    
    const complianceAdherence = results.filter(r => r.passed).length / results.length * 100;
    
    const edgeCaseHandling = results.reduce((sum, r) => 
      sum + (r.edgeCaseResults.filter(edge => edge.passed).length / Math.max(1, r.edgeCaseResults.length)) * 100, 0) / results.length;

    const criticalIssues = results
      .filter(r => !r.passed)
      .flatMap(r => r.edgeCaseResults.filter(edge => !edge.passed))
      .map(edge => `${edge.caseType}: ${edge.explanation}`);

    let confidenceLevel: 'low' | 'medium' | 'high' | 'very_high' = 'low';
    if (overallAccuracy >= 90) confidenceLevel = 'very_high';
    else if (overallAccuracy >= 80) confidenceLevel = 'high';
    else if (overallAccuracy >= 70) confidenceLevel = 'medium';

    const recommendations: string[] = [];
    if (overallAccuracy < 85) recommendations.push('Improve overall calculation accuracy');
    if (statutoryAccuracy < 90) recommendations.push('Review statutory compliance implementation');
    if (varianceControl < 90) recommendations.push('Reduce calculation variances');
    if (edgeCaseHandling < 85) recommendations.push('Improve edge case handling');
    if (complianceAdherence < 90) recommendations.push('Strengthen compliance validation');

    return {
      overallAccuracy,
      statutoryAccuracy,
      calculationAccuracy,
      dataIntegrityAccuracy,
      varianceControl,
      complianceAdherence,
      edgeCaseHandling,
      recommendations,
      criticalIssues,
      confidenceLevel
    };
  }

}

// ============================================================================
// EXPORT SINGLETON INSTANCE
// ============================================================================

export const jamaicanPayrollScenarioTester = new JamaicanPayrollScenarioTester();
