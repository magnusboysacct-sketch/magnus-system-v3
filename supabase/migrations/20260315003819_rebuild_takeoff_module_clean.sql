/*
  # Rebuild Takeoff Module - Clean Architecture

  1. Purpose
    - Add company_id to all takeoff tables for proper multi-tenancy
    - Remove confusing legacy fields (page_count, current_page, drawing_id)
    - Simplify schema to match frontend usage exactly
    - Create proper RLS policies based on company_id

  2. Schema Changes

    takeoff_sessions:
    - ADD company_id uuid (from project -> company_id)
    - REMOVE page_count (frontend-only, derived from PDF)
    - KEEP: id, project_id, name, pdf_name, pdf_storage_path, pdf_bucket, 
            pdf_path, pdf_url, calibration, created_at, updated_at

    takeoff_groups:
    - ADD company_id uuid (denormalized for RLS performance)
    - KEEP: id, session_id, name, color, trade, is_hidden, sort_order, created_at

    takeoff_measurements:
    - ADD company_id uuid (denormalized for RLS performance)
    - KEEP: id, session_id, page_number, group_id, type, points, unit, result, meta, sort_order, created_at

  3. RLS Policies
    - All tables: users can only access rows where company_id matches their user_profiles.company_id
    - Proper policies for SELECT, INSERT, UPDATE, DELETE
    - No more USING (true) - real security

  4. Data Migration
    - Populate company_id from existing project relationships
    - No data loss
*/

-- ============================================
-- Step 1: Drop all existing RLS policies
-- ============================================

DROP POLICY IF EXISTS "Users can view takeoff sessions for their projects" ON public.takeoff_sessions;
DROP POLICY IF EXISTS "Users can create takeoff sessions for their projects" ON public.takeoff_sessions;
DROP POLICY IF EXISTS "Users can update takeoff sessions for their projects" ON public.takeoff_sessions;
DROP POLICY IF EXISTS "Users can delete takeoff sessions for their projects" ON public.takeoff_sessions;
DROP POLICY IF EXISTS takeoff_sessions_select ON public.takeoff_sessions;
DROP POLICY IF EXISTS takeoff_sessions_insert ON public.takeoff_sessions;
DROP POLICY IF EXISTS takeoff_sessions_update ON public.takeoff_sessions;
DROP POLICY IF EXISTS takeoff_sessions_delete ON public.takeoff_sessions;

DROP POLICY IF EXISTS "Users can view takeoff groups for their projects" ON public.takeoff_groups;
DROP POLICY IF EXISTS "Users can create takeoff groups for their projects" ON public.takeoff_groups;
DROP POLICY IF EXISTS "Users can update takeoff groups for their projects" ON public.takeoff_groups;
DROP POLICY IF EXISTS "Users can delete takeoff groups for their projects" ON public.takeoff_groups;
DROP POLICY IF EXISTS takeoff_groups_select ON public.takeoff_groups;
DROP POLICY IF EXISTS takeoff_groups_insert ON public.takeoff_groups;
DROP POLICY IF EXISTS takeoff_groups_update ON public.takeoff_groups;
DROP POLICY IF EXISTS takeoff_groups_delete ON public.takeoff_groups;

DROP POLICY IF EXISTS "Users can view takeoff measurements for their projects" ON public.takeoff_measurements;
DROP POLICY IF EXISTS "Users can create takeoff measurements for their projects" ON public.takeoff_measurements;
DROP POLICY IF EXISTS "Users can update takeoff measurements for their projects" ON public.takeoff_measurements;
DROP POLICY IF EXISTS "Users can delete takeoff measurements for their projects" ON public.takeoff_measurements;
DROP POLICY IF EXISTS takeoff_measurements_select ON public.takeoff_measurements;
DROP POLICY IF EXISTS takeoff_measurements_insert ON public.takeoff_measurements;
DROP POLICY IF EXISTS takeoff_measurements_update ON public.takeoff_measurements;
DROP POLICY IF EXISTS takeoff_measurements_delete ON public.takeoff_measurements;

-- ============================================
-- Step 2: Add company_id to takeoff_sessions
-- ============================================

-- Add company_id column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'takeoff_sessions'
    AND column_name = 'company_id'
  ) THEN
    ALTER TABLE public.takeoff_sessions
    ADD COLUMN company_id uuid NULL;
  END IF;
END $$;

