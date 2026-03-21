/*
  # Create Receipt Archive System

  1. New Tables
    - `receipt_archive`
      - `id` (uuid, primary key)
      - `company_id` (uuid, references companies)
      - `expense_id` (uuid, references expenses)
      - `storage_path` (text) - Path in Supabase Storage
      - `original_filename` (text)
      - `file_type` (text) - image/jpeg, image/png, application/pdf
      - `file_size` (bigint) - Size in bytes
      - `upload_year` (integer) - For organization
      - `upload_month` (integer) - For organization
      - `ocr_vendor` (text, nullable) - Detected vendor
      - `ocr_date` (date, nullable) - Detected date
      - `ocr_amount` (numeric, nullable) - Detected amount
      - `ocr_tax` (numeric, nullable) - Detected tax
      - `ocr_receipt_number` (text, nullable) - Detected receipt number
      - `ocr_raw_text` (text, nullable) - Full OCR text
      - `ocr_confidence` (numeric, nullable) - Overall confidence score
      - `ocr_processed_at` (timestamptz, nullable)
      - `created_at` (timestamptz)
      - `created_by` (uuid, references user_profiles)

  2. Storage
    - Create 'receipts' storage bucket with appropriate policies

  3. Security
    - Enable RLS on `receipt_archive` table
    - Add policies for company members to manage receipts
*/

-- Create receipt_archive table
CREATE TABLE IF NOT EXISTS receipt_archive (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  expense_id uuid REFERENCES expenses(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  original_filename text NOT NULL,
  file_type text NOT NULL,
  file_size bigint NOT NULL,
  upload_year integer NOT NULL,
  upload_month integer NOT NULL,
  ocr_vendor text,
  ocr_date date,
  ocr_amount numeric(12, 2),
  ocr_tax numeric(12, 2),
  ocr_receipt_number text,
  ocr_raw_text text,
  ocr_confidence numeric(3, 2),
  ocr_processed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES user_profiles(id)
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_receipt_archive_company_id ON receipt_archive(company_id);
CREATE INDEX IF NOT EXISTS idx_receipt_archive_expense_id ON receipt_archive(expense_id);
CREATE INDEX IF NOT EXISTS idx_receipt_archive_year_month ON receipt_archive(upload_year, upload_month);
CREATE INDEX IF NOT EXISTS idx_receipt_archive_created_at ON receipt_archive(created_at DESC);

-- Enable RLS
ALTER TABLE receipt_archive ENABLE ROW LEVEL SECURITY;

-- Policy: Company members can view receipts
CREATE POLICY "Company members can view receipts"
  ON receipt_archive FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  );

-- Policy: Company members can insert receipts
CREATE POLICY "Company members can insert receipts"
  ON receipt_archive FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  );

-- Policy: Company members can update their own receipts
CREATE POLICY "Company members can update receipts"
  ON receipt_archive FOR UPDATE
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

-- Policy: Company members can delete receipts
CREATE POLICY "Company members can delete receipts"
  ON receipt_archive FOR DELETE
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  );

-- Create storage bucket for receipts (if not exists)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'receipts',
  'receipts',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policy: Company members can upload receipts
CREATE POLICY "Company members can upload receipts"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'receipts' AND
    (storage.foldername(name))[1] IN (
      SELECT CAST(EXTRACT(YEAR FROM NOW()) AS TEXT)
    )
  );

-- Storage policy: Company members can view receipts
CREATE POLICY "Company members can view receipts"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'receipts'
  );

-- Storage policy: Company members can update receipts
CREATE POLICY "Company members can update receipts"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'receipts'
  );

-- Storage policy: Company members can delete receipts
CREATE POLICY "Company members can delete receipts"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'receipts'
  );
