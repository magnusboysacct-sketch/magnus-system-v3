/*
  Phase 8: Finance File Storage - Structured File Organization
  
  Creates the finance files table for organized storage of bank statements,
  credit card statements, and receipts with structured paths.
  
  Tables Created:
  - finance_files: Centralized finance file management with structured storage
  
  This integrates with:
  - Existing project-files bucket (reused)
  - Phase 5 bank statements integration
  - Phase 6 credit card statements integration
  - Existing file upload patterns from documents.ts
*/

-- =====================================================
-- FINANCE FILES
-- =====================================================

CREATE TABLE IF NOT EXISTS finance_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  
  -- File classification
  file_type text NOT NULL CHECK (file_type IN ('bank', 'credit', 'receipts')),
  
  -- File information
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_size integer NOT NULL CHECK (file_size > 0),
  file_type_mime text,
  storage_url text NOT NULL,
  
  -- Upload information
  upload_date date NOT NULL,
  uploaded_by uuid REFERENCES auth.users(id),
  
  -- File metadata
  description text,
  metadata jsonb DEFAULT '{}',
  tags text[] DEFAULT '{}',
  
  -- Status
  is_active boolean DEFAULT true,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Constraints
  CHECK(file_size > 0),
  CHECK(upload_date <= CURRENT_DATE)
);

-- =====================================================
-- INDEXES
-- =====================================================

