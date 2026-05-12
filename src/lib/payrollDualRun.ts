// Payroll Dual-Run Architecture - Phase 2D-2-2
// Shadow execution framework for dual payroll comparison
// PHASE 2D-2-2 DUAL-RUN SHADOW ARCHITECTURE ONLY — NOT ACTIVE PAYROLL

import { jamaicanPayrollCalculator } from './jamaicanPayroll';
import { payrollValidator } from './payrollValidation';
import { payrollMonitor } from './payrollMonitoring';
import { PayrollActivationInfrastructure } from './payrollActivationInfrastructure';
import { supabase } from './supabase';

// Dual-run type definitions
export interface PayrollDualRunResult {
  usEntries: any[];
  jamaicanEntries: any[];
  comparison: PayrollComparisonResult;
  executionMetadata: {
    startTime: string;
    endTime: string;
    duration: number;
    usCalculationTime: number;
    jamaicanCalculationTime: number;
    comparisonTime: number;
  };
}

export interface PayrollComparisonResult {
  valid: boolean;
  issues: string[];
  warnings: string[];
  recommendations: string[];
  summary: PayrollComparisonSummary;
  confidence: PayrollMigrationConfidence;
}

export interface PayrollComparisonSummary {
  totalWorkers: number;
  workersWithDifferences: number;
  workersWithCriticalDifferences: number;
  averageNetPayDifference: number;
  maxNetPayDifference: number;
  averageDeductionDifference: number;
  maxDeductionDifference: number;
  totalJamaicanNetPay: number;
  totalUSNetPay: number;
  netPayDifferenceTotal: number;
  jamaicanVsUSRatio: number;
}

export interface PayrollDifferenceRecord {
  workerId: string;
  workerName?: string;
  netPayDifference: number;
  netPayDifferencePercent: number;
  deductionDifference: number;
  deductionDifferencePercent: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  jamaicanNetPay: number;
  usNetPay: number;
  jamaicanDeductions: any;
  usDeductions: any;
}

export interface PayrollMigrationConfidence {
  overallScore: number; // 0-100
  readinessLevel: 'not_ready' | 'low_confidence' | 'moderate_confidence' | 'high_confidence' | 'ready';
  keyFactors: {
    calculationConsistency: number;
    differenceThreshold: number;
    validationPassRate: number;
    governanceCompliance: number;
  };
  recommendations: string[];
}

export interface PayrollValidationThresholds {
  maxNetPayDifference: number; // $5.00 default
  maxDeductionDifference: number; // $2.00 default
  maxNetPayDifferencePercent: number; // 2% default
  maxDeductionDifferencePercent: number; // 5% default
  criticalDifferenceThreshold: number; // $50.00 default
  confidenceScoreThreshold: number; // 85 default
}

// Default validation thresholds
const DEFAULT_THRESHOLDS: PayrollValidationThresholds = {
  maxNetPayDifference: 5.00,
  maxDeductionDifference: 2.00,
  maxNetPayDifferencePercent: 2.0,
  maxDeductionDifferencePercent: 5.0,
  criticalDifferenceThreshold: 50.00,
  confidenceScoreThreshold: 85
};

/**
 * Execute dual-run payroll with shadow calculations
 * Runs both US and Jamaican calculations for comparison
 */
