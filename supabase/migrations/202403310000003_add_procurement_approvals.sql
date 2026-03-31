-- Create procurement_approvals table
CREATE TABLE IF NOT EXISTS procurement_approvals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES procurement_headers(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'reset')),
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_procurement_approvals_document_id ON procurement_approvals(document_id);
CREATE INDEX IF NOT EXISTS idx_procurement_approvals_status ON procurement_approvals(status);
CREATE INDEX IF NOT EXISTS idx_procurement_approvals_created_at ON procurement_approvals(created_at);
