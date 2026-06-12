// Jamaican Payroll Validation Layer - Phase 1D
// Safe validation utilities for payroll comparison
// PHASE 1D VALIDATION ONLY — NOT ACTIVE PAYROLL

export interface PayrollValidationInput {
  // Existing payroll data
  existingNetPay: number;
  existingTotalDeductions: number;
  existingGrossPay: number;
  
  // Jamaican shadow calculation data
  jamaicanShadowNetPay?: number;
  jamaicanShadowDeductions?: any;
  jamaicanShadowVersion?: string;
  
  // Additional context
  employeeId: string;
  companyId: string;
  payrollPeriodId?: string;
}

export interface PayrollValidationResult {
  // Validation status
  validationStatus: 'valid' | 'warning' | 'error' | 'not_available';
  
  // Validation metadata
  validationVersion: string;
  validationTimestamp: string;
  
  // Comparison results
  netPayDifference: number;
  netPayDifferencePercent: number;
  deductionsDifference: number;
  deductionsDifferencePercent: number;
  
  // Validation warnings
  warnings: string[];
  
  // Detailed differences
  differences: {
    netPay: {
      existing: number;
      jamaican: number;
      difference: number;
      differencePercent: number;
    };
    deductions: {
      existing: number;
      jamaican: number;
      difference: number;
      differencePercent: number;
    };
    breakdown?: {
      employeeDeductions: {
        existing: number;
        jamaican: number;
        difference: number;
      };
      employerContributions: {
        existing: number;
        jamaican: number;
        difference: number;
      };
    };
  };
  
  // Validation flags
  hasSignificantNetPayDifference: boolean;
  hasSignificantDeductionDifference: boolean;
  jamaicanCalculationAvailable: boolean;
}

export interface PayrollValidationThresholds {
  netPayDifferenceThreshold: number; // Percentage threshold (e.g., 5%)
  deductionDifferenceThreshold: number; // Percentage threshold (e.g., 5%)
  absoluteNetPayThreshold: number; // Absolute threshold (e.g., 1000)
  absoluteDeductionThreshold: number; // Absolute threshold (e.g., 1000)
}

export class PayrollValidator {
  private readonly DEFAULT_THRESHOLDS: PayrollValidationThresholds = {
    netPayDifferenceThreshold: 5.0, // 5% threshold
    deductionDifferenceThreshold: 5.0, // 5% threshold
    absoluteNetPayThreshold: 1000, // J$1000 absolute threshold
    absoluteDeductionThreshold: 1000, // J$1000 absolute threshold
  };

  private readonly VALIDATION_VERSION = 'jamaican_validation_v1.0_phase1d';

  /**
   * Validate payroll comparison between existing and Jamaican calculations
   * PHASE 1D VALIDATION ONLY — NOT ACTIVE PAYROLL
   */
  validatePayrollComparison(
    input: PayrollValidationInput,
    thresholds?: Partial<PayrollValidationThresholds>
  ): PayrollValidationResult {
    try {
      const finalThresholds = { ...this.DEFAULT_THRESHOLDS, ...thresholds };
      
      // Check if Jamaican calculation is available
      if (input.jamaicanShadowNetPay === undefined || input.jamaicanShadowDeductions === undefined) {
        return this.createNotAvailableResult(input);
      }

      // Calculate differences
      const netPayDiff = input.jamaicanShadowNetPay - input.existingNetPay;
      const netPayDiffPercent = this.calculatePercentageDifference(input.existingNetPay, input.jamaicanShadowNetPay);
      
      const jamaicanTotalDeductions = this.extractJamaicanTotalDeductions(input.jamaicanShadowDeductions);
      const deductionsDiff = jamaicanTotalDeductions - input.existingTotalDeductions;
      const deductionsDiffPercent = this.calculatePercentageDifference(input.existingTotalDeductions, jamaicanTotalDeductions);

      // Generate warnings
      const warnings = this.generateWarnings(netPayDiff, netPayDiffPercent, deductionsDiff, deductionsDiffPercent, finalThresholds);

      // Determine validation status
      const validationStatus = this.determineValidationStatus(warnings, finalThresholds);

      // Create detailed differences object
      const differences = this.createDifferencesObject(
        input.existingNetPay,
        input.existingTotalDeductions,
        input.jamaicanShadowNetPay,
        jamaicanTotalDeductions,
        netPayDiff,
        netPayDiffPercent,
        deductionsDiff,
        deductionsDiffPercent,
        input.jamaicanShadowDeductions
      );

      return {
        validationStatus,
        validationVersion: this.VALIDATION_VERSION,
        validationTimestamp: new Date().toISOString(),
        netPayDifference: netPayDiff,
        netPayDifferencePercent: netPayDiffPercent,
        deductionsDifference: deductionsDiff,
        deductionsDifferencePercent: deductionsDiffPercent,
        warnings,
        differences,
        hasSignificantNetPayDifference: Math.abs(netPayDiffPercent) > finalThresholds.netPayDifferenceThreshold,
        hasSignificantDeductionDifference: Math.abs(deductionsDiffPercent) > finalThresholds.deductionDifferenceThreshold,
        jamaicanCalculationAvailable: true,
      };
    } catch (error) {
      // PHASE 1D VALIDATION ONLY — NOT ACTIVE PAYROLL
      // If validation fails, return error status but don't break payroll
      console.warn('Payroll validation failed:', error);
      return this.createErrorResult(input, error);
    }
  }