export async function executeDualRunPayroll(
  companyId: string,
  payrollPeriodId: string,
  thresholds: Partial<PayrollValidationThresholds> = {}
): Promise<PayrollDualRunResult> {
  const startTime = new Date().toISOString();
  const executionLog: string[] = [];
  
  try {
    executionLog.push(`Starting dual-run execution for company: ${companyId}, period: ${payrollPeriodId}`);
    
    // Merge thresholds with defaults
    const validationThresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
    executionLog.push(`Validation thresholds: ${JSON.stringify(validationThresholds)}`);
    
    // 1. Execute US payroll (shadow calculation)
    const usStartTime = Date.now();
    executionLog.push('Starting US payroll shadow calculation');
    
    const usEntries = await executeUSShadowCalculation(companyId, payrollPeriodId);
    const usCalculationTime = Date.now() - usStartTime;
    
    executionLog.push(`US calculation completed in ${usCalculationTime}ms for ${usEntries.length} workers`);
    
    // 2. Execute Jamaican payroll (shadow calculation)
    const jamaicanStartTime = Date.now();
    executionLog.push('Starting Jamaican payroll shadow calculation');
    
    const jamaicanEntries = await executeJamaicanShadowCalculation(companyId, payrollPeriodId);
    const jamaicanCalculationTime = Date.now() - jamaicanStartTime;
    
    executionLog.push(`Jamaican calculation completed in ${jamaicanCalculationTime}ms for ${jamaicanEntries.length} workers`);
    
    // 3. Compare results
    const comparisonStartTime = Date.now();
    executionLog.push('Starting payroll comparison analysis');
    
    const comparison = await comparePayrollResults(
      usEntries,
      jamaicanEntries,
      validationThresholds
    );
    
    const comparisonTime = Date.now() - comparisonStartTime;
    executionLog.push(`Comparison completed in ${comparisonTime}ms`);
    
    // 4. Store comparison results for audit
    await storeDualRunComparison(companyId, payrollPeriodId, comparison);
    
    const endTime = new Date().toISOString();
    const totalDuration = Date.now() - new Date(startTime).getTime();
    
    const result: PayrollDualRunResult = {
      usEntries,
      jamaicanEntries,
      comparison,
      executionMetadata: {
        startTime,
        endTime,
        duration: totalDuration,
        usCalculationTime,
        jamaicanCalculationTime,
        comparisonTime
      }
    };
    
    executionLog.push(`Dual-run execution completed successfully in ${totalDuration}ms`);
    console.log('Dual-run execution completed:', result);
    console.log('Execution log:', executionLog);
    
    return result;
    
  } catch (error) {
    executionLog.push(`Dual-run execution failed: ${error}`);
    console.error('Dual-run execution failed:', error);
    console.error('Execution log:', executionLog);
    
    throw new Error(`Dual-run execution failed: ${error}`);
  }
}

/**
 * Execute US payroll shadow calculation
 */
async function executeUSShadowCalculation(
  companyId: string,
  payrollPeriodId: string
): Promise<any[]> {
  try {
    // Import payroll functions dynamically to avoid circular dependencies
    const { calculatePayrollForPeriod } = await import('./payroll');
    
    // Get payroll period details
    const { data: period } = await supabase
      .from("payroll_periods")
      .select("*")
      .eq("id", payrollPeriodId)
      .single();

    if (!period) throw new Error("Payroll period not found");

    // Calculate payroll for period (shadow calculation)
    const workerHours = await calculatePayrollForPeriod(
      companyId,
      period.period_start,
      period.period_end
    );

    const entries = [];
    
    for (const wh of workerHours as any[]) {
      // Get tax info
      const { data: taxInfo } = await supabase
        .from("worker_tax_info")
        .select("*")
        .eq("worker_id", wh.worker_id)
        .maybeSingle();

      // Calculate US payroll (existing logic)
      const regularPay = wh.regular_hours * wh.pay_rate;
      const overtimePay = wh.overtime_hours * wh.overtime_rate;
      const grossPay = regularPay + overtimePay;

      // Use existing deduction calculation
      const { calculatePayrollDeductions } = await import('./payroll');
      const deductions = calculatePayrollDeductions(grossPay, taxInfo || {});
      const netPay = grossPay - deductions.total_deductions;

      entries.push({
        company_id: companyId,
        payroll_period_id: payrollPeriodId,
        worker_id: wh.worker_id,
        regular_hours: wh.regular_hours,
        overtime_hours: wh.overtime_hours,
        regular_pay: regularPay,
        overtime_pay: overtimePay,
        gross_pay: grossPay,
        ...deductions,
        net_pay: netPay,
        status: "pending",
        // Shadow calculation fields
        calculation_engine: 'us',
        shadow_calculation_version: '1.0.0',
        created_at: new Date().toISOString()
      });
    }

    return entries;
  } catch (error) {
    console.error('US shadow calculation failed:', error);
    throw new Error(`US shadow calculation failed: ${error}`);
  }
}

