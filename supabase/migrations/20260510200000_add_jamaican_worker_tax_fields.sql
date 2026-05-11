-- Add Jamaican Worker Tax Fields to worker_tax_info Table
-- Phase 2B Step 1 - Database Extension Only
-- PHASE 2B DATABASE EXTENSION ONLY — NOT ACTIVE PAYROLL

-- Migration Purpose:
-- 1. Extend existing worker_tax_info table with Jamaican statutory fields
-- 2. Maintain full backward compatibility with existing US tax fields
-- 3. Enable safe Jamaican payroll onboarding without breaking existing functionality
-- 4. Add payroll country tracking for dual-system support

-- 1. Changes
--    - Add Jamaican statutory fields to worker_tax_info table
--    - Add payroll country tracking
--    - Add Jamaican payroll enablement flag
--    - Preserve all existing US tax fields
--    - Use safe column addition with IF NOT EXISTS

-- 2. Safety Considerations
--    - All new columns are optional (no NOT NULL constraints)
--    - Existing US tax fields remain unchanged
--    - Default values ensure backward compatibility
--    - No RLS policy changes (existing policies cover new fields)

-- =====================================================
-- ADD JAMAICAN STATUTORY FIELDS TO WORKER_TAX_INFO
-- =====================================================

-- Add NIS (National Insurance Scheme) number
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'worker_tax_info' AND column_name = 'nis_number'
  ) THEN
    ALTER TABLE worker_tax_info 
    ADD COLUMN nis_number text;
    
    COMMENT ON COLUMN worker_tax_info.nis_number IS 'Jamaican National Insurance Scheme number for statutory deductions';
  END IF;
END $$;

-- Add Tax File Number (TRN)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'worker_tax_info' AND column_name = 'tax_file_number'
  ) THEN
    ALTER TABLE worker_tax_info 
    ADD COLUMN tax_file_number text;
    
    COMMENT ON COLUMN worker_tax_info.tax_file_number IS 'Jamaican Tax Registration Number (TRN) for PAYE calculations';
  END IF;
END $$;

-- Add Temporary Reference Number (for workers without TRN)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'worker_tax_info' AND column_name = 'trn'
  ) THEN
    ALTER TABLE worker_tax_info 
    ADD COLUMN trn text;
    
    COMMENT ON COLUMN worker_tax_info.trn IS 'Jamaican Temporary Reference Number for workers without full TRN';
  END IF;
END $$;

-- Add NIS exemption flag
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'worker_tax_info' AND column_name = 'is_exempt_nis'
  ) THEN
    ALTER TABLE worker_tax_info 
    ADD COLUMN is_exempt_nis boolean DEFAULT false;
    
    COMMENT ON COLUMN worker_tax_info.is_exempt_nis IS 'Exemption from Jamaican NIS statutory deductions';
  END IF;
END $$;

-- Add NHT (National Housing Trust) exemption flag
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'worker_tax_info' AND column_name = 'is_exempt_nht'
  ) THEN
    ALTER TABLE worker_tax_info 
    ADD COLUMN is_exempt_nht boolean DEFAULT false;
    
    COMMENT ON COLUMN worker_tax_info.is_exempt_nht IS 'Exemption from Jamaican NHT statutory contributions';
  END IF;
END $$;

-- Add Education Tax exemption flag
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'worker_tax_info' AND column_name = 'is_exempt_education_tax'
  ) THEN
    ALTER TABLE worker_tax_info 
    ADD COLUMN is_exempt_education_tax boolean DEFAULT false;
    
    COMMENT ON COLUMN worker_tax_info.is_exempt_education_tax IS 'Exemption from Jamaican Education Tax deductions';
  END IF;
END $$;

-- Add PAYE (Pay As You Earn) exemption flag
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'worker_tax_info' AND column_name = 'is_exempt_paye'
  ) THEN
    ALTER TABLE worker_tax_info 
    ADD COLUMN is_exempt_paye boolean DEFAULT false;
    
    COMMENT ON COLUMN worker_tax_info.is_exempt_paye IS 'Exemption from Jamaican PAYE income tax withholding';
  END IF;
END $$;

-- Add payroll country tracking
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'worker_tax_info' AND column_name = 'payroll_country'
  ) THEN
    ALTER TABLE worker_tax_info 
    ADD COLUMN payroll_country text DEFAULT 'US';
    
    COMMENT ON COLUMN worker_tax_info.payroll_country IS 'Payroll system country (US for current system, JM for Jamaican system)';
  END IF;
END $$;

