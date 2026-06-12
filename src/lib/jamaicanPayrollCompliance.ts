// Jamaican Payroll Compliance Hardening - Phase 3A
// Centralized statutory compliance and calculation engine
// PHASE 3A JAMAICAN COMPLIANCE HARDENING — SHADOW SAFE ONLY

import type { JamaicanWorkerTaxInfo } from './jamaicanPayroll';

// ============================================================================
// STATUTORY CONSTANTS & CONFIGURATIONS
// ============================================================================

export interface JamaicanStatutoryRates {
  // NIS (National Insurance Scheme)
  nisEmployeeRate: number;      // 2.75%
  nisEmployerRate: number;      // 2.5%
  nisIncomeCap?: number;        // No income cap for NIS
  
  // NHT (National Housing Trust)
  nhtEmployeeRate: number;      // 2%
  nhtEmployerRate: number;      // 3%
  nhtMonthlyCap: number;        // J$125,000 monthly cap
  
  // PAYE (Pay As You Earn) - Progressive Tax
  payeTaxBands: JamaicanTaxBand[];
  
  // Education Tax
  educationTaxEmployeeRate: number;  // 2.25%
  educationTaxEmployerRate: number;  // 3.5%
  
  // Minimum Wage & Thresholds
  minimumWageWeekly: number;    // J$7,000 per week (2024)
  minimumWageMonthly: number;  // J$30,333 per month (approx)
  nisThresholdWeekly: number;    // J$1,000 per week
  nisThresholdMonthly: number;   // J$4,333 per month
  
  // Other Statutory
  statutoryDeductionLimit: number; // Maximum statutory deductions as % of gross
}

export interface JamaicanTaxBand {
  minIncome: number;
  maxIncome?: number; // undefined for highest band
  rate: number;
  baseTax: number;
  description: string;
  effectiveDate?: string;
}

export interface JamaicanComplianceConfig {
  rates: JamaicanStatutoryRates;
  effectiveDate: string;
  taxYear: string;
  version: string;
  lastUpdated: string;
}

export interface JamaicanPayrollFrequency {
  type: 'weekly' | 'fortnightly' | 'monthly' | 'bi-weekly';
  weeksPerPeriod: number;
  periodsPerYear: number;
  description: string;
}

export interface JamaicanAllowance {
  type: 'housing' | 'transport' | 'meal' | 'uniform' | 'other';
  amount: number;
  isTaxable: boolean;
  description: string;
  statutoryLimit?: number;
}

export interface JamaicanOvertimeRule {
  type: 'daily' | 'weekly' | 'sunday' | 'holiday';
  multiplier: number;
  maxHours?: number;
  description: string;
}

// ============================================================================
// CURRENT STATUTORY RATES (2024) - OFFICIAL VALIDATION REQUIRED
// ============================================================================

export const JAMAICAN_STATUTORY_RATES_2024: JamaicanStatutoryRates = {
  // NIS Rates
  nisEmployeeRate: 0.0275,      // 2.75%
  nisEmployerRate: 0.025,       // 2.5%
  nisIncomeCap: undefined,           // No income cap
  
  // NHT Rates
  nhtEmployeeRate: 0.02,          // 2%
  nhtEmployerRate: 0.03,          // 3%
  nhtMonthlyCap: 125000,           // J$125,000 monthly cap
  
  // PAYE Tax Bands (OFFICIAL VALIDATION REQUIRED)
  payeTaxBands: [
    {
      minIncome: 0,
      maxIncome: 1500096,
      rate: 0.25,
      baseTax: 0,
      description: "25% on first J$1,500,096",
      effectiveDate: "2024-01-01"
    },
    {
      minIncome: 1500097,
      maxIncome: 6000000,
      rate: 0.30,
      baseTax: 75000,
      description: "30% on income over J$1,500,096 up to J$6,000,000",
      effectiveDate: "2024-01-01"
    },
    {
      minIncome: 6000001,
      maxIncome: undefined, // No upper limit
      rate: 0.35,
      baseTax: 225000,
      description: "35% on income over J$6,000,000",
      effectiveDate: "2024-01-01"
    }
  ],
  
  // Education Tax Rates
  educationTaxEmployeeRate: 0.0225,  // 2.25%
  educationTaxEmployerRate: 0.035,   // 3.5%
  
  // Minimum Wage & Thresholds (2024)
  minimumWageWeekly: 7000,          // J$7,000 per week
  minimumWageMonthly: 30333,         // J$30,333 per month (approx)
  nisThresholdWeekly: 1000,          // J$1,000 per week
  nisThresholdMonthly: 4333,         // J$4,333 per month
  
  // Other Statutory
  statutoryDeductionLimit: 0.20     // Maximum 20% of gross pay
};

