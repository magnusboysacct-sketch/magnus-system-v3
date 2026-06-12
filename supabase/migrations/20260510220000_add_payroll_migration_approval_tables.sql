-- Add Payroll Migration Approval Tables - Phase 2C-3
-- Governance workflow tables for Jamaican payroll migration approval process
-- PHASE 2C-3 GOVERNANCE WORKFLOW ONLY — NOT ACTIVE PAYROLL

-- Create payroll_comparison_reviews table for individual worker reviews
CREATE TABLE IF NOT EXISTS payroll_comparison_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  payroll_period_id uuid NOT NULL REFERENCES payroll_periods(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  
  -- Review state
  review_status text NOT NULL CHECK (review_status IN ('pending', 'reviewed', 'approved', 'rejected', 'requires_investigation')),
  migration_readiness text NOT NULL CHECK (migration_readiness IN ('not_ready', 'ready', 'approved', 'blocked')),
  
  -- Review metadata
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  review_notes text,
  
  -- Comparison data snapshot
  validation_warnings jsonb,
  us_net_pay numeric(10,2),
  jamaican_net_pay numeric(10,2),
  net_pay_difference numeric(10,2),
  difference_percentage numeric(5,2),
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create payroll_migration_approvals table for period-level migration approvals
CREATE TABLE IF NOT EXISTS payroll_migration_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  payroll_period_id uuid NOT NULL REFERENCES payroll_periods(id) ON DELETE CASCADE,
  
  -- Migration approval state
  migration_status text NOT NULL CHECK (migration_status IN ('pending', 'director_approved', 'admin_approved', 'fully_approved', 'rejected')),
  
  -- Role-based approval workflow
  director_approval_id uuid REFERENCES auth.users(id),
  director_approved_at timestamptz,
  director_notes text,
  
  admin_approval_id uuid REFERENCES auth.users(id),
  admin_approved_at timestamptz,
  admin_notes text,
  
  -- Migration metrics
  migration_readiness_score numeric(5,2),
  total_workers integer DEFAULT 0,
  ready_workers integer DEFAULT 0,
  blocked_workers integer DEFAULT 0,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_payroll_comparison_reviews_company_period ON payroll_comparison_reviews(company_id, payroll_period_id);
CREATE INDEX IF NOT EXISTS idx_payroll_comparison_reviews_worker ON payroll_comparison_reviews(worker_id);
CREATE INDEX IF NOT EXISTS idx_payroll_comparison_reviews_status ON payroll_comparison_reviews(review_status);
CREATE INDEX IF NOT EXISTS idx_payroll_comparison_reviews_readiness ON payroll_comparison_reviews(migration_readiness);
CREATE INDEX IF NOT EXISTS idx_payroll_comparison_reviews_reviewed_at ON payroll_comparison_reviews(reviewed_at);

CREATE INDEX IF NOT EXISTS idx_payroll_migration_approvals_company_period ON payroll_migration_approvals(company_id, payroll_period_id);
CREATE INDEX IF NOT EXISTS idx_payroll_migration_approvals_status ON payroll_migration_approvals(migration_status);
CREATE INDEX IF NOT EXISTS idx_payroll_migration_approvals_director_approved_at ON payroll_migration_approvals(director_approved_at);
CREATE INDEX IF NOT EXISTS idx_payroll_migration_approvals_admin_approved_at ON payroll_migration_approvals(admin_approved_at);

-- Add comments to document table purpose
COMMENT ON TABLE payroll_comparison_reviews IS 'Individual worker payroll comparison reviews for Jamaican migration readiness assessment';
COMMENT ON TABLE payroll_migration_approvals IS 'Period-level migration approval workflow for Jamaican payroll system transition';

COMMENT ON COLUMN payroll_comparison_reviews.review_status IS 'Current review status of the worker comparison';
COMMENT ON COLUMN payroll_comparison_reviews.migration_readiness IS 'Migration readiness assessment for this worker';
COMMENT ON COLUMN payroll_comparison_reviews.reviewed_by IS 'User who performed the review';
COMMENT ON COLUMN payroll_comparison_reviews.reviewed_at IS 'Timestamp when the review was completed';
COMMENT ON COLUMN payroll_comparison_reviews.review_notes IS 'Notes and observations from the review process';
COMMENT ON COLUMN payroll_comparison_reviews.validation_warnings IS 'JSON array of validation warnings from shadow calculations';
COMMENT ON COLUMN payroll_comparison_reviews.us_net_pay IS 'US payroll net pay amount for comparison';
COMMENT ON COLUMN payroll_comparison_reviews.jamaican_net_pay IS 'Jamaican shadow calculation net pay amount';
COMMENT ON COLUMN payroll_comparison_reviews.net_pay_difference IS 'Difference between US and Jamaican net pay';
COMMENT ON COLUMN payroll_comparison_reviews.difference_percentage IS 'Percentage difference between US and Jamaican net pay';

COMMENT ON COLUMN payroll_migration_approvals.migration_status IS 'Current approval status for period migration';
COMMENT ON COLUMN payroll_migration_approvals.director_approval_id IS 'Director who approved this migration';
COMMENT ON COLUMN payroll_migration_approvals.director_approved_at IS 'Timestamp when director approval was granted';
COMMENT ON COLUMN payroll_migration_approvals.director_notes IS 'Director approval notes and observations';
COMMENT ON COLUMN payroll_migration_approvals.admin_approval_id IS 'Admin who approved this migration';
COMMENT ON COLUMN payroll_migration_approvals.admin_approved_at IS 'Timestamp when admin approval was granted';
COMMENT ON COLUMN payroll_migration_approvals.admin_notes IS 'Admin approval notes and observations';
COMMENT ON COLUMN payroll_migration_approvals.migration_readiness_score IS 'Overall migration readiness score (0-100)';
COMMENT ON COLUMN payroll_migration_approvals.total_workers IS 'Total number of workers in this period';
COMMENT ON COLUMN payroll_migration_approvals.ready_workers IS 'Number of workers ready for migration';
COMMENT ON COLUMN payroll_migration_approvals.blocked_workers IS 'Number of workers blocked from migration';

-- Enable Row Level Security
ALTER TABLE payroll_comparison_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_migration_approvals ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for payroll_comparison_reviews
DROP POLICY IF EXISTS "Users can view their company payroll comparison reviews" ON payroll_comparison_reviews;
CREATE POLICY "Users can view their company payroll comparison reviews"
  ON payroll_comparison_reviews FOR SELECT
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can manage their company payroll comparison reviews" ON payroll_comparison_reviews;
CREATE POLICY "Users can manage their company payroll comparison reviews"
  ON payroll_comparison_reviews FOR ALL
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

-- Create RLS policies for payroll_migration_approvals
DROP POLICY IF EXISTS "Users can view their company payroll migration approvals" ON payroll_migration_approvals;
CREATE POLICY "Users can view their company payroll migration approvals"
  ON payroll_migration_approvals FOR SELECT
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can manage their company payroll migration approvals" ON payroll_migration_approvals;
CREATE POLICY "Users can manage their company payroll migration approvals"
  ON payroll_migration_approvals FOR ALL
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

-- Create triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_payroll_comparison_reviews_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_payroll_migration_approvals_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers
CREATE TRIGGER trigger_update_payroll_comparison_reviews_updated_at
  BEFORE UPDATE ON payroll_comparison_reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_payroll_comparison_reviews_updated_at();

CREATE TRIGGER trigger_update_payroll_migration_approvals_updated_at
  BEFORE UPDATE ON payroll_migration_approvals
  FOR EACH ROW
  EXECUTE FUNCTION update_payroll_migration_approvals_updated_at();