  /**
   * Extract total employee deductions from Jamaican shadow calculation
   */
  private extractJamaicanTotalDeductions(jamaicanDeductions: any): number {
    if (!jamaicanDeductions || typeof jamaicanDeductions !== 'object') {
      return 0;
    }

    // Extract employee deductions
    const employeeDeductions = jamaicanDeductions.total_employee_deductions || 0;
    
    // If total_employee_deductions is not available, sum individual deductions
    if (employeeDeductions === 0) {
      const nis = jamaicanDeductions.nis_deduction || 0;
      const nht = jamaicanDeductions.nht_deduction || 0;
      const paye = jamaicanDeductions.paye_deduction || 0;
      const educationTax = jamaicanDeductions.education_tax_deduction || 0;
      return nis + nht + paye + educationTax;
    }

    return employeeDeductions;
  }

  /**
   * Calculate percentage difference between two values
   */
  private calculatePercentageDifference(oldValue: number, newValue: number): number {
    if (oldValue === 0) {
      return newValue === 0 ? 0 : 100; // 100% difference if old was 0 and new is not
    }
    return ((newValue - oldValue) / Math.abs(oldValue)) * 100;
  }

  /**
   * Generate validation warnings based on differences
   */
  private generateWarnings(
    netPayDiff: number,
    netPayDiffPercent: number,
    deductionsDiff: number,
    deductionsDiffPercent: number,
    thresholds: PayrollValidationThresholds
  ): string[] {
    const warnings: string[] = [];

    // Net pay warnings
    if (Math.abs(netPayDiffPercent) > thresholds.netPayDifferenceThreshold) {
      warnings.push(`Significant net pay difference: ${netPayDiffPercent.toFixed(2)}% (${this.formatCurrency(netPayDiff)})`);
    }

    if (Math.abs(netPayDiff) > thresholds.absoluteNetPayThreshold) {
      warnings.push(`Large absolute net pay difference: ${this.formatCurrency(netPayDiff)}`);
    }

    // Deduction warnings
    if (Math.abs(deductionsDiffPercent) > thresholds.deductionDifferenceThreshold) {
      warnings.push(`Significant deduction difference: ${deductionsDiffPercent.toFixed(2)}% (${this.formatCurrency(deductionsDiff)})`);
    }

    if (Math.abs(deductionsDiff) > thresholds.absoluteDeductionThreshold) {
      warnings.push(`Large absolute deduction difference: ${this.formatCurrency(deductionsDiff)}`);
    }

    // Direction-specific warnings
    if (netPayDiff > 0) {
      warnings.push(`Jamaican calculation results in higher net pay by ${this.formatCurrency(netPayDiff)}`);
    } else if (netPayDiff < 0) {
      warnings.push(`Jamaican calculation results in lower net pay by ${this.formatCurrency(Math.abs(netPayDiff))}`);
    }

    return warnings;
  }

  /**
   * Determine overall validation status
   */
  private determineValidationStatus(warnings: string[], thresholds: PayrollValidationThresholds): 'valid' | 'warning' | 'error' {
    if (warnings.length === 0) {
      return 'valid';
    }

    // Check for critical warnings that should be marked as error
    const criticalWarnings = warnings.filter(warning => 
      warning.includes('Significant') && 
      (warning.includes('net pay') || warning.includes('deduction'))
    );

    return criticalWarnings.length > 0 ? 'error' : 'warning';
  }