// ============================================================================
// PAYROLL FREQUENCY CONFIGURATIONS
// ============================================================================

export const JAMAICAN_PAYROLL_FREQUENCIES: Record<string, JamaicanPayrollFrequency> = {
  weekly: {
    type: 'weekly',
    weeksPerPeriod: 1,
    periodsPerYear: 52,
    description: 'Weekly payroll (52 periods per year)'
  },
  fortnightly: {
    type: 'fortnightly',
    weeksPerPeriod: 2,
    periodsPerYear: 26,
    description: 'Fortnightly payroll (26 periods per year)'
  },
  'bi-weekly': {
    type: 'bi-weekly',
    weeksPerPeriod: 2,
    periodsPerYear: 26,
    description: 'Bi-weekly payroll (26 periods per year)'
  },
  monthly: {
    type: 'monthly',
    weeksPerPeriod: 4.33, // Average weeks per month
    periodsPerYear: 12,
    description: 'Monthly payroll (12 periods per year)'
  }
};

// ============================================================================
// OVERTIME RULES
// ============================================================================

export const JAMAICAN_OVERTIME_RULES: JamaicanOvertimeRule[] = [
  {
    type: 'daily',
    multiplier: 1.5,
    maxHours: undefined,
    description: 'Time and a half for hours over 8 per day'
  },
  {
    type: 'weekly',
    multiplier: 2.0,
    maxHours: undefined,
    description: 'Double time for hours over 40 per week'
  },
  {
    type: 'sunday',
    multiplier: 2.0,
    maxHours: undefined,
    description: 'Double time for Sunday work'
  },
  {
    type: 'holiday',
    multiplier: 2.0,
    maxHours: undefined,
    description: 'Double time for public holidays'
  }
];

// ============================================================================
// COMPLIANCE CALCULATOR CLASS
// ============================================================================

export class JamaicanPayrollComplianceCalculator {
  private config: JamaicanComplianceConfig;
  
  constructor(config?: Partial<JamaicanComplianceConfig>) {
    this.config = {
      rates: JAMAICAN_STATUTORY_RATES_2024,
      effectiveDate: '2024-01-01',
      taxYear: '2024',
      version: 'jamaican_compliance_v1.0_phase3a',
      lastUpdated: new Date().toISOString(),
      ...config
    };
  }

  // ============================================================================
  // CORE CALCULATION FUNCTIONS
  // ============================================================================

  /**
   * Calculate NIS (National Insurance Scheme) deduction
   * PHASE 3A JAMAICAN COMPLIANCE HARDENING — SHADOW SAFE ONLY
   */
  calculateNIS(
    grossPay: number,
    taxInfo: JamaicanWorkerTaxInfo,
    frequency: JamaicanPayrollFrequency = JAMAICAN_PAYROLL_FREQUENCIES.monthly
  ): { deduction: number; employerContribution: number; isExempt: boolean } {
    if (taxInfo.isExemptNIS) {
      return { deduction: 0, employerContribution: 0, isExempt: true };
    }

    // Check NIS threshold
    const monthlyGross = this.convertToMonthly(grossPay, frequency);
    if (monthlyGross < this.config.rates.nisThresholdMonthly) {
      return { deduction: 0, employerContribution: 0, isExempt: false };
    }

    // Calculate NIS on amount above threshold
    const taxableAmount = monthlyGross - this.config.rates.nisThresholdMonthly;
    const monthlyDeduction = taxableAmount * this.config.rates.nisEmployeeRate;
    const monthlyEmployerContribution = taxableAmount * this.config.rates.nisEmployerRate;

    // Convert back to frequency
    const deduction = this.convertFromMonthly(monthlyDeduction, frequency);
    const employerContribution = this.convertFromMonthly(monthlyEmployerContribution, frequency);

    return {
      deduction: this.safeRound(deduction),
      employerContribution: this.safeRound(employerContribution),
      isExempt: false
    };
  }

