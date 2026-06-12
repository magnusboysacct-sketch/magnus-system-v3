// Jamaican Payroll Calculation Module - Phase 1B
// Safe calculation layer with placeholder functions
// OFFICIAL JAMAICAN STATUTORY VALIDATION REQUIRED

// Type definitions for Jamaican payroll
export interface JamaicanPayrollInput {
  grossPay: number;
  employeeId: string;
  companyId: string;
  payrollFrequency: 'weekly' | 'fortnightly' | 'monthly';
  taxInfo: JamaicanWorkerTaxInfo;
}

export interface JamaicanWorkerTaxInfo {
  nisNumber?: string;
  taxFileNumber?: string;
  isExemptNIS: boolean;
  isExemptNHT: boolean;
  isExemptEducationTax: boolean;
  isExemptPAYE: boolean;
  // Preserve US fields for compatibility
  isExemptFederal?: boolean;
  isExemptState?: boolean;
  isExemptFICA?: boolean;
  additionalFederalWithholding?: number;
  additionalStateWithholding?: number;
}

export interface JamaicanPayrollResult {
  // Jamaican deductions (employee)
  nisDeduction: number;
  nhtDeduction: number;
  payeDeduction: number;
  educationTaxDeduction: number;
  
  // Employer contributions
  employerNISContribution: number;
  employerNHTContribution: number;
  employerEducationTaxContribution: number;
  
  // Totals
  totalEmployeeDeductions: number;
  totalEmployerContributions: number;
  netPay: number;
  
  // Currency info
  currency: string;
  calculationVersion: string;
  
  // Preserve US fields for compatibility (set to 0)
  federalTax: number;
  stateTax: number;
  socialSecurity: number;
  medicare: number;
}

export interface JamaicanTaxBracket {
  threshold: number;
  rate: number;
  baseTax: number;
}

export interface JamaicanPayrollConfiguration {
  payrollFrequency: 'weekly' | 'fortnightly' | 'monthly';
  baseCurrency: string;
  isJamaicanPayroll: boolean;
  calculationEngineVersion: string;
}

