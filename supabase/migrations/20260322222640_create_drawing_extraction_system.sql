/*
  # Drawing Extraction System

  1. New Tables
    - `drawing_files` - Stores uploaded drawing file metadata
    - `drawing_pages` - Individual pages within drawing files
    - `drawing_extraction_items` - Extracted information from drawings

  2. Security
    - Enable RLS on all tables
    - Restrict access to authenticated users within same company
*/

CREATE TABLE IF NOT EXISTS public.drawing_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  file_path text NULL,
  file_bucket text NULL,
  file_size_bytes bigint NULL,
  mime_type text NULL,
  page_count int NOT NULL DEFAULT 0,
  processing_status text NOT NULL DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
  processing_error text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS drawing_files_company_id_idx ON public.drawing_files(company_id);
CREATE INDEX IF NOT EXISTS drawing_files_project_id_idx ON public.drawing_files(project_id);
CREATE INDEX IF NOT EXISTS drawing_files_status_idx ON public.drawing_files(processing_status);

CREATE TABLE IF NOT EXISTS public.drawing_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drawing_file_id uuid NOT NULL REFERENCES public.drawing_files(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  takeoff_session_id uuid NULL REFERENCES public.takeoff_sessions(id) ON DELETE SET NULL,
  page_number int NOT NULL,
  page_label text NULL,
  width numeric NULL,
  height numeric NULL,
  thumbnail_path text NULL,
  metadata jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(drawing_file_id, page_number)
);

CREATE INDEX IF NOT EXISTS drawing_pages_file_id_idx ON public.drawing_pages(drawing_file_id);
CREATE INDEX IF NOT EXISTS drawing_pages_company_id_idx ON public.drawing_pages(company_id);
CREATE INDEX IF NOT EXISTS drawing_pages_project_id_idx ON public.drawing_pages(project_id);
CREATE INDEX IF NOT EXISTS drawing_pages_session_id_idx ON public.drawing_pages(takeoff_session_id);

CREATE TABLE IF NOT EXISTS public.drawing_extraction_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drawing_page_id uuid NOT NULL REFERENCES public.drawing_pages(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  item_type text NOT NULL CHECK (item_type IN ('dimension', 'note', 'element', 'title_block', 'revision', 'material', 'other')),
  category text NULL,
  raw_text text NULL,
  normalized_value text NULL,
  numeric_value numeric NULL,
  unit text NULL,
  bounding_box jsonb NULL,
  page_region text NULL,
  confidence_score numeric NULL CHECK (confidence_score >= 0 AND confidence_score <= 1),
  extraction_method text NULL,
  extraction_metadata jsonb NULL,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'approved', 'rejected')),
  reviewed_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz NULL,
  review_notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS drawing_extraction_items_page_id_idx ON public.drawing_extraction_items(drawing_page_id);
CREATE INDEX IF NOT EXISTS drawing_extraction_items_company_id_idx ON public.drawing_extraction_items(company_id);
CREATE INDEX IF NOT EXISTS drawing_extraction_items_project_id_idx ON public.drawing_extraction_items(project_id);
CREATE INDEX IF NOT EXISTS drawing_extraction_items_type_idx ON public.drawing_extraction_items(item_type);
CREATE INDEX IF NOT EXISTS drawing_extraction_items_status_idx ON public.drawing_extraction_items(status);

CREATE TRIGGER trg_drawing_files_updated_at
  BEFORE UPDATE ON public.drawing_files
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_drawing_pages_updated_at
  BEFORE UPDATE ON public.drawing_pages
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_drawing_extraction_items_updated_at
  BEFORE UPDATE ON public.drawing_extraction_items
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.drawing_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drawing_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drawing_extraction_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view drawing_files in their company"
  ON public.drawing_files FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can insert drawing_files in their company"
  ON public.drawing_files FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update drawing_files in their company"
  ON public.drawing_files FOR UPDATE
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.user_profiles WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can delete drawing_files in their company"
  ON public.drawing_files FOR DELETE
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can view drawing_pages in their company"
  ON public.drawing_pages FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can insert drawing_pages in their company"
  ON public.drawing_pages FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update drawing_pages in their company"
  ON public.drawing_pages FOR UPDATE
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.user_profiles WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can delete drawing_pages in their company"
  ON public.drawing_pages FOR DELETE
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can view extraction_items in their company"
  ON public.drawing_extraction_items FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can insert extraction_items in their company"
  ON public.drawing_extraction_items FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update extraction_items in their company"
  ON public.drawing_extraction_items FOR UPDATE
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.user_profiles WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can delete extraction_items in their company"
  ON public.drawing_extraction_items FOR DELETE
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.user_profiles WHERE id = auth.uid()
    )
  );