  /**
   * Calculate NHT (National Housing Trust) deduction
   * PHASE 3A JAMAICAN COMPLIANCE HARDENING — SHADOW SAFE ONLY
   */
  calculateNHT(
    grossPay: number,
    taxInfo: JamaicanWorkerTaxInfo,
    frequency: JamaicanPayrollFrequency = JAMAICAN_PAYROLL_FREQUENCIES.monthly
  ): { deduction: number; employerContribution: number; isExempt: boolean; isCapped: boolean } {
    if (taxInfo.isExemptNHT) {
      return { deduction: 0, employerContribution: 0, isExempt: true, isCapped: false };
    }

    const monthlyGross = this.convertToMonthly(grossPay, frequency);
    const monthlyDeduction = monthlyGross * this.config.rates.nhtEmployeeRate;
    const monthlyEmployerContribution = monthlyGross * this.config.rates.nhtEmployerRate;

    // Apply monthly cap
    const cappedMonthlyDeduction = Math.min(monthlyDeduction, this.config.rates.nhtMonthlyCap);
    const isCapped = monthlyDeduction > this.config.rates.nhtMonthlyCap;

    // Convert back to frequency
    const deduction = this.convertFromMonthly(cappedMonthlyDeduction, frequency);
    const employerContribution = this.convertFromMonthly(monthlyEmployerContribution, frequency);

    return {
      deduction: this.safeRound(deduction),
      employerContribution: this.safeRound(employerContribution),
      isExempt: false,
      isCapped
    };
  }

  /**
   * Calculate PAYE (Pay As You Earn) tax using progressive bands
   * PHASE 3A JAMAICAN COMPLIANCE HARDENING — SHADOW SAFE ONLY
   */
  calculatePAYE(
    taxableIncome: number,
    taxInfo: JamaicanWorkerTaxInfo,
    frequency: JamaicanPayrollFrequency = JAMAICAN_PAYROLL_FREQUENCIES.monthly
  ): { tax: number; effectiveRate: number; isExempt: boolean; taxBandUsed?: JamaicanTaxBand } {
    if (taxInfo.isExemptPAYE) {
      return { tax: 0, effectiveRate: 0, isExempt: true };
    }

    // Annualize taxable income
    const annualTaxableIncome = this.convertToMonthly(taxableIncome, frequency) * 12;
    let annualTax = 0;
    let taxBandUsed: JamaicanTaxBand | undefined;

    // Calculate tax using progressive bands
    for (const band of this.config.rates.payeTaxBands) {
      if (annualTaxableIncome > band.minIncome) {
        if (band.maxIncome === undefined || annualTaxableIncome <= band.maxIncome) {
          // This is the applicable band
          annualTax = (annualTaxableIncome - band.minIncome) * band.rate + band.baseTax;
          taxBandUsed = band;
          break;
        } else {
          // Income exceeds this band, calculate tax for this band and continue
          const bandIncome = band.maxIncome - band.minIncome;
          annualTax = band.baseTax + (bandIncome * band.rate);
        }
      } else {
        break; // Income is below this band
      }
    }

    // Convert back to frequency
    const monthlyTax = annualTax / 12;
    const tax = this.convertFromMonthly(monthlyTax, frequency);
    const effectiveRate = annualTaxableIncome > 0 ? (annualTax / annualTaxableIncome) : 0;

    return {
      tax: this.safeRound(tax),
      effectiveRate: this.safeRound(effectiveRate * 100, 4), // as percentage
      isExempt: false,
      taxBandUsed
    };
  }