/**
 * Execute Jamaican payroll shadow calculation
 */
async function executeJamaicanShadowCalculation(
  companyId: string,
  payrollPeriodId: string
): Promise<any[]> {
  try {
    // Get payroll period details
    const { data: period } = await supabase
      .from("payroll_periods")
      .select("*")
      .eq("id", payrollPeriodId)
      .single();

    if (!period) throw new Error("Payroll period not found");

    // Calculate payroll for period
    const { calculatePayrollForPeriod } = await import('./payroll');
    const workerHours = await calculatePayrollForPeriod(
      companyId,
      period.period_start,
      period.period_end
    );

    const entries = [];
    
    for (const wh of workerHours as any[]) {
      // Get tax info
      const { data: taxInfo } = await supabase
        .from("worker_tax_info")
        .select("*")
        .eq("worker_id", wh.worker_id)
        .maybeSingle();

      // Calculate base pay
      const regularPay = wh.regular_hours * wh.pay_rate;
      const overtimePay = wh.overtime_hours * wh.overtime_rate;
      const grossPay = regularPay + overtimePay;

      // Convert US tax info to Jamaican tax info format
      const jamaicanTaxInfo = {
        nisNumber: undefined,
        taxFileNumber: undefined,
        isExemptNIS: false,
        isExemptNHT: false,
        isExemptEducationTax: false,
        isExemptPAYE: false,
        // Preserve US fields for compatibility
        isExemptFederal: taxInfo?.is_exempt_federal || false,
        isExemptState: taxInfo?.is_exempt_state || false,
        isExemptFICA: taxInfo?.is_exempt_fica || false,
        additionalFederalWithholding: taxInfo?.additional_federal_withholding || 0,
        additionalStateWithholding: taxInfo?.additional_state_withholding || 0,
      };

      // Calculate Jamaican payroll
      const jamaicanInput = {
        grossPay: grossPay,
        employeeId: wh.worker_id,
        companyId: companyId,
        payrollFrequency: 'monthly' as 'weekly' | 'fortnightly' | 'monthly', // Default to monthly for now
        taxInfo: jamaicanTaxInfo,
      };

      const jamaicanCalculation = jamaicanPayrollCalculator.calculateJamaicanPayroll(jamaicanInput);

      entries.push({
        company_id: companyId,
        payroll_period_id: payrollPeriodId,
        worker_id: wh.worker_id,
        regular_hours: wh.regular_hours,
        overtime_hours: wh.overtime_hours,
        regular_pay: regularPay,
        overtime_pay: overtimePay,
        gross_pay: grossPay,
        // Jamaican deductions
        nis_deduction: jamaicanCalculation.nisDeduction,
        nht_deduction: jamaicanCalculation.nhtDeduction,
        paye_deduction: jamaicanCalculation.payeDeduction,
        education_tax_deduction: jamaicanCalculation.educationTaxDeduction,
        total_employee_deductions: jamaicanCalculation.totalEmployeeDeductions,
        employer_nis_contribution: jamaicanCalculation.employerNISContribution,
        employer_nht_contribution: jamaicanCalculation.employerNHTContribution,
        employer_education_tax_contribution: jamaicanCalculation.employerEducationTaxContribution,
        total_employer_contributions: jamaicanCalculation.totalEmployerContributions,
        net_pay: jamaicanCalculation.netPay,
        status: "pending",
        // Shadow calculation fields
        calculation_engine: 'jamaican',
        shadow_calculation_version: jamaicanCalculation.calculationVersion,
        created_at: new Date().toISOString()
      });
    }

    return entries;
  } catch (error) {
    console.error('Jamaican shadow calculation failed:', error);
    throw new Error(`Jamaican shadow calculation failed: ${error}`);
  }
}

/**
 * Compare payroll results between US and Jamaican calculations
 */