-- Finance files indexes
CREATE INDEX IF NOT EXISTS idx_finance_files_company ON finance_files(company_id);
CREATE INDEX IF NOT EXISTS idx_finance_files_type ON finance_files(file_type);
CREATE INDEX IF NOT EXISTS idx_finance_files_upload_date ON finance_files(upload_date);
CREATE INDEX IF NOT EXISTS idx_finance_files_uploaded_by ON finance_files(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_finance_files_active ON finance_files(is_active);
CREATE INDEX IF NOT EXISTS idx_finance_files_tags ON finance_files USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_finance_files_metadata ON finance_files USING GIN(metadata);

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

-- Enable RLS
ALTER TABLE finance_files ENABLE ROW LEVEL SECURITY;

-- Finance files RLS
CREATE POLICY "Users can view their company finance files"
  ON finance_files FOR SELECT
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can manage their company finance files"
  ON finance_files FOR ALL
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

-- =====================================================
-- TRIGGERS FOR UPDATED_AT
-- =====================================================

CREATE OR REPLACE FUNCTION update_finance_files_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_finance_files_updated_at
  BEFORE UPDATE ON finance_files
  FOR EACH ROW
  EXECUTE FUNCTION update_finance_files_updated_at();

-- =====================================================
-- VIEWS FOR COMMON QUERIES
-- =====================================================

-- Active finance files view
CREATE OR REPLACE VIEW v_active_finance_files AS
SELECT 
  id,
  company_id,
  file_type,
  file_name,
  file_path,
  file_size,
  file_type_mime,
  storage_url,
  upload_date,
  uploaded_by,
  description,
  metadata,
  tags,
  created_at,
  updated_at
FROM finance_files 
WHERE is_active = true
ORDER BY upload_date DESC, created_at DESC;

-- Finance files by type view
CREATE OR REPLACE VIEW v_finance_files_by_type AS
SELECT 
  company_id,
  file_type,
  COUNT(*) as file_count,
  SUM(file_size) as total_size,
  COUNT(*) FILTER (WHERE upload_date >= CURRENT_DATE - INTERVAL '30 days') as recent_count,
  COUNT(*) FILTER (WHERE upload_date >= DATE_TRUNC('month', CURRENT_DATE)) as this_month_count
FROM finance_files 
WHERE is_active = true
GROUP BY company_id, file_type
ORDER BY file_type, total_size DESC;

-- Finance files storage summary view
CREATE OR REPLACE VIEW v_finance_storage_summary AS
SELECT 
  company_id,
  COUNT(*) as total_files,
  SUM(file_size) as total_size,
  COUNT(*) FILTER (WHERE file_type = 'bank') as bank_files,
  SUM(file_size) FILTER (WHERE file_type = 'bank') as bank_size,
  COUNT(*) FILTER (WHERE file_type = 'credit') as credit_files,
  SUM(file_size) FILTER (WHERE file_type = 'credit') as credit_size,
  COUNT(*) FILTER (WHERE file_type = 'receipts') as receipt_files,
  SUM(file_size) FILTER (WHERE file_type = 'receipts') as receipt_size,
  COUNT(*) FILTER (WHERE upload_date >= CURRENT_DATE - INTERVAL '30 days') as recent_uploads,
  COUNT(*) FILTER (WHERE upload_date >= DATE_TRUNC('month', CURRENT_DATE)) as this_month_uploads,
  MAX(upload_date) as latest_upload,
  MIN(upload_date) as earliest_upload
FROM finance_files 
WHERE is_active = true
GROUP BY company_id
ORDER BY total_size DESC;

-- =====================================================
-- FUNCTIONS FOR FILE MANAGEMENT
-- =====================================================

-- Function to get file statistics
CREATE OR REPLACE FUNCTION get_finance_file_stats(p_company_id uuid)
RETURNS TABLE (
  total_files bigint,
  total_size numeric,
  bank_files bigint,
  bank_size numeric,
  credit_files bigint,
  credit_size numeric,
  receipt_files bigint,
  receipt_size numeric,
  recent_uploads bigint,
  this_month_uploads bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*) as total_files,
    COALESCE(SUM(file_size), 0) as total_size,
    COUNT(*) FILTER (WHERE file_type = 'bank') as bank_files,
    COALESCE(SUM(file_size) FILTER (WHERE file_type = 'bank'), 0) as bank_size,
    COUNT(*) FILTER (WHERE file_type = 'credit') as credit_files,
    COALESCE(SUM(file_size) FILTER (WHERE file_type = 'credit'), 0) as credit_size,
    COUNT(*) FILTER (WHERE file_type = 'receipts') as receipt_files,
    COALESCE(SUM(file_size) FILTER (WHERE file_type = 'receipts'), 0) as receipt_size,
    COUNT(*) FILTER (WHERE upload_date >= CURRENT_DATE - INTERVAL '30 days') as recent_uploads,
    COUNT(*) FILTER (WHERE upload_date >= DATE_TRUNC('month', CURRENT_DATE)) as this_month_uploads
  FROM finance_files 
  WHERE company_id = p_company_id
    AND is_active = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get monthly storage usage
CREATE OR REPLACE FUNCTION get_monthly_storage_usage(p_company_id uuid, p_months integer DEFAULT 12)
RETURNS TABLE (
  month text,
  file_count bigint,
  total_size numeric,
  file_type text
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    DATE_TRUNC('month', upload_date)::text as month,
    COUNT(*) as file_count,
    COALESCE(SUM(file_size), 0) as total_size,
    file_type
  FROM finance_files 
  WHERE company_id = p_company_id
    AND is_active = true
    AND upload_date >= CURRENT_DATE - INTERVAL '1 month' * p_months
  GROUP BY DATE_TRUNC('month', upload_date), file_type
  ORDER BY month DESC, file_type;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to search finance files
CREATE OR REPLACE FUNCTION search_finance_files(
  p_company_id uuid,
  p_search_term text,
  p_file_type text DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_tags text[] DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  file_type text,
  file_name text,
  file_path text,
  file_size integer,
  file_type_mime text,
  storage_url text,
  upload_date date,
  uploaded_by uuid,
  description text,
  metadata jsonb,
  tags text[],
  created_at timestamptz,
  updated_at timestamptz,
  rank numeric
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    f.*,
    CASE
      WHEN f.file_name ILIKE p_search_term THEN 1.0
      WHEN f.description ILIKE p_search_term THEN 0.8
      WHEN f.file_name ILIKE '%' || p_search_term || '%' THEN 0.6
      WHEN f.description ILIKE '%' || p_search_term || '%' THEN 0.4
      WHEN p_search_term = ANY(f.tags) THEN 0.9
      ELSE 0.1
    END as rank
  FROM finance_files f
  WHERE f.company_id = p_company_id
    AND f.is_active = true
    AND (
      p_search_term IS NULL OR
      f.file_name ILIKE '%' || p_search_term || '%' OR
      f.description ILIKE '%' || p_search_term || '%' OR
      p_search_term = ANY(f.tags)
    )
    AND (
      p_file_type IS NULL OR f.file_type = p_file_type
    )
    AND (
      p_start_date IS NULL OR f.upload_date >= p_start_date
    )
    AND (
      p_end_date IS NULL OR f.upload_date <= p_end_date
    )
    AND (
      p_tags IS NULL OR f.tags && p_tags
    )
  ORDER BY rank DESC, upload_date DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- COMMENT: USAGE NOTES
-- =====================================================

/*
  Finance File Storage System:
  
  1. Structured Storage Paths:
     - Bank statements: /finance/bank/{year}/{month}/
     - Credit card statements: /finance/credit/{year}/{month}/
     - Receipts: /finance/receipts/{year}/{month}/
     - Reuses existing project-files bucket
     - Automatic path generation based on date and file type
  
  2. File Management:
     - Centralized finance file storage
     - Metadata and tags for organization
     - Soft delete with is_active flag
     - File size and type validation
     - Upload date tracking
  
  3. Integration Points:
     - Works with existing project-files bucket
     - Integrates with Phase 5 bank statements
     - Integrates with Phase 6 credit card statements
     - Uses existing file upload patterns from documents.ts
     - Maintains company-based security model
  
  4. Storage Organization:
     - Automatic folder structure creation
     - Unique filename generation with timestamps
     - Path sanitization for safe storage
     - Public URL generation for file access
  
  5. Search and Discovery:
     - Full-text search across filenames and descriptions
     - Tag-based filtering
     - Date range filtering
     - File type filtering
     - Relevance ranking
  
  6. Statistics and Reporting:
     - File count and size by type
     - Monthly storage usage
     - Recent upload tracking
     - Storage utilization metrics
*/