-- Add Jamaican payroll enablement flag
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'worker_tax_info' AND column_name = 'jamaican_payroll_enabled'
  ) THEN
    ALTER TABLE worker_tax_info 
    ADD COLUMN jamaican_payroll_enabled boolean DEFAULT false;
    
    COMMENT ON COLUMN worker_tax_info.jamaican_payroll_enabled IS 'Flag to enable Jamaican payroll calculations for this worker';
  END IF;
END $$;

-- Add statutory notes for Jamaican compliance
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'worker_tax_info' AND column_name = 'statutory_notes'
  ) THEN
    ALTER TABLE worker_tax_info 
    ADD COLUMN statutory_notes text;
    
    COMMENT ON COLUMN worker_tax_info.statutory_notes IS 'Notes regarding Jamaican statutory compliance and exemptions';
  END IF;
END $$;

-- =====================================================
-- CREATE INDEXES FOR PERFORMANCE
-- =====================================================

-- Index for Jamaican statutory queries
CREATE INDEX IF NOT EXISTS idx_worker_tax_info_nis_number 
ON worker_tax_info(nis_number) WHERE nis_number IS NOT NULL;

-- Index for tax file number queries
CREATE INDEX IF NOT EXISTS idx_worker_tax_info_tax_file_number 
ON worker_tax_info(tax_file_number) WHERE tax_file_number IS NOT NULL;

-- Index for payroll country filtering
CREATE INDEX IF NOT EXISTS idx_worker_tax_info_payroll_country 
ON worker_tax_info(payroll_country);

-- Index for Jamaican payroll enablement
CREATE INDEX IF NOT EXISTS idx_worker_tax_info_jamaican_enabled 
ON worker_tax_info(jamaican_payroll_enabled) WHERE jamaican_payroll_enabled = true;

-- =====================================================
-- BACKWARD COMPATIBILITY VERIFICATION
-- =====================================================

-- Ensure existing US tax fields are preserved
DO $$
BEGIN
  -- Verify existing US tax columns still exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'worker_tax_info' AND column_name = 'filing_status'
  ) THEN
    RAISE EXCEPTION 'US tax field filing_status missing - migration error';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'worker_tax_info' AND column_name = 'federal_allowances'
  ) THEN
    RAISE EXCEPTION 'US tax field federal_allowances missing - migration error';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'worker_tax_info' AND column_name = 'additional_federal_withholding'
  ) THEN
    RAISE EXCEPTION 'US tax field additional_federal_withholding missing - migration error';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'worker_tax_info' AND column_name = 'is_exempt_federal'
  ) THEN
    RAISE EXCEPTION 'US tax field is_exempt_federal missing - migration error';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'worker_tax_info' AND column_name = 'is_exempt_fica'
  ) THEN
    RAISE EXCEPTION 'US tax field is_exempt_fica missing - migration error';
  END IF;
END $$;

-- =====================================================
-- MIGRATION SUMMARY
-- =====================================================

-- New Jamaican Fields Added:
-- - nis_number: text (Jamaican NIS number)
-- - tax_file_number: text (Jamaican TRN)
-- - trn: text (Temporary reference number)
-- - is_exempt_nis: boolean (NIS exemption flag)
-- - is_exempt_nht: boolean (NHT exemption flag)
-- - is_exempt_education_tax: boolean (Education Tax exemption flag)
-- - is_exempt_paye: boolean (PAYE exemption flag)
-- - payroll_country: text (Payroll system country, default 'US')
-- - jamaican_payroll_enabled: boolean (Jamaican payroll enablement)
-- - statutory_notes: text (Compliance notes)

-- Existing US Fields Preserved:
-- - filing_status: text (US filing status)
-- - federal_allowances: integer (US federal allowances)
-- - additional_federal_withholding: numeric (US additional withholding)
-- - state_allowances: integer (US state allowances)
-- - additional_state_withholding: numeric (US state withholding)
-- - health_insurance: numeric (US health insurance)
-- - retirement_401k_percent: numeric (US 401k percentage)
-- - retirement_401k_fixed: numeric (US 401k fixed)
-- - is_exempt_federal: boolean (US federal exemption)
-- - is_exempt_state: boolean (US state exemption)
-- - is_exempt_fica: boolean (US FICA exemption)

-- Safety Features:
-- - All new columns are optional (no NOT NULL constraints)
-- - Sensible defaults for backward compatibility
-- - Existing RLS policies automatically cover new fields
-- - Performance indexes for Jamaican field queries
-- - Verification of existing US field preservation

-- Migration Status: SAFE - Backward Compatible
-- Impact: Extends worker_tax_info for Jamaican statutory onboarding
-- Next Steps: Backend type extensions, then admin UI
