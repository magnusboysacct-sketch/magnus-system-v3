-- Migration: Add Jamaican Payroll Foundation
-- Version: 1.0
-- Description: Add Jamaican statutory deduction fields and configuration tables
-- Author: Magnus System v3
-- Date: 2025-05-10

-- Add Jamaican deduction fields to payroll_entries table
ALTER TABLE payroll_entries 
ADD COLUMN IF NOT EXISTS nis_deduction numeric(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS nht_deduction numeric(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS paye_deduction numeric(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS education_tax_deduction numeric(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS employer_nis_contribution numeric(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS employer_nht_contribution numeric(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS employer_education_tax_contribution numeric(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS payroll_currency text DEFAULT 'JMD',
ADD COLUMN IF NOT EXISTS calculation_version text DEFAULT 'legacy_us_preserved';

-- Add statutory profile fields to worker_tax_info table
ALTER TABLE worker_tax_info
ADD COLUMN IF NOT EXISTS nis_number text,
ADD COLUMN IF NOT EXISTS tax_file_number text,
ADD COLUMN IF NOT EXISTS is_exempt_nis boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS is_exempt_nht boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS is_exempt_education_tax boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS is_exempt_paye boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS statutory_profile_effective_date date DEFAULT CURRENT_DATE;

-- Create payroll configuration table
CREATE TABLE IF NOT EXISTS payroll_configuration (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    payroll_frequency text CHECK (payroll_frequency IN ('weekly', 'fortnightly', 'monthly')),
    base_currency text DEFAULT 'JMD',
    is_jamaican_payroll boolean DEFAULT true,
    calculation_engine_version text DEFAULT 'legacy_us_preserved',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(company_id)
);

-- Create payroll calculation audit table
CREATE TABLE IF NOT EXISTS payroll_calculation_audit (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    payroll_entry_id uuid REFERENCES payroll_entries(id) ON DELETE SET NULL,
    old_calculation_method text,
    new_calculation_method text,
    old_values jsonb,
    new_values jsonb,
    changed_by uuid REFERENCES auth.users(id),
    changed_at timestamptz DEFAULT now(),
    change_reason text,
    created_at timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_payroll_entries_company_currency ON payroll_entries(company_id, payroll_currency);
CREATE INDEX IF NOT EXISTS idx_payroll_entries_calculation_version ON payroll_entries(calculation_version);
CREATE INDEX IF NOT EXISTS idx_worker_tax_info_nis_number ON worker_tax_info(nis_number);
CREATE INDEX IF NOT EXISTS idx_worker_tax_info_tax_file_number ON worker_tax_info(tax_file_number);
CREATE INDEX IF NOT EXISTS idx_worker_tax_info_statutory_profile_date ON worker_tax_info(statutory_profile_effective_date);
CREATE INDEX IF NOT EXISTS idx_payroll_audit_company_changed_at ON payroll_calculation_audit(company_id, changed_at);

-- Enable RLS on new tables
ALTER TABLE payroll_configuration ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_calculation_audit ENABLE ROW LEVEL SECURITY;

-- RLS Policies for payroll_configuration
DROP POLICY IF EXISTS "Users can view own company payroll configuration" ON payroll_configuration;
DROP POLICY IF EXISTS "Users can insert own company payroll configuration" ON payroll_configuration;
DROP POLICY IF EXISTS "Users can update own company payroll configuration" ON payroll_configuration;
DROP POLICY IF EXISTS "Users can delete own company payroll configuration" ON payroll_configuration;

CREATE POLICY "Users can view own company payroll configuration" ON payroll_configuration
    FOR SELECT USING (company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid()));

CREATE POLICY "Users can insert own company payroll configuration" ON payroll_configuration
    FOR INSERT WITH CHECK (company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update own company payroll configuration" ON payroll_configuration
    FOR UPDATE USING (company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid()));

CREATE POLICY "Users can delete own company payroll configuration" ON payroll_configuration
    FOR DELETE USING (company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid()));

-- RLS Policies for payroll_calculation_audit
DROP POLICY IF EXISTS "Users can view own company payroll audit" ON payroll_calculation_audit;
DROP POLICY IF EXISTS "Users can insert own company payroll audit" ON payroll_calculation_audit;

CREATE POLICY "Users can view own company payroll audit" ON payroll_calculation_audit
    FOR SELECT USING (company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid()));

CREATE POLICY "Users can insert own company payroll audit" ON payroll_calculation_audit
    FOR INSERT WITH CHECK (company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid()));

-- Insert default Jamaican payroll configuration for existing companies
INSERT INTO payroll_configuration (company_id, payroll_frequency, base_currency, is_jamaican_payroll, calculation_engine_version)
SELECT 
    id, 
    'monthly', 
    'JMD', 
    true, 
    'legacy_us_preserved'
FROM companies
WHERE id NOT IN (SELECT company_id FROM payroll_configuration);

-- Create updated_at trigger for payroll_configuration
CREATE OR REPLACE FUNCTION update_payroll_configuration_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER payroll_configuration_updated_at
    BEFORE UPDATE ON payroll_configuration
    FOR EACH ROW EXECUTE FUNCTION update_payroll_configuration_updated_at();

-- Add comments to document new fields
COMMENT ON COLUMN payroll_entries.nis_deduction IS 'National Insurance Scheme employee deduction (2.75% of gross pay)';
COMMENT ON COLUMN payroll_entries.nht_deduction IS 'National Housing Trust employee deduction (2% of gross pay, capped at J$125,000 monthly)';
COMMENT ON COLUMN payroll_entries.paye_deduction IS 'Pay As You Earn income tax deduction (progressive rates)';
COMMENT ON COLUMN payroll_entries.education_tax_deduction IS 'Education tax deduction (2.25% of gross pay)';
COMMENT ON COLUMN payroll_entries.employer_nis_contribution IS 'Employer NIS contribution (2.5% of gross pay)';
COMMENT ON COLUMN payroll_entries.employer_nht_contribution IS 'Employer NHT contribution (3% of gross pay)';
COMMENT ON COLUMN payroll_entries.employer_education_tax_contribution IS 'Employer education tax contribution (3.5% of gross pay)';
COMMENT ON COLUMN payroll_entries.payroll_currency IS 'Currency used for payroll calculations (JMD for Jamaican payroll)';
COMMENT ON COLUMN payroll_entries.calculation_version IS 'Version of calculation engine used for this payroll entry';

COMMENT ON COLUMN worker_tax_info.nis_number IS 'National Insurance Scheme registration number';
COMMENT ON COLUMN worker_tax_info.tax_file_number IS 'Tax Registration Number (TRN)';
COMMENT ON COLUMN worker_tax_info.is_exempt_nis IS 'Employee is exempt from NIS deductions';
COMMENT ON COLUMN worker_tax_info.is_exempt_nht IS 'Employee is exempt from NHT deductions';
COMMENT ON COLUMN worker_tax_info.is_exempt_education_tax IS 'Employee is exempt from education tax deductions';
COMMENT ON COLUMN worker_tax_info.is_exempt_paye IS 'Employee is exempt from PAYE income tax';
COMMENT ON COLUMN worker_tax_info.statutory_profile_effective_date IS 'Effective date of statutory profile configuration';
