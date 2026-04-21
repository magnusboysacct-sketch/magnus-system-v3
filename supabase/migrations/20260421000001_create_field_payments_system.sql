/*
  Field Day Worker Payment & Receipt System
  
  New Tables:
  - field_payments - Core payment records for day workers
  - field_payment_signatures - Worker and supervisor signatures
  - field_payment_receipts - Generated PDF receipts
  
  Integration:
  - Links to existing workers table
  - Connects to finance system for cost tracking
  - Uses project context for job costing
*/

-- =====================================================
-- FIELD PAYMENTS SYSTEM
-- =====================================================

CREATE TABLE IF NOT EXISTS field_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  project_id uuid REFERENCES projects(id),
  
  -- Worker Information
  worker_name text NOT NULL,
  worker_nickname text,
  worker_id_number text,
  worker_phone text,
  worker_address text,
  
  -- Work Details
  work_type text NOT NULL,
  work_date date NOT NULL DEFAULT current_date,
  hours_worked numeric(5,2),
  days_worked numeric(5,2),
  rate_per_hour numeric(10,2),
  rate_per_day numeric(10,2),
  total_amount numeric(10,2) NOT NULL,
  
  -- Payment Method
  payment_method text NOT NULL CHECK (payment_method IN ('cash', 'bank_transfer', 'check', 'other')),
  payment_notes text,
  
  -- Status
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'signed', 'completed', 'cancelled')),
  
  -- Images (stored in Supabase Storage)
  id_photo_url text,
  worker_photo_url text,
  
  -- Metadata
  supervisor_id uuid REFERENCES auth.users(id),
  supervisor_name text,
  location text,
  weather_conditions text,
  notes text,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  signed_at timestamptz,
  completed_at timestamptz,
  
  -- Finance Integration
  synced_to_finance boolean DEFAULT false,
  finance_transaction_id uuid,
  cost_code_id uuid REFERENCES cost_codes(id)
);

