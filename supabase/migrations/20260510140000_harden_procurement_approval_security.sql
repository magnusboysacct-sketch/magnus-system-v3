-- Secure submit_for_approval()
CREATE OR REPLACE FUNCTION submit_for_approval(procurement_id uuid, notes text DEFAULT null)
RETURNS boolean AS $$
DECLARE
  header_record RECORD;
  v_user_id uuid;
  user_company_id uuid;
  project_company_id uuid;
BEGIN
  -- Get authenticated user ID
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  -- Get user's company_id
  SELECT company_id INTO user_company_id 
  FROM user_profiles 
  WHERE id = v_user_id;
  
  IF user_company_id IS NULL THEN
    RAISE EXCEPTION 'User has no company assigned';
  END IF;

  -- Get procurement header with project company validation
  SELECT 
    ph.*,
    p.company_id as project_company_id
  INTO header_record
  FROM procurement_headers ph
  JOIN projects p ON ph.project_id = p.id
  WHERE ph.id = submit_for_approval.procurement_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Procurement not found';
  END IF;
  
  -- Validate company ownership
  IF header_record.project_company_id != user_company_id THEN
    RAISE EXCEPTION 'Access denied: User cannot access procurements from other companies';
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
  VALUES (submit_for_approval.procurement_id, 'submitted', v_user_id, notes);
  
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Secure approve_procurement()
CREATE OR REPLACE FUNCTION approve_procurement(procurement_id uuid, notes text DEFAULT null)
RETURNS boolean AS $$
DECLARE
  header_record RECORD;
  v_user_id uuid;
  user_company_id uuid;
  project_company_id uuid;
BEGIN
  -- Get authenticated user ID
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  -- Get user's company_id
  SELECT company_id INTO user_company_id 
  FROM user_profiles 
  WHERE id = v_user_id;
  
  IF user_company_id IS NULL THEN
    RAISE EXCEPTION 'User has no company assigned';
  END IF;

  -- Get procurement header with project company validation
  SELECT 
    ph.*,
    p.company_id as project_company_id
  INTO header_record
  FROM procurement_headers ph
  JOIN projects p ON ph.project_id = p.id
  WHERE ph.id = approve_procurement.procurement_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Procurement not found';
  END IF;
  
  -- Validate company ownership
  IF header_record.project_company_id != user_company_id THEN
    RAISE EXCEPTION 'Access denied: User cannot access procurements from other companies';
  END IF;
  
  -- Check if can be approved
  IF header_record.approval_status NOT IN ('submitted', 'pending') THEN
    RAISE EXCEPTION 'Procurement cannot be approved (current status: %)', header_record.approval_status;
  END IF;
  
  -- Update approval status
  UPDATE procurement_headers 
  SET 
    approval_status = 'approved',
    approved_by = v_user_id,
    approved_at = now()
  WHERE id = approve_procurement.procurement_id;
  
  -- Create approval history record
  INSERT INTO approval_history (procurement_id, action, user_id, notes)
  VALUES (approve_procurement.procurement_id, 'approved', v_user_id, notes);
  
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Secure reject_procurement()
CREATE OR REPLACE FUNCTION reject_procurement(procurement_id uuid, notes text DEFAULT null)
RETURNS boolean AS $$
DECLARE
  header_record RECORD;
  v_user_id uuid;
  user_company_id uuid;
  project_company_id uuid;
BEGIN
  -- Get authenticated user ID
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  -- Get user's company_id
  SELECT company_id INTO user_company_id 
  FROM user_profiles 
  WHERE id = v_user_id;
  
  IF user_company_id IS NULL THEN
    RAISE EXCEPTION 'User has no company assigned';
  END IF;

  -- Get procurement header with project company validation
  SELECT 
    ph.*,
    p.company_id as project_company_id
  INTO header_record
  FROM procurement_headers ph
  JOIN projects p ON ph.project_id = p.id
  WHERE ph.id = reject_procurement.procurement_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Procurement not found';
  END IF;
  
  -- Validate company ownership
  IF header_record.project_company_id != user_company_id THEN
    RAISE EXCEPTION 'Access denied: User cannot access procurements from other companies';
  END IF;
  
  -- Check if can be rejected
  IF header_record.approval_status NOT IN ('submitted', 'pending', 'approved') THEN
    RAISE EXCEPTION 'Procurement cannot be rejected (current status: %)', header_record.approval_status;
  END IF;
  
  -- Update approval status
  UPDATE procurement_headers 
  SET 
    approval_status = 'rejected',
    approved_by = v_user_id,
    approved_at = now()
  WHERE id = reject_procurement.procurement_id;
  
  -- Create approval history record
  INSERT INTO approval_history (procurement_id, action, user_id, notes)
  VALUES (reject_procurement.procurement_id, 'rejected', v_user_id, notes);
  
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;