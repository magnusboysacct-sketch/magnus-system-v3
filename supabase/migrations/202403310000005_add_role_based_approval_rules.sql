-- Add role-based approval rules and final approver logic
-- This migration adds approval workflow configuration and role-based approval levels

-- Create approval_workflows table for configuring approval rules per company
CREATE TABLE IF NOT EXISTS approval_workflows (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_default BOOLEAN DEFAULT false,
  min_value_threshold DECIMAL(15,2) DEFAULT 0,
  requires_final_approval BOOLEAN DEFAULT false,
  allowed_roles TEXT[] DEFAULT ARRAY['director', 'admin', 'project_manager'],
  final_approval_roles TEXT[] DEFAULT ARRAY['director', 'admin'],
  auto_approve_below DECIMAL(15,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create approval_workflow_steps table for multi-step approval sequences
CREATE TABLE IF NOT EXISTS approval_workflow_steps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workflow_id UUID NOT NULL REFERENCES approval_workflows(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  name TEXT NOT NULL,
  required_role TEXT NOT NULL,
  min_approvers INTEGER DEFAULT 1,
  is_final_step BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workflow_id, step_number)
);

-- Add workflow reference to procurement_headers
ALTER TABLE procurement_headers 
ADD COLUMN IF NOT EXISTS workflow_id UUID REFERENCES approval_workflows(id) ON DELETE SET NULL;

-- Add current_step to track approval progress
ALTER TABLE procurement_headers 
ADD COLUMN IF NOT EXISTS current_approval_step INTEGER DEFAULT 1;

-- Add is_fully_approved flag for quick status checking
ALTER TABLE procurement_headers 
ADD COLUMN IF NOT EXISTS is_fully_approved BOOLEAN DEFAULT false;

-- Insert default approval workflows for existing companies
INSERT INTO approval_workflows (company_id, name, description, is_default, min_value_threshold, requires_final_approval, allowed_roles, final_approval_roles)
SELECT 
  c.id,
  'Standard Approval',
  'Default approval workflow for most procurement documents',
  true,
  1000.00,
  false,
  ARRAY['director', 'admin', 'project_manager'],
  ARRAY['director', 'admin']
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM approval_workflows aw WHERE aw.company_id = c.id AND aw.is_default = true
);

-- Insert standard workflow steps
INSERT INTO approval_workflow_steps (workflow_id, step_number, name, required_role, min_approvers, is_final_step)
SELECT 
  aw.id,
  1,
  'Manager Review',
  'project_manager',
  1,
  false
FROM approval_workflows aw
WHERE aw.is_default = true
AND NOT EXISTS (
  SELECT 1 FROM approval_workflow_steps aws WHERE aws.workflow_id = aw.id
);

-- Add final approval step for workflows that require it
INSERT INTO approval_workflow_steps (workflow_id, step_number, name, required_role, min_approvers, is_final_step)
SELECT 
  aw.id,
  2,
  'Final Approval',
  'admin',
  1,
  true
FROM approval_workflows aw
WHERE aw.is_default = true AND aw.requires_final_approval = true
AND NOT EXISTS (
  SELECT 1 FROM approval_workflow_steps aws WHERE aws.workflow_id = aw.id AND aws.step_number = 2
);

-- Update existing procurement headers to use default workflow
UPDATE procurement_headers ph
SET workflow_id = aw.id
FROM companies c
JOIN approval_workflows aw ON aw.company_id = c.id AND aw.is_default = true
WHERE ph.company_id = c.id
AND ph.workflow_id IS NULL;

