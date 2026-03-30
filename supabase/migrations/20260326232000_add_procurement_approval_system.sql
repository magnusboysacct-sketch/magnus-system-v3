/*
  # Procurement Phase 3: Approval System

  ## Overview
  Add approval control to procurement before ordering while maintaining
  backward compatibility with existing status system.

  ## Changes

  ### 1. Extend procurement_headers
    - Add approval_status field for approval workflow
    - Add approved_by and approved_at for audit trail
    - Keep existing status field for operational workflow

  ### 2. Create approval_history table
    - Track all approval actions with user and timestamps
    - Store notes for rejection/approval reasons
    - Maintain complete audit trail

  ### 3. Update Workflow
    - New flow: draft → submitted → approved → ordered
    - Existing flow: draft → ordered (still works for backward compatibility)
    - Approval control: Cannot create PO unless approved

  ## Backward Compatibility
  - Existing status system preserved
  - No auto-approval - user must trigger
  - Draft flow continues to work
  - Approval is additional layer, not replacement

  ## Safety Rules
  - No breaking changes to existing functionality
  - Approval is opt-in enhancement
  - All existing workflows remain functional
*/

-- =====================================================
-- EXTEND procurement_headers FOR APPROVAL
-- =====================================================

-- Add approval fields to procurement_headers
ALTER TABLE procurement_headers 
  ADD COLUMN IF NOT EXISTS approval_status text CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

-- Add index for approval status queries
CREATE INDEX IF NOT EXISTS idx_procurement_headers_approval_status ON procurement_headers(approval_status);
CREATE INDEX IF NOT EXISTS idx_procurement_headers_approved_by ON procurement_headers(approved_by);

-- =====================================================
-- CREATE approval_history TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS approval_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  procurement_id uuid NOT NULL REFERENCES procurement_headers(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('submitted', 'approved', 'rejected')),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Add indexes for approval history
CREATE INDEX IF NOT EXISTS idx_approval_history_procurement_id ON approval_history(procurement_id);
CREATE INDEX IF NOT EXISTS idx_approval_history_user_id ON approval_history(user_id);
CREATE INDEX IF NOT EXISTS idx_approval_history_created_at ON approval_history(created_at);

-- =====================================================
-- ENABLE ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE approval_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies for approval_history
CREATE POLICY "Users can view approval history for their projects"
  ON approval_history FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM procurement_headers ph
      WHERE ph.id = approval_history.procurement_id
      AND ph.project_id IN (
        SELECT project_id FROM project_members 
        WHERE user_id = auth.uid() 
        AND is_active = true
      )
    )
  );

CREATE POLICY "Users can insert approval history for their projects"
  ON approval_history FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM procurement_headers ph
      WHERE ph.id = approval_history.procurement_id
      AND ph.project_id IN (
        SELECT project_id FROM project_members 
        WHERE user_id = auth.uid() 
        AND is_active = true
      )
    )
  );

-- =====================================================
-- UPDATE RLS POLICIES FOR procurement_headers
-- =====================================================