// JMD Currency formatting helper
export function formatJMD(amount: number): string {
  return new Intl.NumberFormat('en-JM', {
    style: 'currency',
    currency: 'JMD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

// Normalize payroll frequency to standard format
export function normalizePayrollFrequency(frequency: string): 'weekly' | 'fortnightly' | 'monthly' {
  const normalized = frequency?.toLowerCase().trim();
  
  switch (normalized) {
    case 'weekly':
    case 'week':
      return 'weekly';
    case 'fortnightly':
    case 'bi-weekly':
    case '2-weeks':
      return 'fortnightly';
    case 'monthly':
    case 'month':
      return 'monthly';
    default:
      return 'monthly'; // Default to monthly
  }
}

// Jamaican Payroll Calculator Class
export class JamaicanPayrollCalculator {
  // OFFICIAL JAMAICAN STATUTORY VALIDATION REQUIRED
  // These rates are placeholders and must be validated against current Jamaican statutes
  
  // NIS Calculation: 2.75% of gross pay
  calculateNIS(grossPay: number, isExempt: boolean): number {
    // OFFICIAL JAMAICAN STATUTORY VALIDATION REQUIRED
    // Current rate: 2.75% of gross earnings
    // No income cap for NIS
    if (isExempt) return 0;
    
    const rate = 0.0275; // 2.75%
    const deduction = grossPay * rate;
    
    // Bankers rounding to 2 decimal places
    return Math.round(deduction * 100) / 100;
  }
  
  // NHT Calculation: 2% of gross pay, capped at J$125,000 monthly
  calculateNHT(grossPay: number, isExempt: boolean): number {
    // OFFICIAL JAMAICAN STATUTORY VALIDATION REQUIRED
    // Current rate: 2% of gross earnings
    // Monthly cap: J$125,000 (J$1,500,000 annually)
    if (isExempt) return 0;
    
    const rate = 0.02; // 2%
    const monthlyCap = 125000; // J$125,000 monthly cap
    const deduction = grossPay * rate;
    
    // Apply monthly cap
    const cappedDeduction = Math.min(deduction, monthlyCap);
    
    // Bankers rounding to 2 decimal places
    return Math.round(cappedDeduction * 100) / 100;
  }
  
  // PAYE Calculation: Progressive tax brackets
  calculatePAYE(taxableIncome: number, isExempt: boolean): number {
    // OFFICIAL JAMAICAN STATUTORY VALIDATION REQUIRED
    // Progressive tax brackets (annual amounts)
    // These brackets are placeholders and must be validated against current Jamaican tax law
    if (isExempt) return 0;
    
    // Annualize monthly taxable income
    const annualIncome = taxableIncome * 12;
    
    let tax = 0;
    
    // Progressive tax brackets (PLACEHOLDER - VALIDATION REQUIRED)
    const brackets: JamaicanTaxBracket[] = [
      { threshold: 0, rate: 0.25, baseTax: 0 },                    // 25% on first J$1,500,096
      { threshold: 1500096, rate: 0.30, baseTax: 75000 },          // 30% on income over J$1,500,096
      { threshold: 6000000, rate: 0.35, baseTax: 225000 }           // 35% on income over J$6,000,000
    ];
    
    // Calculate tax using progressive brackets
    for (const bracket of brackets) {
      if (annualIncome > bracket.threshold) {
        tax = (annualIncome - bracket.threshold) * bracket.rate + bracket.baseTax;
      } else {
        break;
      }
    }
    
    // Convert back to monthly and round
    const monthlyTax = tax / 12;
    
    // Bankers rounding to 2 decimal places
    return Math.round(monthlyTax * 100) / 100;
  }
  
  // Education Tax Calculation: 2.25% of gross pay
  calculateEducationTax(grossPay: number, isExempt: boolean): number {
    // OFFICIAL JAMAICAN STATUTORY VALIDATION REQUIRED
    // Current rate: 2.25% of gross earnings
    // No income cap for Education Tax
    if (isExempt) return 0;
    
    const rate = 0.0225; // 2.25%
    const deduction = grossPay * rate;
    
    // Bankers rounding to 2 decimal places
    return Math.round(deduction * 100) / 100;
  }
  
  // Employer NIS Contribution: 2.5% of gross pay
  calculateEmployerNIS(grossPay: number): number {
    // OFFICIAL JAMAICAN STATUTORY VALIDATION REQUIRED
    // Current rate: 2.5% of gross earnings
    // No income cap for employer NIS
    const rate = 0.025; // 2.5%
    const contribution = grossPay * rate;
    
    // Bankers rounding to 2 decimal places
    return Math.round(contribution * 100) / 100;
  }
  
  // Employer NHT Contribution: 3% of gross pay
  calculateEmployerNHT(grossPay: number): number {
    // OFFICIAL JAMAICAN STATUTORY VALIDATION REQUIRED
    // Current rate: 3% of gross earnings
    // No income cap for employer NHT
    const rate = 0.03; // 3%
    const contribution = grossPay * rate;
    
    // Bankers rounding to 2 decimal places
    return Math.round(contribution * 100) / 100;
  }
  
  // Employer Education Tax Contribution: 3.5% of gross pay
  calculateEmployerEducationTax(grossPay: number): number {
    // OFFICIAL JAMAICAN STATUTORY VALIDATION REQUIRED
    // Current rate: 3.5% of gross earnings
    // No income cap for employer Education Tax
    const rate = 0.035; // 3.5%
    const contribution = grossPay * rate;
    
    // Bankers rounding to 2 decimal places
    return Math.round(contribution * 100) / 100;
  }
  
  // Main calculation function
  calculateJamaicanPayroll(input: JamaicanPayrollInput): JamaicanPayrollResult {
    const { grossPay, taxInfo } = input;
    
    // Calculate taxable income (gross pay minus NIS and NHT)
    const nisDeduction = this.calculateNIS(grossPay, taxInfo.isExemptNIS);
    const nhtDeduction = this.calculateNHT(grossPay, taxInfo.isExemptNHT);
    const taxableIncome = grossPay - nisDeduction - nhtDeduction;
    
    // Calculate deductions
    const payeDeduction = this.calculatePAYE(taxableIncome, taxInfo.isExemptPAYE);
    const educationTaxDeduction = this.calculateEducationTax(grossPay, taxInfo.isExemptEducationTax);
    
    // Calculate employer contributions
    const employerNISContribution = this.calculateEmployerNIS(grossPay);
    const employerNHTContribution = this.calculateEmployerNHT(grossPay);
    const employerEducationTaxContribution = this.calculateEmployerEducationTax(grossPay);
    
    // Calculate totals
    const totalEmployeeDeductions = nisDeduction + nhtDeduction + payeDeduction + educationTaxDeduction;
    const totalEmployerContributions = employerNISContribution + employerNHTContribution + employerEducationTaxContribution;
    const netPay = grossPay - totalEmployeeDeductions;
    
    return {
      // Jamaican deductions
      nisDeduction,
      nhtDeduction,
      payeDeduction,
      educationTaxDeduction,
      
      // Employer contributions
      employerNISContribution,
      employerNHTContribution,
      employerEducationTaxContribution,
      
      // Totals
      totalEmployeeDeductions,
      totalEmployerContributions,
      netPay,
      
      // Metadata
      currency: 'JMD',
      calculationVersion: 'jamaican_v1.0_phase1b',
      
      // Preserve US fields (set to 0 for compatibility)
      federalTax: 0,
      stateTax: 0,
      socialSecurity: 0,
      medicare: 0
    };
  }
  
  // Validate calculation input
  validateInput(input: JamaicanPayrollInput): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // Validate gross pay
    if (typeof input.grossPay !== 'number' || input.grossPay < 0) {
      errors.push('Gross pay must be a positive number');
    }
    
    // Validate employee ID
    if (!input.employeeId || typeof input.employeeId !== 'string') {
      errors.push('Employee ID is required');
    }
    
    // Validate company ID
    if (!input.companyId || typeof input.companyId !== 'string') {
      errors.push('Company ID is required');
    }
    
    // Validate payroll frequency
    if (!['weekly', 'fortnightly', 'monthly'].includes(input.payrollFrequency)) {
      errors.push('Payroll frequency must be weekly, fortnightly, or monthly');
    }
    
    // Validate tax info
    if (!input.taxInfo || typeof input.taxInfo !== 'object') {
      errors.push('Tax information is required');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
  
  // Get calculation summary for logging
  getCalculationSummary(input: JamaicanPayrollInput, result: JamaicanPayrollResult): string {
    return `Jamaican Payroll Calculation Summary:
Employee: ${input.employeeId}
Gross Pay: ${formatJMD(input.grossPay)}
NIS Deduction: ${formatJMD(result.nisDeduction)}
NHT Deduction: ${formatJMD(result.nhtDeduction)}
PAYE Deduction: ${formatJMD(result.payeDeduction)}
Education Tax Deduction: ${formatJMD(result.educationTaxDeduction)}
Total Employee Deductions: ${formatJMD(result.totalEmployeeDeductions)}
Employer NIS: ${formatJMD(result.employerNISContribution)}
Employer NHT: ${formatJMD(result.employerNHTContribution)}
Employer Education Tax: ${formatJMD(result.employerEducationTaxContribution)}
Total Employer Contributions: ${formatJMD(result.totalEmployerContributions)}
Net Pay: ${formatJMD(result.netPay)}
Calculation Version: ${result.calculationVersion}`;
  }
}

// Export singleton instance for easy access
export const jamaicanPayrollCalculator = new JamaicanPayrollCalculator();