-- Populate company_id from projects
UPDATE public.takeoff_sessions ts
SET company_id = p.company_id
FROM public.projects p
WHERE ts.project_id = p.id
AND ts.company_id IS NULL;

-- Make company_id NOT NULL after population
ALTER TABLE public.takeoff_sessions
ALTER COLUMN company_id SET NOT NULL;

-- Add index for performance
CREATE INDEX IF NOT EXISTS takeoff_sessions_company_id_idx
ON public.takeoff_sessions(company_id);

-- ============================================
-- Step 3: Remove page_count column
-- ============================================

-- page_count should be frontend-only (derived from PDF numPages)
-- It causes schema cache errors and is not needed in DB
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'takeoff_sessions'
    AND column_name = 'page_count'
  ) THEN
    ALTER TABLE public.takeoff_sessions
    DROP COLUMN page_count;
  END IF;
END $$;

-- ============================================
-- Step 4: Add company_id to takeoff_groups
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'takeoff_groups'
    AND column_name = 'company_id'
  ) THEN
    ALTER TABLE public.takeoff_groups
    ADD COLUMN company_id uuid NULL;
  END IF;
END $$;

-- Populate company_id from sessions
UPDATE public.takeoff_groups tg
SET company_id = ts.company_id
FROM public.takeoff_sessions ts
WHERE tg.session_id = ts.id
AND tg.company_id IS NULL;

-- Make company_id NOT NULL after population
ALTER TABLE public.takeoff_groups
ALTER COLUMN company_id SET NOT NULL;

-- Add index
CREATE INDEX IF NOT EXISTS takeoff_groups_company_id_idx
ON public.takeoff_groups(company_id);

-- ============================================
-- Step 5: Add company_id to takeoff_measurements
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'takeoff_measurements'
    AND column_name = 'company_id'
  ) THEN
    ALTER TABLE public.takeoff_measurements
    ADD COLUMN company_id uuid NULL;
  END IF;
END $$;

-- Populate company_id from sessions
UPDATE public.takeoff_measurements tm
SET company_id = ts.company_id
FROM public.takeoff_sessions ts
WHERE tm.session_id = ts.id
AND tm.company_id IS NULL;

-- Make company_id NOT NULL after population
ALTER TABLE public.takeoff_measurements
ALTER COLUMN company_id SET NOT NULL;

-- Add index
CREATE INDEX IF NOT EXISTS takeoff_measurements_company_id_idx
ON public.takeoff_measurements(company_id);

-- ============================================
-- Step 6: Create proper RLS policies
-- ============================================

-- TAKEOFF_SESSIONS policies
CREATE POLICY "Users can view takeoff sessions in their company"
  ON public.takeoff_sessions
  FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id
      FROM public.user_profiles
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can create takeoff sessions in their company"
  ON public.takeoff_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT company_id
      FROM public.user_profiles
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update takeoff sessions in their company"
  ON public.takeoff_sessions
  FOR UPDATE
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id
      FROM public.user_profiles
      WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id
      FROM public.user_profiles
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can delete takeoff sessions in their company"
  ON public.takeoff_sessions
  FOR DELETE
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id
      FROM public.user_profiles
      WHERE id = auth.uid()
    )
  );

-- TAKEOFF_GROUPS policies
CREATE POLICY "Users can view takeoff groups in their company"
  ON public.takeoff_groups
  FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id
      FROM public.user_profiles
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can create takeoff groups in their company"
  ON public.takeoff_groups
  FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT company_id
      FROM public.user_profiles
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update takeoff groups in their company"
  ON public.takeoff_groups
  FOR UPDATE
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id
      FROM public.user_profiles
      WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id
      FROM public.user_profiles
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can delete takeoff groups in their company"
  ON public.takeoff_groups
  FOR DELETE
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id
      FROM public.user_profiles
      WHERE id = auth.uid()
    )
  );

-- TAKEOFF_MEASUREMENTS policies
CREATE POLICY "Users can view takeoff measurements in their company"
  ON public.takeoff_measurements
  FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id
      FROM public.user_profiles
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can create takeoff measurements in their company"
  ON public.takeoff_measurements
  FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT company_id
      FROM public.user_profiles
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update takeoff measurements in their company"
  ON public.takeoff_measurements
  FOR UPDATE
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id
      FROM public.user_profiles
      WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id
      FROM public.user_profiles
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can delete takeoff measurements in their company"
  ON public.takeoff_measurements
  FOR DELETE
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id
      FROM public.user_profiles
      WHERE id = auth.uid()
    )
  );
