-- Payroll Activation Infrastructure - Phase 2D-1
-- Database foundation for controlled Jamaican payroll activation
-- PHASE 2D-1 ACTIVATION INFRASTRUCTURE ONLY — NOT ACTIVE PAYROLL

-- Company-level activation flags
CREATE TABLE IF NOT EXISTS payroll_activation_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  jamaican_payroll_enabled boolean DEFAULT false,
  pilot_mode_enabled boolean DEFAULT false,
  dual_run_mode boolean DEFAULT false,
  auto_rollback_enabled boolean DEFAULT true,
  rollback_threshold_hours integer DEFAULT 24,
  require_governance_approval boolean DEFAULT true,
  min_readiness_score numeric DEFAULT 95.0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Payroll period-specific activation flags
CREATE TABLE IF NOT EXISTS payroll_period_activation_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  payroll_period_id uuid NOT NULL REFERENCES payroll_periods(id) ON DELETE CASCADE,
  activation_engine text NOT NULL CHECK (activation_engine IN ('us', 'jamaican', 'pilot_jamaican', 'dual_run')),
  activation_mode text NOT NULL CHECK (activation_mode IN ('full', 'pilot_group', 'comparison_only')),
  validation_required boolean DEFAULT true,
  rollback_enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  activated_by uuid REFERENCES auth.users(id),
  activated_at timestamptz,
  rolled_back_at timestamptz,
  notes text
);

-- Execution version tracking for rollback support
CREATE TABLE IF NOT EXISTS payroll_execution_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  payroll_period_id uuid NOT NULL REFERENCES payroll_periods(id) ON DELETE CASCADE,
  execution_engine text NOT NULL,
  version_number integer NOT NULL,
  calculation_version text NOT NULL,
  is_rollback_version boolean DEFAULT false,
  rollback_from_version_id uuid REFERENCES payroll_execution_versions(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id)
);

-- Archive table for payroll entry history
CREATE TABLE IF NOT EXISTS payroll_entries_archive (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  payroll_period_id uuid NOT NULL REFERENCES payroll_periods(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  execution_engine text NOT NULL,
  
  -- All payroll entry fields for archival
  regular_hours numeric NOT NULL DEFAULT 0,
  overtime_hours numeric NOT NULL DEFAULT 0,
  regular_pay numeric NOT NULL DEFAULT 0,
  overtime_pay numeric NOT NULL DEFAULT 0,
  gross_pay numeric NOT NULL DEFAULT 0,
  federal_tax numeric NOT NULL DEFAULT 0,
  state_tax numeric NOT NULL DEFAULT 0,
  social_security numeric NOT NULL DEFAULT 0,
  medicare numeric NOT NULL DEFAULT 0,
  health_insurance numeric NOT NULL DEFAULT 0,
  retirement_401k numeric NOT NULL DEFAULT 0,
  other_deductions numeric NOT NULL DEFAULT 0,
  total_deductions numeric NOT NULL DEFAULT 0,
  net_pay numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled')),
  
  -- Shadow calculation fields for Jamaican comparison
  jamaican_shadow_calculation jsonb,
  jamaican_shadow_net_pay numeric,
  jamaican_shadow_deductions jsonb,
  jamaican_shadow_version text,
  
  -- Validation fields
  jamaican_validation_status text,
  jamaican_validation_warnings jsonb,
  jamaican_validation_differences jsonb,
  jamaican_validation_version text,
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  processed_at timestamptz,
  processed_by uuid REFERENCES auth.users(id)
);

-- Pilot group management for worker-level activation
CREATE TABLE IF NOT EXISTS payroll_activation_pilot_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  group_name text NOT NULL,
  worker_ids uuid[] NOT NULL,
  activation_status text NOT NULL CHECK (activation_status IN ('pending', 'active', 'paused', 'rolled_back')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  activated_at timestamptz,
  rolled_back_at timestamptz,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id)
);

-- Worker-level activation flags for granular control
CREATE TABLE IF NOT EXISTS payroll_worker_activation_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  payroll_period_id uuid NOT NULL REFERENCES payroll_periods(id) ON DELETE CASCADE,
  activation_engine text NOT NULL CHECK (activation_engine IN ('us', 'jamaican', 'pilot_jamaican')),
  is_pilot_worker boolean DEFAULT false,
  rollback_version integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_payroll_activation_flags_company_id ON payroll_activation_flags(company_id);
