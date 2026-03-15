/*
  # Add Invoice Line Items

  ## Overview
  Adds line item support to client invoices for detailed billing breakdown.

  ## New Tables
    - `client_invoice_line_items` - Individual line items for invoices with description, qty, rate, amount
  
  ## Changes
    No changes to existing tables - client_invoices already has subtotal, tax, and totals fields.
    Payments table already exists and supports partial payments.

  ## Security
    - Enable RLS on line items table
    - Policies for authenticated company members to manage their invoice line items
*/

-- =====================================================
-- INVOICE LINE ITEMS
-- =====================================================

CREATE TABLE IF NOT EXISTS client_invoice_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES client_invoices(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  
  line_number integer NOT NULL DEFAULT 1,
  description text NOT NULL,
  quantity numeric(10,2) NOT NULL DEFAULT 1,
  unit text DEFAULT 'ea',
  rate numeric(12,2) NOT NULL DEFAULT 0,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  
  notes text,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_invoice_line_items_invoice_id 
  ON client_invoice_line_items(invoice_id);

CREATE INDEX IF NOT EXISTS idx_invoice_line_items_company_id 
  ON client_invoice_line_items(company_id);

-- =====================================================
-- RLS POLICIES
-- =====================================================

ALTER TABLE client_invoice_line_items ENABLE ROW LEVEL SECURITY;

-- Policy: Company members can view their invoice line items
CREATE POLICY "Company members can view invoice line items"
  ON client_invoice_line_items FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  );

-- Policy: Company members can insert invoice line items
CREATE POLICY "Company members can insert invoice line items"
  ON client_invoice_line_items FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  );

-- Policy: Company members can update their invoice line items
CREATE POLICY "Company members can update invoice line items"
  ON client_invoice_line_items FOR UPDATE
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  );

-- Policy: Company members can delete their invoice line items
CREATE POLICY "Company members can delete invoice line items"
  ON client_invoice_line_items FOR DELETE
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  );
