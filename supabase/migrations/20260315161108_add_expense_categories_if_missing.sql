/*
  # Add Expense Categories Table

  1. New Table
    - `expense_categories`
      - `id` (uuid, primary key)
      - `company_id` (uuid, references companies)
      - `name` (text)
      - `description` (text, optional)
      - `is_active` (boolean, default true)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `expense_categories` table
    - Add policies for authenticated company members

  3. Seed Data
    - Add default expense categories for new companies
*/

-- Create expense_categories table if it doesn't exist
CREATE TABLE IF NOT EXISTS expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Company members can view expense categories" ON expense_categories;
DROP POLICY IF EXISTS "Company members can create expense categories" ON expense_categories;
DROP POLICY IF EXISTS "Company members can update expense categories" ON expense_categories;
DROP POLICY IF EXISTS "Company members can delete expense categories" ON expense_categories;

-- Create policies
CREATE POLICY "Company members can view expense categories"
  ON expense_categories FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Company members can create expense categories"
  ON expense_categories FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Company members can update expense categories"
  ON expense_categories FOR UPDATE
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

CREATE POLICY "Company members can delete expense categories"
  ON expense_categories FOR DELETE
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  );