-- Add policies for new approval fields (existing policies should cover these)
-- No changes needed as existing policies use project_id for access control

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Function to check if procurement can have PO created
CREATE OR REPLACE FUNCTION can_create_purchase_order(procurement_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM procurement_headers 
    WHERE id = can_create_purchase_order.procurement_id
    AND (
      -- Either approved through approval system
      (approval_status = 'approved')
      -- Or legacy flow without approval system
      OR (approval_status IS NULL AND status IN ('approved', 'sent'))
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to submit procurement for approval
CREATE OR REPLACE FUNCTION submit_for_approval(procurement_id uuid, user_id uuid, notes text DEFAULT null)
RETURNS boolean AS $$
DECLARE
  header_record RECORD;
BEGIN
  -- Get current header
  SELECT * INTO header_record 
  FROM procurement_headers 
  WHERE id = submit_for_approval.procurement_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Procurement not found';
  END IF;
  
  -- Check if already submitted/approved
  IF header_record.approval_status IN ('submitted', 'approved', 'rejected') THEN
    RAISE EXCEPTION 'Procurement already %', header_record.approval_status;
  END IF;
  
  -- Update approval status
  UPDATE procurement_headers 
  SET 
    approval_status = 'submitted',
    approved_at = null,
    approved_by = null
  WHERE id = submit_for_approval.procurement_id;
  
  -- Create approval history record
  INSERT INTO approval_history (procurement_id, action, user_id, notes)
  VALUES (submit_for_approval.procurement_id, 'submitted', submit_for_approval.user_id, notes);
  
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to approve procurement
CREATE OR REPLACE FUNCTION approve_procurement(procurement_id uuid, user_id uuid, notes text DEFAULT null)
RETURNS boolean AS $$
DECLARE
  header_record RECORD;
BEGIN
  -- Get current header
  SELECT * INTO header_record 
  FROM procurement_headers 
  WHERE id = approve_procurement.procurement_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Procurement not found';
  END IF;
  
  -- Check if can be approved
  IF header_record.approval_status NOT IN ('submitted', 'pending') THEN
    RAISE EXCEPTION 'Procurement cannot be approved (current status: %)', header_record.approval_status;
  END IF;
  
  -- Update approval status
  UPDATE procurement_headers 
  SET 
    approval_status = 'approved',
    approved_by = approve_procurement.user_id,
    approved_at = now()
  WHERE id = approve_procurement.procurement_id;
  
  -- Create approval history record
  INSERT INTO approval_history (procurement_id, action, user_id, notes)
  VALUES (approve_procurement.procurement_id, 'approved', approve_procurement.user_id, notes);
  
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to reject procurement
CREATE OR REPLACE FUNCTION reject_procurement(procurement_id uuid, user_id uuid, notes text DEFAULT null)
RETURNS boolean AS $$
DECLARE
  header_record RECORD;
BEGIN
  -- Get current header
  SELECT * INTO header_record 
  FROM procurement_headers 
  WHERE id = reject_procurement.procurement_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Procurement not found';
  END IF;
  
  -- Check if can be rejected
  IF header_record.approval_status NOT IN ('submitted', 'pending', 'approved') THEN
    RAISE EXCEPTION 'Procurement cannot be rejected (current status: %)', header_record.approval_status;
  END IF;
  
  -- Update approval status
  UPDATE procurement_headers 
  SET 
    approval_status = 'rejected',
    approved_by = reject_procurement.user_id,
    approved_at = now()
  WHERE id = reject_procurement.procurement_id;
  
  -- Create approval history record
  INSERT INTO approval_history (procurement_id, action, user_id, notes)
  VALUES (reject_procurement.procurement_id, 'rejected', reject_procurement.user_id, notes);
  
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get approval status with user info
CREATE OR REPLACE FUNCTION get_procurement_approval_info(procurement_id uuid)
RETURNS TABLE (
  approval_status text,
  approved_by uuid,
  approved_by_name text,
  approved_at timestamptz,
  history_action text,
  history_user_name text,
  history_notes text,
  history_created_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ph.approval_status,
    ph.approved_by,
    u.raw_user_meta_data->>'name' as approved_by_name,
    ph.approved_at,
    ah.action as history_action,
    u2.raw_user_meta_data->>'name' as history_user_name,
    ah.notes as history_notes,
    ah.created_at as history_created_at
  FROM procurement_headers ph
  LEFT JOIN auth.users u ON ph.approved_by = u.id
  LEFT JOIN approval_history ah ON ph.id = ah.procurement_id
  LEFT JOIN auth.users u2 ON ah.user_id = u2.id
  WHERE ph.id = get_procurement_approval_info.procurement_id
  ORDER BY ah.created_at DESC NULLS LAST;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