-- Create function to check if user can approve at current step
CREATE OR REPLACE FUNCTION can_user_approve_step(
  p_user_id UUID,
  p_document_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  v_workflow_id UUID;
  v_current_step INTEGER;
  v_user_role TEXT;
  v_required_role TEXT;
  v_is_fully_approved BOOLEAN;
BEGIN
  -- Get document workflow info
  SELECT workflow_id, current_approval_step, is_fully_approved
  INTO v_workflow_id, v_current_step, v_is_fully_approved
  FROM procurement_headers
  WHERE id = p_document_id;
  
  -- If no workflow or fully approved, no approval needed
  IF v_workflow_id IS NULL OR v_is_fully_approved = true THEN
    RETURN false;
  END IF;
  
  -- Get user role
  SELECT role INTO v_user_role
  FROM user_profiles
  WHERE id = p_user_id;
  
  -- Get required role for current step
  SELECT required_role INTO v_required_role
  FROM approval_workflow_steps
  WHERE workflow_id = v_workflow_id AND step_number = v_current_step;
  
  -- Check if user has required role
  RETURN v_user_role = v_required_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to check if document is fully approved
CREATE OR REPLACE FUNCTION is_document_fully_approved(p_document_id UUID) RETURNS BOOLEAN AS $$
DECLARE
  v_workflow_id UUID;
  v_current_step INTEGER;
  v_total_steps INTEGER;
  v_approved_count INTEGER;
BEGIN
  -- Get document workflow info
  SELECT workflow_id, current_approval_step
  INTO v_workflow_id, v_current_step
  FROM procurement_headers
  WHERE id = p_document_id;
  
  -- If no workflow, consider not fully approved
  IF v_workflow_id IS NULL THEN
    RETURN false;
  END IF;
  
  -- Get total steps in workflow
  SELECT COUNT(*) INTO v_total_steps
  FROM approval_workflow_steps
  WHERE workflow_id = v_workflow_id;
  
  -- Count approved steps
  SELECT COUNT(DISTINCT sequence_number) INTO v_approved_count
  FROM procurement_approvals
  WHERE document_id = p_document_id
  AND status = 'approved'
  AND is_active = true;
  
  -- Document is fully approved if all steps are completed
  RETURN v_approved_count >= v_total_steps;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to update is_fully_approved flag
CREATE OR REPLACE FUNCTION update_fully_approved_flag()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the is_fully_approved flag on the procurement header
  UPDATE procurement_headers
  SET is_fully_approved = is_document_fully_approved(NEW.id)
  WHERE id = NEW.id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for procurement_approvals
CREATE TRIGGER trigger_update_fully_approved
  AFTER INSERT OR UPDATE ON procurement_approvals
  FOR EACH ROW
  EXECUTE FUNCTION update_fully_approved_flag();

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_approval_workflows_company_id ON approval_workflows(company_id);
CREATE INDEX IF NOT EXISTS idx_approval_workflows_is_default ON approval_workflows(company_id, is_default);
CREATE INDEX IF NOT EXISTS idx_approval_workflow_steps_workflow_id ON approval_workflow_steps(workflow_id);
CREATE INDEX IF NOT EXISTS idx_procurement_headers_workflow_id ON procurement_headers(workflow_id);
CREATE INDEX IF NOT EXISTS idx_procurement_headers_fully_approved ON procurement_headers(is_fully_approved);

-- Add RLS policies for approval workflows
ALTER TABLE approval_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_workflow_steps ENABLE ROW LEVEL SECURITY;

-- Users can view workflows for their company
CREATE POLICY "Users can view company approval workflows" ON approval_workflows
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  );

-- Users can view workflow steps for their company's workflows
CREATE POLICY "Users can view workflow steps" ON approval_workflow_steps
  FOR SELECT USING (
    workflow_id IN (
      SELECT id FROM approval_workflows 
      WHERE company_id IN (
        SELECT company_id FROM user_profiles WHERE id = auth.uid()
      )
    )
  );

-- Only admins can manage workflows
CREATE POLICY "Admins can manage approval workflows" ON approval_workflows
  FOR ALL USING (
    company_id IN (
      SELECT company_id FROM user_profiles 
      WHERE id = auth.uid() AND role IN ('director', 'admin')
    )
  );

CREATE POLICY "Admins can manage workflow steps" ON approval_workflow_steps
  FOR ALL USING (
    workflow_id IN (
      SELECT id FROM approval_workflows 
      WHERE company_id IN (
        SELECT company_id FROM user_profiles 
        WHERE id = auth.uid() AND role IN ('director', 'admin')
      )
    )
  );