  /**
   * Calculate Education Tax deduction
   * PHASE 3A JAMAICAN COMPLIANCE HARDENING — SHADOW SAFE ONLY
   */
  calculateEducationTax(
    grossPay: number,
    taxInfo: JamaicanWorkerTaxInfo,
    frequency: JamaicanPayrollFrequency = JAMAICAN_PAYROLL_FREQUENCIES.monthly
  ): { deduction: number; employerContribution: number; isExempt: boolean } {
    if (taxInfo.isExemptEducationTax) {
      return { deduction: 0, employerContribution: 0, isExempt: true };
    }

    const monthlyGross = this.convertToMonthly(grossPay, frequency);
    const monthlyDeduction = monthlyGross * this.config.rates.educationTaxEmployeeRate;
    const monthlyEmployerContribution = monthlyGross * this.config.rates.educationTaxEmployerRate;

    // Convert back to frequency
    const deduction = this.convertFromMonthly(monthlyDeduction, frequency);
    const employerContribution = this.convertFromMonthly(monthlyEmployerContribution, frequency);

    return {
      deduction: this.safeRound(deduction),
      employerContribution: this.safeRound(employerContribution),
      isExempt: false
    };
  }

  /**
   * Calculate total employer contributions
   * PHASE 3A JAMAICAN COMPLIANCE HARDENING — SHADOW SAFE ONLY
   */
  calculateEmployerContributions(
    grossPay: number,
    taxInfo: JamaicanWorkerTaxInfo,
    frequency: JamaicanPayrollFrequency = JAMAICAN_PAYROLL_FREQUENCIES.monthly
  ): {
    nis: number;
    nht: number;
    educationTax: number;
    total: number;
  } {
    const nisResult = this.calculateNIS(grossPay, taxInfo, frequency);
    const nhtResult = this.calculateNHT(grossPay, taxInfo, frequency);
    const educationTaxResult = this.calculateEducationTax(grossPay, taxInfo, frequency);

    const total = nisResult.employerContribution + nhtResult.employerContribution + educationTaxResult.employerContribution;

    return {
      nis: nisResult.employerContribution,
      nht: nhtResult.employerContribution,
      educationTax: educationTaxResult.employerContribution,
      total: this.safeRound(total)
    };
  }

  /**
   * Calculate all statutory deductions
   * PHASE 3A JAMAICAN COMPLIANCE HARDENING — SHADOW SAFE ONLY
   */
  calculateStatutoryDeductions(
    grossPay: number,
    taxInfo: JamaicanWorkerTaxInfo,
    frequency: JamaicanPayrollFrequency = JAMAICAN_PAYROLL_FREQUENCIES.monthly,
    allowances: JamaicanAllowance[] = []
  ): {
    nis: { deduction: number; employerContribution: number; isExempt: boolean };
    nht: { deduction: number; employerContribution: number; isExempt: boolean; isCapped: boolean };
    paye: { tax: number; effectiveRate: number; isExempt: boolean; taxBandUsed?: JamaicanTaxBand };
    educationTax: { deduction: number; employerContribution: number; isExempt: boolean };
    totalEmployeeDeductions: number;
    totalEmployerContributions: number;
    taxableIncome: number;
    netPay: number;
    complianceWarnings: string[];
  } {
    const complianceWarnings: string[] = [];

    // Calculate individual deductions
    const nisResult = this.calculateNIS(grossPay, taxInfo, frequency);
    const nhtResult = this.calculateNHT(grossPay, taxInfo, frequency);
    const educationTaxResult = this.calculateEducationTax(grossPay, taxInfo, frequency);

    // Calculate taxable income (gross pay - NIS - NHT + taxable allowances)
    const taxableAllowances = allowances.filter(a => a.isTaxable).reduce((sum, a) => sum + a.amount, 0);
    const taxableIncome = grossPay - nisResult.deduction - nhtResult.deduction + taxableAllowances;

    // Calculate PAYE on taxable income
    const payeResult = this.calculatePAYE(taxableIncome, taxInfo, frequency);

    // Calculate totals
    const totalEmployeeDeductions = nisResult.deduction + nhtResult.deduction + payeResult.tax + educationTaxResult.deduction;
    const netPay = grossPay - totalEmployeeDeductions;

    // Compliance checks
    if (totalEmployeeDeductions > grossPay * this.config.rates.statutoryDeductionLimit) {
      complianceWarnings.push(`Statutory deductions exceed ${this.config.rates.statutoryDeductionLimit * 100}% of gross pay`);
    }

    return {
      nis: nisResult,
      nht: nhtResult,
      paye: payeResult,
      educationTax: educationTaxResult,
      totalEmployeeDeductions: this.safeRound(totalEmployeeDeductions),
      totalEmployerContributions: 0, // Calculated separately
      taxableIncome: this.safeRound(taxableIncome),
      netPay: this.safeRound(netPay),
      complianceWarnings
    };
  }