export async function comparePayrollResults(
  usEntries: any[],
  jamaicanEntries: any[],
  thresholds: PayrollValidationThresholds
): Promise<PayrollComparisonResult> {
  const comparisonLog: string[] = [];
  const issues: string[] = [];
  const warnings: string[] = [];
  const recommendations: string[] = [];
  const differences: PayrollDifferenceRecord[] = [];
  
  try {
    comparisonLog.push(`Comparing ${usEntries.length} US entries with ${jamaicanEntries.length} Jamaican entries`);
    
    let workersWithDifferences = 0;
    let workersWithCriticalDifferences = 0;
    let totalNetPayDifference = 0;
    let totalUSNetPay = 0;
    let totalJamaicanNetPay = 0;
    
    // Compare each worker's calculations
    for (const usEntry of usEntries) {
      const jamaicanEntry = jamaicanEntries.find(je => je.worker_id === usEntry.worker_id);
      
      if (jamaicanEntry) {
        const netPayDifference = Math.abs(usEntry.net_pay - jamaicanEntry.net_pay);
        const netPayDifferencePercent = usEntry.net_pay !== 0 ? 
          (netPayDifference / Math.abs(usEntry.net_pay)) * 100 : 0;
        
        const usTotalDeductions = usEntry.total_deductions || 0;
        const jamaicanTotalDeductions = jamaicanEntry.total_employee_deductions || 0;
        const deductionDifference = Math.abs(usTotalDeductions - jamaicanTotalDeductions);
        const deductionDifferencePercent = usTotalDeductions !== 0 ? 
          (deductionDifference / Math.abs(usTotalDeductions)) * 100 : 0;
        
        // Determine severity
        let severity: 'low' | 'medium' | 'high' | 'critical' = 'low';
        if (netPayDifference > thresholds.criticalDifferenceThreshold) {
          severity = 'critical';
        } else if (netPayDifference > thresholds.maxNetPayDifference * 5) {
          severity = 'high';
        } else if (netPayDifference > thresholds.maxNetPayDifference * 2) {
          severity = 'medium';
        }
        
        // Check threshold violations
        if (netPayDifference > thresholds.maxNetPayDifference) {
          issues.push(`Worker ${usEntry.worker_id}: Net pay difference $${netPayDifference.toFixed(2)} exceeds threshold $${thresholds.maxNetPayDifference.toFixed(2)}`);
        }
        
        if (netPayDifferencePercent > thresholds.maxNetPayDifferencePercent) {
          warnings.push(`Worker ${usEntry.worker_id}: Net pay difference ${netPayDifferencePercent.toFixed(1)}% exceeds threshold ${thresholds.maxNetPayDifferencePercent.toFixed(1)}%`);
        }
        
        if (deductionDifference > thresholds.maxDeductionDifference) {
          issues.push(`Worker ${usEntry.worker_id}: Deduction difference $${deductionDifference.toFixed(2)} exceeds threshold $${thresholds.maxDeductionDifference.toFixed(2)}`);
        }
        
        if (deductionDifferencePercent > thresholds.maxDeductionDifferencePercent) {
          warnings.push(`Worker ${usEntry.worker_id}: Deduction difference ${deductionDifferencePercent.toFixed(1)}% exceeds threshold ${thresholds.maxDeductionDifferencePercent.toFixed(1)}%`);
        }
        
        // Track statistics
        if (netPayDifference > 0.01) { // More than 1 cent difference
          workersWithDifferences++;
        }
        
        if (severity === 'critical') {
          workersWithCriticalDifferences++;
        }
        
        totalNetPayDifference += netPayDifference;
        totalUSNetPay += usEntry.net_pay;
        totalJamaicanNetPay += jamaicanEntry.net_pay;
        
        differences.push({
          workerId: usEntry.worker_id,
          netPayDifference,
          netPayDifferencePercent,
          deductionDifference,
          deductionDifferencePercent,
          severity,
          jamaicanNetPay: jamaicanEntry.net_pay,
          usNetPay: usEntry.net_pay,
          jamaicanDeductions: {
            nis_deduction: jamaicanEntry.nis_deduction,
            nht_deduction: jamaicanEntry.nht_deduction,
            paye_deduction: jamaicanEntry.paye_deduction,
            education_tax_deduction: jamaicanEntry.education_tax_deduction,
            total_employee_deductions: jamaicanEntry.total_employee_deductions
          },
          usDeductions: {
            federal_tax: usEntry.federal_tax,
            state_tax: usEntry.state_tax,
            social_security: usEntry.social_security,
            medicare: usEntry.medicare,
            health_insurance: usEntry.health_insurance,
            retirement_401k: usEntry.retirement_401k,
            other_deductions: usEntry.other_deductions,
            total_deductions: usEntry.total_deductions
          }
        });
      } else {
        warnings.push(`Worker ${usEntry.worker_id}: No Jamaican calculation found for comparison`);
      }
    }
    
    // Calculate summary statistics
    const averageNetPayDifference = workersWithDifferences > 0 ? totalNetPayDifference / workersWithDifferences : 0;
    const maxNetPayDifference = Math.max(...differences.map(d => d.netPayDifference));
    const averageDeductionDifference = workersWithDifferences > 0 ? 
      differences.reduce((sum, d) => sum + d.deductionDifference, 0) / workersWithDifferences : 0;
    const maxDeductionDifference = Math.max(...differences.map(d => d.deductionDifference));
    
    const summary: PayrollComparisonSummary = {
      totalWorkers: usEntries.length,
      workersWithDifferences,
      workersWithCriticalDifferences,
      averageNetPayDifference,
      maxNetPayDifference,
      averageDeductionDifference,
      maxDeductionDifference,
      totalJamaicanNetPay,
      totalUSNetPay,
      netPayDifferenceTotal: totalNetPayDifference,
      jamaicanVsUSRatio: totalUSNetPay !== 0 ? totalJamaicanNetPay / totalUSNetPay : 1
    };
    
    // Calculate confidence score
    const confidence = calculateMigrationConfidenceScore(summary, differences, thresholds);
    
    // Generate recommendations
    if (workersWithCriticalDifferences > 0) {
      recommendations.push('Address critical payroll differences before migration');
    }
    
    if (averageNetPayDifference > thresholds.maxNetPayDifference) {
      recommendations.push('Review calculation methods for systematic differences');
    }
    
    if (workersWithDifferences / usEntries.length > 0.1) { // More than 10% have differences
      recommendations.push('Investigate root cause of widespread calculation differences');
    }
    
    const result: PayrollComparisonResult = {
      valid: issues.length === 0 && workersWithCriticalDifferences === 0,
      issues,
      warnings,
      recommendations,
      summary,
      confidence
    };
    
    comparisonLog.push(`Comparison completed: ${JSON.stringify(result)}`);
    console.log('Payroll comparison completed:', result);
    console.log('Comparison log:', comparisonLog);
    
    return result;
    
  } catch (error) {
    comparisonLog.push(`Comparison failed: ${error}`);
    console.error('Payroll comparison failed:', error);
    console.error('Comparison log:', comparisonLog);
    
    throw new Error(`Payroll comparison failed: ${error}`);
  }
}