CREATE TABLE IF NOT EXISTS field_payment_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_payment_id uuid NOT NULL REFERENCES field_payments(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  
  signature_type text NOT NULL CHECK (signature_type IN ('worker', 'supervisor')),
  signature_data text NOT NULL, -- Base64 encoded signature
  signed_at timestamptz DEFAULT now(),
  signed_by text, -- Name of person who signed
  ip_address text,
  user_agent text,
  
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS field_payment_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_payment_id uuid NOT NULL REFERENCES field_payments(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  
  receipt_type text NOT NULL CHECK (receipt_type IN ('payment_acknowledgment', 'company_receipt', 'payroll_entry')),
  receipt_number text UNIQUE,
  pdf_url text NOT NULL, -- Stored in Supabase Storage
  pdf_data text, -- Base64 encoded PDF for immediate download
  
  -- Receipt Details
  receipt_date timestamptz DEFAULT now(),
  generated_by uuid REFERENCES auth.users(id),
  
  created_at timestamptz DEFAULT now()
);

-- =====================================================
-- INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_field_payments_company_id ON field_payments(company_id);
CREATE INDEX IF NOT EXISTS idx_field_payments_project_id ON field_payments(project_id);
CREATE INDEX IF NOT EXISTS idx_field_payments_work_date ON field_payments(work_date);
CREATE INDEX IF NOT EXISTS idx_field_payments_status ON field_payments(status);
CREATE INDEX IF NOT EXISTS idx_field_payments_worker_phone ON field_payments(worker_phone);
CREATE INDEX IF NOT EXISTS idx_field_payments_supervisor_id ON field_payments(supervisor_id);

CREATE INDEX IF NOT EXISTS idx_field_payment_signatures_payment_id ON field_payment_signatures(field_payment_id);
CREATE INDEX IF NOT EXISTS idx_field_payment_signatures_type ON field_payment_signatures(signature_type);

CREATE INDEX IF NOT EXISTS idx_field_payment_receipts_payment_id ON field_payment_receipts(field_payment_id);
CREATE INDEX IF NOT EXISTS idx_field_payment_receipts_type ON field_payment_receipts(receipt_type);

-- =====================================================
-- RLS (Row Level Security)
-- =====================================================

-- Field Payments
ALTER TABLE field_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company users can view field payments" ON field_payments
  FOR SELECT USING (
    auth.uid() IS NOT NULL AND 
    company_id = (
      SELECT company_id FROM user_profiles 
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Company users can insert field payments" ON field_payments
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND 
    company_id = (
      SELECT company_id FROM user_profiles 
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Company users can update field payments" ON field_payments
  FOR UPDATE USING (
    auth.uid() IS NOT NULL AND 
    company_id = (
      SELECT company_id FROM user_profiles 
      WHERE id = auth.uid()
    )
  );

-- Field Payment Signatures
ALTER TABLE field_payment_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company users can manage field payment signatures" ON field_payment_signatures
  FOR ALL USING (
    auth.uid() IS NOT NULL AND 
    company_id = (
      SELECT company_id FROM user_profiles 
      WHERE id = auth.uid()
    )
  );

-- Field Payment Receipts
ALTER TABLE field_payment_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company users can manage field payment receipts" ON field_payment_receipts
  FOR ALL USING (
    auth.uid() IS NOT NULL AND 
    company_id = (
      SELECT company_id FROM user_profiles 
      WHERE id = auth.uid()
    )
  );

-- =====================================================
-- FUNCTIONS AND TRIGGERS
-- =====================================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_field_payments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER field_payments_updated_at
  BEFORE UPDATE ON field_payments
  FOR EACH ROW
  EXECUTE FUNCTION update_field_payments_updated_at();

-- Auto-generate receipt number
CREATE OR REPLACE FUNCTION generate_receipt_number()
RETURNS TRIGGER AS $$
DECLARE
  receipt_prefix text;
  receipt_sequence integer;
BEGIN
  receipt_prefix := 'FP-' || to_char(NEW.created_at, 'YYYY-MM-DD');
  
  SELECT COALESCE(MAX(CAST(SUBSTRING(receipt_number FROM 13) AS integer)), 0) + 1
  INTO receipt_sequence
  FROM field_payment_receipts
  WHERE receipt_number LIKE receipt_prefix || '-%';
  
  NEW.receipt_number := receipt_prefix || '-' || LPAD(receipt_sequence::text, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER generate_field_payment_receipt_number
  BEFORE INSERT ON field_payment_receipts
  FOR EACH ROW
  EXECUTE FUNCTION generate_receipt_number();

-- =====================================================
-- VIEWS FOR REPORTING
-- =====================================================

CREATE OR REPLACE VIEW field_payment_summary AS
SELECT 
  fp.company_id,
  fp.project_id,
  p.name as project_name,
  fp.work_date,
  fp.payment_method,
  fp.status,
  COUNT(*) as payment_count,
  SUM(fp.total_amount) as total_amount,
  AVG(fp.total_amount) as average_amount,
  COUNT(DISTINCT fp.worker_phone) as unique_workers
FROM field_payments fp
LEFT JOIN projects p ON fp.project_id = p.id
WHERE fp.status NOT IN ('draft', 'cancelled')
GROUP BY fp.company_id, fp.project_id, p.name, fp.work_date, fp.payment_method, fp.status;

-- =====================================================
-- SAMPLE DATA (Optional - for development)
-- =====================================================

-- This can be uncommented for development testing
/*
INSERT INTO field_payments (company_id, project_id, worker_name, worker_phone, work_type, work_date, hours_worked, rate_per_hour, total_amount, payment_method, supervisor_name) VALUES
('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', 'John Doe', '555-0101', 'General Labor', current_date, 8, 15.00, 120.00, 'cash', 'Supervisor Name');
*/