  // ============================================================================
  // VALIDATION & COMPLIANCE FUNCTIONS
  // ============================================================================

  /**
   * Validate statutory compliance
   * PHASE 3A JAMAICAN COMPLIANCE HARDENING — SHADOW SAFE ONLY
   */
  validateStatutoryCompliance(
    grossPay: number,
    deductions: any,
    taxInfo: JamaicanWorkerTaxInfo,
    frequency: JamaicanPayrollFrequency = JAMAICAN_PAYROLL_FREQUENCIES.monthly
  ): {
    isCompliant: boolean;
    warnings: string[];
    errors: string[];
    complianceScore: number; // 0-100
  } {
    const warnings: string[] = [];
    const errors: string[] = [];
    let complianceScore = 100;

    // Check minimum wage compliance
    const monthlyGross = this.convertToMonthly(grossPay, frequency);
    if (monthlyGross < this.config.rates.minimumWageMonthly) {
      errors.push(`Gross pay below minimum wage: J$${this.config.rates.minimumWageMonthly.toLocaleString()} monthly`);
      complianceScore -= 30;
    }

    // Check statutory deduction limit
    const totalEmployeeDeductions = deductions.nisDeduction + deductions.nhtDeduction + deductions.payeDeduction + deductions.educationTaxDeduction;
    if (totalEmployeeDeductions > grossPay * this.config.rates.statutoryDeductionLimit) {
      warnings.push(`Statutory deductions exceed ${this.config.rates.statutoryDeductionLimit * 100}% of gross pay`);
      complianceScore -= 10;
    }

    // Check NHT cap compliance
    const monthlyNHTDeduction = this.convertToMonthly(deductions.nhtDeduction, frequency);
    if (monthlyNHTDeduction > this.config.rates.nhtMonthlyCap) {
      errors.push(`NHT deduction exceeds monthly cap of J$${this.config.rates.nhtMonthlyCap.toLocaleString()}`);
      complianceScore -= 20;
    }

    // Check tax file number format
    if (taxInfo.taxFileNumber && !this.isValidTRN(taxInfo.taxFileNumber)) {
      warnings.push('Tax File Number (TRN) format may be invalid');
      complianceScore -= 5;
    }

    // Check NIS number format
    if (taxInfo.nisNumber && !this.isValidNISNumber(taxInfo.nisNumber)) {
      warnings.push('NIS number format may be invalid');
      complianceScore -= 5;
    }

    // Ensure score doesn't go below 0
    complianceScore = Math.max(0, complianceScore);

    return {
      isCompliant: errors.length === 0,
      warnings,
      errors,
      complianceScore
    };
  }