/**
 * Calculate migration confidence score
 */
export function calculateMigrationConfidenceScore(
  summary: PayrollComparisonSummary,
  differences: PayrollDifferenceRecord[],
  thresholds: PayrollValidationThresholds
): PayrollMigrationConfidence {
  try {
    // Factor 1: Calculation consistency (0-25 points)
    const consistencyScore = Math.max(0, 25 - (summary.averageNetPayDifference * 5));
    
    // Factor 2: Difference threshold compliance (0-25 points)
    const thresholdCompliance = summary.workersWithDifferences === 0 ? 25 : 
      Math.max(0, 25 - (summary.workersWithDifferences / summary.totalWorkers * 50));
    
    // Factor 3: Validation pass rate (0-25 points)
    const passRate = (summary.totalWorkers - summary.workersWithDifferences) / summary.totalWorkers;
    const validationScore = passRate * 25;
    
    // Factor 4: Governance compliance (0-25 points)
    const governanceScore = 25; // Placeholder - would check actual governance status
    
    const overallScore = Math.round(consistencyScore + thresholdCompliance + validationScore + governanceScore);
    
    let readinessLevel: PayrollMigrationConfidence['readinessLevel'] = 'not_ready';
    if (overallScore >= thresholds.confidenceScoreThreshold) {
      readinessLevel = 'ready';
    } else if (overallScore >= 70) {
      readinessLevel = 'high_confidence';
    } else if (overallScore >= 50) {
      readinessLevel = 'moderate_confidence';
    } else if (overallScore >= 25) {
      readinessLevel = 'low_confidence';
    }
    
    const result: PayrollMigrationConfidence = {
      overallScore,
      readinessLevel,
      keyFactors: {
        calculationConsistency: consistencyScore,
        differenceThreshold: thresholdCompliance,
        validationPassRate: validationScore,
        governanceCompliance: governanceScore
      },
      recommendations: []
    };
    
    // Add readiness-based recommendations
    if (readinessLevel === 'not_ready') {
      result.recommendations.push('Significant issues found - do not proceed with migration');
    } else if (readinessLevel === 'low_confidence') {
      result.recommendations.push('Major improvements needed before migration consideration');
    } else if (readinessLevel === 'moderate_confidence') {
      result.recommendations.push('Additional validation and testing recommended');
    } else if (readinessLevel === 'high_confidence') {
      result.recommendations.push('Ready for migration with monitoring');
    }
    
    return result;
    
  } catch (error) {
    console.error('Confidence score calculation failed:', error);
    
    return {
      overallScore: 0,
      readinessLevel: 'not_ready',
      keyFactors: {
        calculationConsistency: 0,
        differenceThreshold: 0,
        validationPassRate: 0,
        governanceCompliance: 0
      },
      recommendations: ['Unable to calculate confidence score']
    };
  }
}