  /**
   * Create detailed differences object
   */
  private createDifferencesObject(
    existingNetPay: number,
    existingDeductions: number,
    jamaicanNetPay: number,
    jamaicanDeductions: number,
    netPayDiff: number,
    netPayDiffPercent: number,
    deductionsDiff: number,
    deductionsDiffPercent: number,
    jamaicanShadowDeductions: any
  ) {
    const differences: any = {
      netPay: {
        existing: existingNetPay,
        jamaican: jamaicanNetPay,
        difference: netPayDiff,
        differencePercent: netPayDiffPercent,
      },
      deductions: {
        existing: existingDeductions,
        jamaican: jamaicanDeductions,
        difference: deductionsDiff,
        differencePercent: deductionsDiffPercent,
      },
    };

    // Add breakdown if available
    if (jamaicanShadowDeductions && typeof jamaicanShadowDeductions === 'object') {
      const employeeDeductions = jamaicanShadowDeductions.total_employee_deductions || 0;
      const employerContributions = jamaicanShadowDeductions.total_employer_contributions || 0;

      differences.breakdown = {
        employeeDeductions: {
          existing: existingDeductions,
          jamaican: employeeDeductions,
          difference: employeeDeductions - existingDeductions,
        },
        employerContributions: {
          existing: 0, // Existing system doesn't track employer contributions
          jamaican: employerContributions,
          difference: employerContributions,
        },
      };
    }

    return differences;
  }

  /**
   * Create result when Jamaican calculation is not available
   */
  private createNotAvailableResult(input: PayrollValidationInput): PayrollValidationResult {
    return {
      validationStatus: 'not_available',
      validationVersion: this.VALIDATION_VERSION,
      validationTimestamp: new Date().toISOString(),
      netPayDifference: 0,
      netPayDifferencePercent: 0,
      deductionsDifference: 0,
      deductionsDifferencePercent: 0,
      warnings: ['Jamaican shadow calculation not available'],
      differences: {
        netPay: { existing: input.existingNetPay, jamaican: 0, difference: 0, differencePercent: 0 },
        deductions: { existing: input.existingTotalDeductions, jamaican: 0, difference: 0, differencePercent: 0 },
      },
      hasSignificantNetPayDifference: false,
      hasSignificantDeductionDifference: false,
      jamaicanCalculationAvailable: false,
    };
  }

  /**
   * Create error result when validation fails
   */
  private createErrorResult(input: PayrollValidationInput, error: any): PayrollValidationResult {
    return {
      validationStatus: 'error',
      validationVersion: this.VALIDATION_VERSION,
      validationTimestamp: new Date().toISOString(),
      netPayDifference: 0,
      netPayDifferencePercent: 0,
      deductionsDifference: 0,
      deductionsDifferencePercent: 0,
      warnings: [`Validation error: ${error?.message || 'Unknown error'}`],
      differences: {
        netPay: { existing: input.existingNetPay, jamaican: 0, difference: 0, differencePercent: 0 },
        deductions: { existing: input.existingTotalDeductions, jamaican: 0, difference: 0, differencePercent: 0 },
      },
      hasSignificantNetPayDifference: false,
      hasSignificantDeductionDifference: false,
      jamaicanCalculationAvailable: false,
    };
  }

  /**
   * Format currency for display
   */
  private formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-JM', {
      style: 'currency',
      currency: 'JMD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Math.abs(amount));
  }

  /**
   * Generate validation summary for logging
   */
  generateValidationSummary(result: PayrollValidationResult, employeeId: string): string {
    return `Jamaican Payroll Validation Summary:
Employee: ${employeeId}
Validation Status: ${result.validationStatus}
Validation Version: ${result.validationVersion}
Net Pay Difference: ${this.formatCurrency(result.netPayDifference)} (${result.netPayDifferencePercent.toFixed(2)}%)
Deduction Difference: ${this.formatCurrency(result.deductionsDifference)} (${result.deductionsDifferencePercent.toFixed(2)}%)
Warnings: ${result.warnings.length}
Jamaican Calculation Available: ${result.jamaicanCalculationAvailable}
Validation Timestamp: ${result.validationTimestamp}`;
  }
}

// Export singleton instance for easy access
export const payrollValidator = new PayrollValidator();

