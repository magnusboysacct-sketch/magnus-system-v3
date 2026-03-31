-- Upgrade procurement_approvals for multi-user support and audit trail
-- This migration adds support for multiple approval actions per document
-- while maintaining backward compatibility with existing single-approval workflow

-- Add user_id foreign key for proper user relationship
ALTER TABLE procurement_approvals 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Add approval_type for different kinds of approvals (optional, for future role-based rules)
ALTER TABLE procurement_approvals 
ADD COLUMN IF NOT EXISTS approval_type TEXT DEFAULT 'standard' CHECK (approval_type IN ('standard', 'final', 'review', 'emergency'));

-- Add sequence number for ordering multiple approvals
ALTER TABLE procurement_approvals 
ADD COLUMN IF NOT EXISTS sequence_number INTEGER DEFAULT 1;

-- Add is_active flag to determine which approval is current
ALTER TABLE procurement_approvals 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Update existing records to have user_id based on approved_by text
UPDATE procurement_approvals 
SET user_id = (
  SELECT u.id 
  FROM auth.users u 
  JOIN user_profiles up ON u.id = up.id 
  WHERE up.full_name = procurement_approvals.approved_by 
     OR up.email = procurement_approvals.approved_by
  LIMIT 1
)
WHERE approved_by IS NOT NULL 
  AND user_id IS NULL;

-- Set is_active = true for latest approval per document, false for others
UPDATE procurement_approvals 
SET is_active = false 
WHERE id NOT IN (
  SELECT DISTINCT ON (document_id) id 
  FROM procurement_approvals 
  ORDER BY document_id, created_at DESC
);

-- Set sequence numbers based on creation order
UPDATE procurement_approvals 
SET sequence_number = (
  SELECT COUNT(*) + 1 
  FROM procurement_approvals pa2 
  WHERE pa2.document_id = procurement_approvals.document_id 
    AND pa2.created_at <= procurement_approvals.created_at
);

-- Add indexes for multi-user approval queries
CREATE INDEX IF NOT EXISTS idx_procurement_approvals_user_id ON procurement_approvals(user_id);
CREATE INDEX IF NOT EXISTS idx_procurement_approvals_document_active ON procurement_approvals(document_id, is_active);
CREATE INDEX IF NOT EXISTS idx_procurement_approvals_sequence ON procurement_approvals(document_id, sequence_number);

-- Add RLS policy for users to see approvals for their company's documents
ALTER TABLE procurement_approvals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view approvals for their company" ON procurement_approvals;
CREATE POLICY "Users can view approvals for their company" ON procurement_approvals
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM procurement_headers ph 
      WHERE ph.id = procurement_approvals.document_id 
        AND ph.company_id IN (
          SELECT company_id FROM user_profiles WHERE id = auth.uid()
        )
    )
  );

DROP POLICY IF EXISTS "Users can insert approvals" ON procurement_approvals;
CREATE POLICY "Users can insert approvals" ON procurement_approvals
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM procurement_headers ph 
      WHERE ph.id = document_id 
        AND ph.company_id IN (
          SELECT company_id FROM user_profiles WHERE id = auth.uid()
        )
    )
  );

DROP POLICY IF EXISTS "Users can update approvals" ON procurement_approvals;
CREATE POLICY "Users can update approvals" ON procurement_approvals
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM procurement_headers ph 
      WHERE ph.id = document_id 
        AND ph.company_id IN (
          SELECT company_id FROM user_profiles WHERE id = auth.uid()
        )
    )
  );