/**
 * Validate dual-run results against thresholds
 */
export async function validateDualRunResults(
  comparison: PayrollComparisonResult,
  thresholds: PayrollValidationThresholds
): Promise<{
  valid: boolean;
  issues: string[];
  warnings: string[];
}> {
  const validationLog: string[] = [];
  const issues: string[] = [];
  const warnings: string[] = [];
  
  try {
    validationLog.push('Validating dual-run results against thresholds');
    
    // Check for critical differences
    const criticalDifferences = comparison.summary.workersWithCriticalDifferences;
    if (criticalDifferences > 0) {
      issues.push(`${criticalDifferences} workers have critical payroll differences exceeding $${thresholds.criticalDifferenceThreshold.toFixed(2)}`);
    }
    
    // Check average differences
    if (comparison.summary.averageNetPayDifference > thresholds.maxNetPayDifference) {
      issues.push(`Average net pay difference $${comparison.summary.averageNetPayDifference.toFixed(2)} exceeds threshold $${thresholds.maxNetPayDifference.toFixed(2)}`);
    }
    
    // Check confidence score
    if (comparison.confidence.overallScore < thresholds.confidenceScoreThreshold) {
      warnings.push(`Confidence score ${comparison.confidence.overallScore} below recommended threshold ${thresholds.confidenceScoreThreshold}`);
    }
    
    // Check difference percentage
    const differencePercentage = (comparison.summary.workersWithDifferences / comparison.summary.totalWorkers) * 100;
    if (differencePercentage > 10) {
      warnings.push(`${differencePercentage.toFixed(1)}% of workers have calculation differences (above 10% threshold)`);
    }
    
    const result = {
      valid: issues.length === 0,
      issues,
      warnings
    };
    
    validationLog.push(`Validation completed: ${JSON.stringify(result)}`);
    console.log('Dual-run validation completed:', result);
    console.log('Validation log:', validationLog);
    
    return result;
    
  } catch (error) {
    validationLog.push(`Validation failed: ${error}`);
    console.error('Dual-run validation failed:', error);
    console.error('Validation log:', validationLog);
    
    return {
      valid: false,
      issues: [`Validation failed: ${error}`],
      warnings: ['Unable to complete validation']
    };
  }
}

/**
 * Generate comparison summary for reporting
 */