CREATE INDEX IF NOT EXISTS idx_payroll_period_activation_flags_company_period ON payroll_period_activation_flags(company_id, payroll_period_id);
CREATE INDEX IF NOT EXISTS idx_payroll_execution_versions_company_period ON payroll_execution_versions(company_id, payroll_period_id);
CREATE INDEX IF NOT EXISTS idx_payroll_execution_versions_engine ON payroll_execution_versions(execution_engine);
CREATE INDEX IF NOT EXISTS idx_payroll_entries_archive_company_period ON payroll_entries_archive(company_id, payroll_period_id);
CREATE INDEX IF NOT EXISTS idx_payroll_entries_archive_worker ON payroll_entries_archive(worker_id);
CREATE INDEX IF NOT EXISTS idx_payroll_entries_archive_version ON payroll_entries_archive(version_number);
CREATE INDEX IF NOT EXISTS idx_payroll_worker_activation_flags_worker_period ON payroll_worker_activation_flags(worker_id, payroll_period_id);
CREATE INDEX IF NOT EXISTS idx_payroll_pilot_groups_company ON payroll_activation_pilot_groups(company_id);

-- RLS Policies for company data isolation
-- Company activation flags
ALTER TABLE payroll_activation_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Company access to payroll activation flags" ON payroll_activation_flags
  FOR ALL USING (company_id = auth.uid());

-- Period activation flags  
ALTER TABLE payroll_period_activation_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Company access to payroll period activation flags" ON payroll_period_activation_flags
  FOR ALL USING (company_id = auth.uid());

-- Execution versions
ALTER TABLE payroll_execution_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Company access to payroll execution versions" ON payroll_execution_versions
  FOR ALL USING (company_id = auth.uid());

-- Archive entries
ALTER TABLE payroll_entries_archive ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Company access to payroll entries archive" ON payroll_entries_archive
  FOR ALL USING (company_id = auth.uid());

-- Pilot groups
ALTER TABLE payroll_activation_pilot_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Company access to payroll pilot groups" ON payroll_activation_pilot_groups
  FOR ALL USING (company_id = auth.uid());

-- Worker activation flags
ALTER TABLE payroll_worker_activation_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Company access to payroll worker activation flags" ON payroll_worker_activation_flags
  FOR ALL USING (company_id = auth.uid());

-- Triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_payroll_activation_flags_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_payroll_activation_flags_updated_at
  BEFORE UPDATE ON payroll_activation_flags
  FOR EACH ROW EXECUTE FUNCTION update_payroll_activation_flags_updated_at();

CREATE OR REPLACE FUNCTION update_payroll_period_activation_flags_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_payroll_period_activation_flags_updated_at
  BEFORE UPDATE ON payroll_period_activation_flags
  FOR EACH ROW EXECUTE FUNCTION update_payroll_period_activation_flags_updated_at();

CREATE OR REPLACE FUNCTION update_payroll_execution_versions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_payroll_execution_versions_updated_at
  BEFORE UPDATE ON payroll_execution_versions
  FOR EACH ROW EXECUTE FUNCTION update_payroll_execution_versions_updated_at();

CREATE OR REPLACE FUNCTION update_payroll_pilot_groups_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_payroll_pilot_groups_updated_at
  BEFORE UPDATE ON payroll_activation_pilot_groups
  FOR EACH ROW EXECUTE FUNCTION update_payroll_pilot_groups_updated_at();

CREATE OR REPLACE FUNCTION update_payroll_worker_activation_flags_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_payroll_worker_activation_flags_updated_at
  BEFORE UPDATE ON payroll_worker_activation_flags
  FOR EACH ROW EXECUTE FUNCTION update_payroll_worker_activation_flags_updated_at();

-- Archive trigger foundation (inactive until activation)
CREATE OR REPLACE FUNCTION archive_payroll_entries_function()
RETURNS TRIGGER AS $$
BEGIN
  -- This trigger will be activated during payroll execution
  -- For now, it's a placeholder for future archival
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Placeholder trigger (will be activated when needed)
-- CREATE TRIGGER archive_payroll_entries_trigger
--   AFTER INSERT ON payroll_entries
--   FOR EACH ROW EXECUTE FUNCTION archive_payroll_entries_function();

-- Insert default activation flags for existing companies
INSERT INTO payroll_activation_flags (company_id, jamaican_payroll_enabled, pilot_mode_enabled, require_governance_approval)
SELECT 
  id, 
  false, 
  false, 
  true
FROM companies 
WHERE id NOT IN (SELECT company_id FROM payroll_activation_flags);

-- Comments for documentation
COMMENT ON TABLE payroll_activation_flags IS 'Company-level flags for Jamaican payroll activation control and safety settings';
COMMENT ON TABLE payroll_period_activation_flags IS 'Payroll period-specific activation settings and engine selection';
COMMENT ON TABLE payroll_execution_versions IS 'Version tracking for payroll execution with rollback support';
COMMENT ON TABLE payroll_entries_archive IS 'Archive of payroll entries for historical preservation and rollback support';
COMMENT ON TABLE payroll_activation_pilot_groups IS 'Worker groups for pilot testing of Jamaican payroll activation';
COMMENT ON TABLE payroll_worker_activation_flags IS 'Individual worker activation flags for granular control';
