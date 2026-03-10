/*
  # Create suppliers table

  1. New Tables
    - `suppliers`
      - `id` (uuid, primary key)
      - `company_id` (uuid, foreign key to companies) - company ownership
      - `supplier_name` (text, required) - name of the supplier/vendor
      - `contact_name` (text, optional) - primary contact person
      - `email` (text, optional) - supplier email address
      - `phone` (text, optional) - supplier phone number
      - `address` (text, optional) - supplier physical address
      - `payment_terms` (text, optional) - payment terms (e.g., "Net 30", "COD")
      - `notes` (text, optional) - additional notes about the supplier
      - `is_active` (boolean) - whether supplier is active
      - `created_at` (timestamptz) - record creation timestamp
      - `updated_at` (timestamptz) - record update timestamp

  2. Security
    - Enable RLS on `suppliers` table
    - Add policy for users to view suppliers in their company
    - Add policy for users to insert suppliers in their company
    - Add policy for users to update suppliers in their company
    - Add policy for users to delete suppliers in their company

  3. Indexes
    - Index on company_id for fast filtering by company
    - Index on supplier_name for text searches
    - Index on is_active for filtering active suppliers
    - Unique constraint on (company_id, supplier_name) to prevent duplicates within same company

  4. Triggers
    - Auto-update updated_at timestamp on record changes
*/

-- Create suppliers table
CREATE TABLE IF NOT EXISTS suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  supplier_name text NOT NULL,
  contact_name text,
  email text,
  phone text,
  address text,
  payment_terms text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_suppliers_company_id ON suppliers(company_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(supplier_name);
CREATE INDEX IF NOT EXISTS idx_suppliers_is_active ON suppliers(is_active);

-- Create unique constraint: same company cannot have duplicate supplier names
CREATE UNIQUE INDEX IF NOT EXISTS idx_suppliers_company_name_unique 
  ON suppliers(company_id, supplier_name);

-- Create trigger to auto-update updated_at timestamp
DROP TRIGGER IF EXISTS trg_suppliers_updated_at ON suppliers;
CREATE TRIGGER trg_suppliers_updated_at
  BEFORE UPDATE ON suppliers
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- Enable Row Level Security
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view suppliers in their company
CREATE POLICY "Users can view suppliers in their company"
  ON suppliers
  FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  );

-- RLS Policy: Users can insert suppliers in their company
CREATE POLICY "Users can insert suppliers in their company"
  ON suppliers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  );

-- RLS Policy: Users can update suppliers in their company
CREATE POLICY "Users can update suppliers in their company"
  ON suppliers
  FOR UPDATE
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

-- RLS Policy: Users can delete suppliers in their company
CREATE POLICY "Users can delete suppliers in their company"
  ON suppliers
  FOR DELETE
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  );