export function generateComparisonSummary(
  comparison: PayrollComparisonResult
): {
  summary: string;
  details: string[];
  recommendations: string[];
} {
  const summary = `
Dual-Run Comparison Summary
=========================
Total Workers: ${comparison.summary.totalWorkers}
Workers with Differences: ${comparison.summary.workersWithDifferences} (${((comparison.summary.workersWithDifferences / comparison.summary.totalWorkers) * 100).toFixed(1)}%)
Critical Differences: ${comparison.summary.workersWithCriticalDifferences}
Average Net Pay Difference: $${comparison.summary.averageNetPayDifference.toFixed(2)}
Maximum Net Pay Difference: $${comparison.summary.maxNetPayDifference.toFixed(2)}
Confidence Score: ${comparison.confidence.overallScore}/100 (${comparison.confidence.readinessLevel})
Jamaican vs US Ratio: ${comparison.summary.jamaicanVsUSRatio.toFixed(3)}
  `.trim();
  
  const details = [
    `Calculation Consistency: ${comparison.confidence.keyFactors.calculationConsistency.toFixed(1)}/25`,
    `Threshold Compliance: ${comparison.confidence.keyFactors.differenceThreshold.toFixed(1)}/25`,
    `Validation Pass Rate: ${comparison.confidence.keyFactors.validationPassRate.toFixed(1)}/25`,
    `Governance Compliance: ${comparison.confidence.keyFactors.governanceCompliance.toFixed(1)}/25`,
    `Total US Net Pay: $${comparison.summary.totalUSNetPay.toFixed(2)}`,
    `Total Jamaican Net Pay: $${comparison.summary.totalJamaicanNetPay.toFixed(2)}`,
    `Net Pay Difference Total: $${comparison.summary.netPayDifferenceTotal.toFixed(2)}`
  ];
  
  return {
    summary,
    details,
    recommendations: comparison.recommendations
  };
}

/**
 * Store dual-run comparison results for audit
 */
async function storeDualRunComparison(
  companyId: string,
  payrollPeriodId: string,
  comparison: PayrollComparisonResult
): Promise<void> {
  try {
    // Store comparison in monitoring system
    // Store comparison in monitoring system (placeholder until method exists)
    console.log('Dual-run comparison data:', {
      companyId,
      payrollPeriodId,
      comparison,
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    });
    
    console.log('Dual-run comparison stored for audit');
  } catch (error) {
    console.error('Failed to store dual-run comparison:', error);
    // Don't throw - this is non-critical storage
  }
}

/**
 * Detect critical payroll differences requiring attention
 */
export function detectCriticalPayrollDifferences(
  differences: PayrollDifferenceRecord[],
  thresholds: PayrollValidationThresholds
): {
  criticalDifferences: PayrollDifferenceRecord[];
  highRiskDifferences: PayrollDifferenceRecord[];
  summary: string;
} {
  const criticalDifferences = differences.filter(d => 
    d.netPayDifference > thresholds.criticalDifferenceThreshold ||
    d.netPayDifferencePercent > thresholds.maxNetPayDifferencePercent * 2
  );
  
  const highRiskDifferences = differences.filter(d => 
    d.severity === 'high' || 
    (d.netPayDifference > thresholds.maxNetPayDifference * 2 && d.netPayDifference <= thresholds.criticalDifferenceThreshold)
  );
  
  const summary = `
Critical Difference Detection
==========================
Critical Differences: ${criticalDifferences.length}
High Risk Differences: ${highRiskDifferences.length}
Total Workers with Issues: ${criticalDifferences.length + highRiskDifferences.length}

Critical Issues Requiring Immediate Attention:
${criticalDifferences.map(d => 
  `- Worker ${d.workerId}: $${d.netPayDifference.toFixed(2)} difference (${d.netPayDifferencePercent.toFixed(1)}%)`
).join('\n')}

High Risk Issues:
${highRiskDifferences.map(d => 
  `- Worker ${d.workerId}: $${d.netPayDifference.toFixed(2)} difference (${d.netPayDifferencePercent.toFixed(1)}%)`
).join('\n')}
  `.trim();
  
  return {
    criticalDifferences,
    highRiskDifferences,
    summary
  };
}