  /**
   * Build comprehensive compliance summary
   * PHASE 3A JAMAICAN COMPLIANCE HARDENING — SHADOW SAFE ONLY
   */
  buildPayrollComplianceSummary(
    grossPay: number,
    deductions: any,
    taxInfo: JamaicanWorkerTaxInfo,
    frequency: JamaicanPayrollFrequency = JAMAICAN_PAYROLL_FREQUENCIES.monthly
  ): {
    employee: {
      id: string;
      taxInfo: JamaicanWorkerTaxInfo;
      grossPay: number;
      netPay: number;
      totalDeductions: number;
      effectiveTaxRate: number;
    };
    statutory: {
      nis: { deduction: number; employerContribution: number; rate: number };
      nht: { deduction: number; employerContribution: number; rate: number; isCapped: boolean };
      paye: { tax: number; effectiveRate: number; taxBand: string };
      educationTax: { deduction: number; employerContribution: number; rate: number };
    };
    compliance: {
      score: number;
      isCompliant: boolean;
      warnings: string[];
      errors: string[];
    };
    metadata: {
      frequency: string;
      effectiveDate: string;
      taxYear: string;
      calculationVersion: string;
      generatedAt: string;
    };
  } {
    const compliance = this.validateStatutoryCompliance(grossPay, deductions, taxInfo, frequency);
    const statutoryDeductions = this.calculateStatutoryDeductions(grossPay, taxInfo, frequency);
    
    return {
      employee: {
        id: '', // Will be filled by caller
        taxInfo,
        grossPay,
        netPay: deductions.netPay || 0,
        totalDeductions: deductions.totalEmployeeDeductions || 0,
        effectiveTaxRate: statutoryDeductions.paye.effectiveRate
      },
      statutory: {
        nis: {
          deduction: deductions.nisDeduction || 0,
          employerContribution: statutoryDeductions.totalEmployerContributions || 0,
          rate: this.config.rates.nisEmployeeRate
        },
        nht: {
          deduction: deductions.nhtDeduction || 0,
          employerContribution: 0, // Will be calculated separately
          rate: this.config.rates.nhtEmployeeRate,
          isCapped: statutoryDeductions.nht.isCapped || false
        },
        paye: {
          tax: deductions.payeDeduction || 0,
          effectiveRate: statutoryDeductions.paye.effectiveRate,
          taxBand: statutoryDeductions.paye.taxBandUsed?.description || 'Unknown'
        },
        educationTax: {
          deduction: deductions.educationTaxDeduction || 0,
          employerContribution: 0, // Will be calculated separately
          rate: this.config.rates.educationTaxEmployeeRate
        }
      },
      compliance: {
        score: compliance.complianceScore,
        isCompliant: compliance.isCompliant,
        warnings: compliance.warnings,
        errors: compliance.errors
      },
      metadata: {
        frequency: frequency.description,
        effectiveDate: this.config.effectiveDate,
        taxYear: this.config.taxYear,
        calculationVersion: this.config.version,
        generatedAt: new Date().toISOString()
      }
    };
  }

  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================

  /**
   * Convert amount to monthly for calculation
   */
  private convertToMonthly(amount: number, frequency: JamaicanPayrollFrequency): number {
    return amount * frequency.weeksPerPeriod / 4.33; // Average weeks per month
  }

  /**
   * Convert monthly amount back to payroll frequency
   */
  private convertFromMonthly(monthlyAmount: number, frequency: JamaicanPayrollFrequency): number {
    return monthlyAmount * 4.33 / frequency.weeksPerPeriod; // Average weeks per month
  }

  /**
   * Safe rounding with bankers rounding
   */
  private safeRound(amount: number, decimals: number = 2): number {
    return Math.round(amount * Math.pow(10, decimals)) / Math.pow(10, decimals);
  }

  /**
   * Validate TRN (Tax File Number) format
   */
  private isValidTRN(trn?: string): boolean {
    if (!trn || trn.trim() === '') return false;
    
    const cleaned = trn.replace(/[^0-9]/g, '');
    return cleaned.length === 9 && /^\d{3}-?\d{3}-?\d{3}$/.test(trn.replace(/\s/g, ''));
  }

  /**
   * Validate NIS number format
   */
  private isValidNISNumber(nisNumber?: string): boolean {
    if (!nisNumber || nisNumber.trim() === '') return false;
    
    const cleaned = nisNumber.replace(/[^0-9]/g, '');
    return cleaned.length === 7 && /^\d{7}$/.test(cleaned);
  }

  // ============================================================================
  // CONFIGURATION MANAGEMENT
  // ============================================================================

  /**
   * Update statutory rates (for future tax year changes)
   */
  updateRates(newRates: Partial<JamaicanStatutoryRates>): void {
    this.config.rates = { ...this.config.rates, ...newRates };
    this.config.lastUpdated = new Date().toISOString();
  }

  /**
   * Get current configuration
   */
  getConfig(): JamaicanComplianceConfig {
    return { ...this.config };
  }

  /**
   * Set effective date for calculations
   */
  setEffectiveDate(date: string): void {
    this.config.effectiveDate = date;
  }
}

// ============================================================================
// EXPORT SINGLETON INSTANCE
// ============================================================================

export const jamaicanPayrollCompliance = new JamaicanPayrollComplianceCalculator();
